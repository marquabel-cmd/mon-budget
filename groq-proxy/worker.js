/**
 * Cloudflare Worker — Proxy Groq API
 * Déployer sur : https://dash.cloudflare.com/ → Workers & Pages → Create Worker
 * Ajouter la variable d'environnement secrète : GROQ_API_KEY = gsk_...
 *
 * L'app appelle ce worker, qui relaie vers Groq sans exposer la clé.
 * CORS autorisé pour tous les domaines de l'app.
 */

const ALLOWED_ORIGINS = [
  'https://budget.marquabel.be',
  'https://marquabel-cmd.github.io',
];
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function isAllowed(origin) {
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o));
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // Réponse aux preflight CORS
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204, origin);
    }

    // Méthode autorisée
    if (request.method !== 'POST') {
      return corsResponse(JSON.stringify({ error: 'Method not allowed' }), 405, origin);
    }

    // Origine autorisée
    if (!isAllowed(origin)) {
      return corsResponse(JSON.stringify({ error: 'Forbidden' }), 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse(JSON.stringify({ error: 'Invalid JSON' }), 400, origin);
    }

    // Relay vers Groq avec la clé secrète stockée côté Worker
    const groqRes = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const data = await groqRes.text();
    return corsResponse(data, groqRes.status, origin);
  },
};

function corsResponse(body, status, origin) {
  // Renvoie l'origine exacte si elle est autorisée, sinon le domaine principal
  const allowedOrigin = isAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
