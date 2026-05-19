/**
 * Cloudflare Worker — Stripe Webhook → Firebase Premium License
 * Mon Budget — marquabel.be
 *
 * Variables d'environnement (Cloudflare secrets) :
 *   STRIPE_WEBHOOK_SECRET   — whsec_... (Stripe Dashboard > Webhooks)
 *   FIREBASE_SA_EMAIL       — service account email (xxx@mon-budget-licences.iam.gserviceaccount.com)
 *   FIREBASE_SA_PRIVATE_KEY — clé privée RSA du service account (-----BEGIN PRIVATE KEY-----)
 */

const FIREBASE_DB = 'https://mon-budget-licences-default-rtdb.europe-west1.firebasedatabase.app';

// ── Vérification signature Stripe ──────────────────────────────────────────
async function verifyStripeSignature(body, sigHeader, secret) {
  const parts = sigHeader.split(',');
  let timestamp = '';
  const sigs = [];
  for (const part of parts) {
    const [k, v] = part.trim().split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1') sigs.push(v);
  }
  if (!timestamp || sigs.length === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${body}`));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return sigs.some(s => s === computed);
}

// ── Firebase Custom Token → ID Token (pour ?auth= europe-west1) ───────────
const FIREBASE_API_KEY = 'AIzaSyBB0h8ENURTDyndoVBtsu1i94l_mVZZ23o';
const WEBHOOK_UID = 'webhook-service';

function b64url(data) {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function importKey(pemBody) {
  const keyBytes = Uint8Array.from(atob(pemBody.trim().replace(/\s+/g, '')), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

async function getFirebaseIdToken(saEmail, saKeyBody) {
  // 1. Créer un Firebase Custom Token signé avec la clé privée
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: saEmail,
    sub: saEmail,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    uid: WEBHOOK_UID,
    iat: now,
    exp: now + 3600,
  }));

  const data = `${header}.${payload}`;
  const cryptoKey = await importKey(saKeyBody);
  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(data));
  const customToken = `${data}.${b64url(new Uint8Array(sigBytes))}`;

  // 2. Échanger le Custom Token contre un Firebase ID Token
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firebase signIn error: ${res.status} ${err}`);
  }

  const json = await res.json();
  if (!json.idToken) throw new Error(`No idToken in response: ${JSON.stringify(json)}`);
  return json.idToken; // ID Token utilisable avec ?auth= en europe-west1
}

