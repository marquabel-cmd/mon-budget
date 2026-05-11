/**
 * Cloudflare Worker — Proxy Groq API
 * Déployer sur : https://dash.cloudflare.com/ → Workers & Pages → Create Worker
 * Ajouter la variable d'environnement secrète : GROQ_API_KEY = gsk_...
 *
 * L'app appelle ce worker, qui relaie vers Groq sans exposer la clé.
 * CORS restreint à ton domaine GitHub Pages.
 */

const ALLOWED_ORIGIN = 'https://marquabel-cmd.github.io';
const GROQ_ENDPOINT  = 'https://api.groq.com/openai/v1/chat/completions';

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

    // Origine autorisée (GitHub Pages uniquement)
    if (!origin.startsWith(ALLOWED_ORIGIN)) {
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
  const allowed = origin.startsWith(ALLOWED_ORIGIN) ? origin : ALLOWED_ORIGIN;
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
