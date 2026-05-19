/**
 * Cloudflare Worker — Stripe Webhook → Firebase Premium License
 * Mon Budget — marquabel.be
 *
 * Événements Stripe gérés :
 *   - checkout.session.completed  → active Premium
 *   - customer.subscription.deleted → désactive Premium
 *   - invoice.payment_succeeded    → renouvellement (keepalive)
 *
 * Variables d'environnement (Cloudflare secrets) :
 *   STRIPE_WEBHOOK_SECRET  — whsec_... (depuis Stripe Dashboard > Webhooks)
 *   FIREBASE_DB_SECRET     — secret Firebase (Project settings > Service accounts > Database secrets)
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

  // Protection replay attack : max 5 minutes de tolérance
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const enc = new TextEncoder();
  const signedPayload = `${timestamp}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return sigs.some(s => s === computed);
}

// ── Firebase REST API helpers ──────────────────────────────────────────────
async function fbWrite(path, data, secret) {
  const res = await fetch(`${FIREBASE_DB}/${path}.json?auth=${secret}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`fbWrite error ${path}: ${res.status} ${text}`);
  }
  return res.ok;
}

async function fbGet(path, secret) {
  const res = await fetch(`${FIREBASE_DB}/${path}.json?auth=${secret}`);
  if (!res.ok) return null;
  return res.json();
}

// ── Handler principal ──────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    // CORS preflight (au cas où)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // Lire le body en texte (nécessaire pour la vérification de signature)
    const body = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    if (!sigHeader) {
      console.error('Missing stripe-signature header');
      return new Response('Missing signature', { status: 400 });
    }

    // Vérifier la signature Stripe
    const isValid = await verifyStripeSignature(body, sigHeader, env.STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error('Invalid Stripe signature');
      return new Response('Invalid signature', { status: 400 });
    }

    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const obj = event.data?.object;
    const now = Math.floor(Date.now() / 1000);

    console.log(`Stripe event: ${event.type}`);

    // ── checkout.session.completed → Activation Premium ──────────────────
    if (event.type === 'checkout.session.completed') {
      const uid = obj.client_reference_id;

      if (!uid) {
        // Paiement sans UID Firebase (user non connecté au moment du clic)
        // On stocke par email pour résolution manuelle ou future
        const email = obj.customer_details?.email;
        if (email) {
          const safeEmail = email.replace(/\./g, '_').replace(/@/g, '__at__');
          await fbWrite(`pending_premiums/${safeEmail}`, {
            email,
            stripeCustomer: obj.customer || null,
            stripeSubscription: obj.subscription || null,
            paidAt: now,
          }, env.FIREBASE_DB_SECRET);
          console.log(`Premium pending (no UID) for email=${email}`);
        }
        return new Response('OK (pending)', { status: 200 });
      }

      // Déterminer le plan (montant en centimes : 299 = mensuel, 2499 = annuel)
      const amount = obj.amount_total || 0;
      const plan = amount <= 350 ? 'monthly' : 'yearly';

      // Activer Premium : /users/{uid}/premium = true
      await fbWrite(`users/${uid}/premium`, true, env.FIREBASE_DB_SECRET);

      // Stocker les infos Stripe pour gestion future (annulation, etc.)
      await fbWrite(`users/${uid}/stripe`, {
        customer: obj.customer || null,
        subscription: obj.subscription || null,
        plan,
        activatedAt: now,
        email: obj.customer_details?.email || '',
      }, env.FIREBASE_DB_SECRET);

      // Mapping inverse customer → uid (pour gérer l'annulation)
      if (obj.customer) {
        await fbWrite(`stripe_customers/${obj.customer}`, uid, env.FIREBASE_DB_SECRET);
      }

      console.log(`✅ Premium activated uid=${uid} plan=${plan} customer=${obj.customer}`);
    }

    // ── customer.subscription.deleted → Désactivation Premium ────────────
    if (event.type === 'customer.subscription.deleted') {
      const customerId = obj.customer;
      const uid = await fbGet(`stripe_customers/${customerId}`, env.FIREBASE_DB_SECRET);

      if (uid && typeof uid === 'string') {
        // Désactiver Premium : /users/{uid}/premium = false
        await fbWrite(`users/${uid}/premium`, false, env.FIREBASE_DB_SECRET);

        // Mettre à jour les infos Stripe
        await fbWrite(`users/${uid}/stripe/cancelledAt`, now, env.FIREBASE_DB_SECRET);
        await fbWrite(`users/${uid}/stripe/active`, false, env.FIREBASE_DB_SECRET);

        console.log(`❌ Premium cancelled uid=${uid} customer=${customerId}`);
      } else {
        console.warn(`subscription.deleted: no uid found for customer=${customerId}`);
      }
    }

    // ── invoice.payment_succeeded → Renouvellement abonnement ────────────
    if (event.type === 'invoice.payment_succeeded') {
      const customerId = obj.customer;
      if (!customerId) return new Response('OK', { status: 200 });

      const uid = await fbGet(`stripe_customers/${customerId}`, env.FIREBASE_DB_SECRET);
      if (uid && typeof uid === 'string') {
        // S'assurer que Premium est toujours actif après renouvellement
        await fbWrite(`users/${uid}/premium`, true, env.FIREBASE_DB_SECRET);
        await fbWrite(`users/${uid}/stripe/renewedAt`, now, env.FIREBASE_DB_SECRET);
        console.log(`🔄 Premium renewed uid=${uid}`);
      }
    }

    return new Response('OK', { status: 200 });
  },
};