// ── Firebase REST API ──────────────────────────────────────────────────────
async function fbWrite(path, data, accessToken) {
  const res = await fetch(`${FIREBASE_DB}/${path}.json?auth=${accessToken}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const text = await res.text();
  if (!res.ok) console.error(`fbWrite error [${path}]: ${res.status} ${text}`);
  else console.log(`fbWrite OK [${path}]`);
  return res.ok;
}

async function fbGet(path, accessToken) {
  const res = await fetch(`${FIREBASE_DB}/${path}.json?auth=${accessToken}`);
  if (!res.ok) return null;
  return res.json();
}

// ── Email relay (EmailJS via clé privée serveur) ───────────────────────────
const EMAILJS_API = 'https://api.emailjs.com/api/v1.0/email/send';
const EMAILJS_PUBLIC_KEY = 'HYssriD9mW4FVPYv4';
const EMAILJS_SERVICE_ID = 'mon-budget';

function getCorsHeaders(request) {
  // Accepte budget.marquabel.be ET marquabel-cmd.github.io (dev/test)
  const origin = request.headers.get('Origin') || '';
  const allowed = ['https://budget.marquabel.be', 'https://marquabel-cmd.github.io'];
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function handleEmail(request, env) {
  const cors = getCorsHeaders(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Vérifier token Firebase (l'utilisateur doit être connecté)
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace('Bearer ', '').trim();
  if (!idToken) return new Response('Unauthorized', { status: 401, headers: cors });

  const verifyRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken }) }
  );
  if (!verifyRes.ok) {
    console.error('Firebase token invalid:', await verifyRes.text());
    return new Response('Invalid token', { status: 401, headers: cors });
  }

  let body;
  try { body = await request.json(); } catch { return new Response('Invalid JSON', { status: 400, headers: cors }); }

  if (!env.EMAILJS_PRIVATE_KEY) {
    console.error('EMAILJS_PRIVATE_KEY secret manquant !');
    return new Response('Server config error', { status: 500, headers: cors });
  }

  const ejsRes = await fetch(EMAILJS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:      EMAILJS_SERVICE_ID,
      template_id:     body.template_id,
      user_id:         EMAILJS_PUBLIC_KEY,
      accessToken:     env.EMAILJS_PRIVATE_KEY,
      template_params: body.template_params,
    }),
  });

  const text = await ejsRes.text();
  console.log(`EmailJS response [${body.template_id}]: ${ejsRes.status} ${text}`);
  return new Response(text, { status: ejsRes.ok ? 200 : ejsRes.status, headers: cors });
}

// ── Handler principal ──────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Route /email → relay EmailJS avec clé privée
    if (url.pathname === '/email') return handleEmail(request, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const body = await request.text();
    const sigHeader = request.headers.get('stripe-signature');
    if (!sigHeader) return new Response('Missing signature', { status: 400 });

    const isValid = await verifyStripeSignature(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) return new Response('Invalid signature', { status: 400 });

    let event;
    try { event = JSON.parse(body); }
    catch { return new Response('Invalid JSON', { status: 400 }); }

    const obj = event.data?.object;
    const now = Math.floor(Date.now() / 1000);

    // Firebase ID Token via Custom Token signé (fonctionne avec ?auth= en europe-west1)
    let accessToken;
    try {
      accessToken = await getFirebaseIdToken(env.FIREBASE_SA_EMAIL, env.FIREBASE_SA_PRIVATE_KEY);
    } catch (e) {
      console.error('Firebase token error:', e.message);
      return new Response(`Auth error: ${e.message}`, { status: 500 });
    }

    console.log(`Stripe event: ${event.type}`);

    // ── checkout.session.completed → Activation Premium ──────────────────
    if (event.type === 'checkout.session.completed') {
      const uid = obj.client_reference_id;

      if (!uid) {
        const email = obj.customer_details?.email;
        if (email) {
          const safeEmail = email.replace(/\./g, '_').replace(/@/g, '__at__');
          await fbWrite(`pending_premiums/${safeEmail}`, {
            email, stripeCustomer: obj.customer, paidAt: now,
          }, accessToken);
        }
        return new Response('OK (pending)', { status: 200 });
      }

      const plan = (obj.amount_total || 0) <= 350 ? 'monthly' : 'yearly';

      await fbWrite(`users/${uid}/premium`, true, accessToken);
      await fbWrite(`users/${uid}/stripe`, {
        customer: obj.customer || null,
        subscription: obj.subscription || null,
        plan, activatedAt: now,
        email: obj.customer_details?.email || '',
      }, accessToken);

      if (obj.customer) {
        await fbWrite(`stripe_customers/${obj.customer}`, uid, accessToken);
      }
      console.log(`✅ Premium activated uid=${uid} plan=${plan}`);
    }

    // ── customer.subscription.deleted → Désactivation ────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const uid = await fbGet(`stripe_customers/${obj.customer}`, accessToken);
      if (uid && typeof uid === 'string') {
        await fbWrite(`users/${uid}/premium`, false, accessToken);
        await fbWrite(`users/${uid}/stripe/cancelledAt`, now, accessToken);
        console.log(`❌ Premium cancelled uid=${uid}`);
      }
    }

    // ── invoice.payment_succeeded → Renouvellement ────────────────────────
    if (event.type === 'invoice.payment_succeeded' && obj.customer) {
      const uid = await fbGet(`stripe_customers/${obj.customer}`, accessToken);
      if (uid && typeof uid === 'string') {
        await fbWrite(`users/${uid}/premium`, true, accessToken);
        await fbWrite(`users/${uid}/stripe/renewedAt`, now, accessToken);
        console.log(`🔄 Premium renewed uid=${uid}`);
      }
    }

    return new Response('OK', { status: 200 });
  },
};
