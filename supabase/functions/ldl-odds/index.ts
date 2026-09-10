// Supabase Edge Function — proxy per l'API "OddsScasser" di liberidalavoro.it
// (servizio a pagamento dell'utente, F5).
//
// Perche' server-side: il token non deve mai raggiungere il client (secret
// policy HANDOFF §8). Il proxy inoltra le chiamate GET aggiungendo
// Authorization: Bearer <access token Cognito>.
//
// Auto-refresh (2026-09-10): l'access token Cognito scade ~1h. Se e' impostato
// LDL_COGNITO_REFRESH_TOKEN, la funzione rinnova da sola via InitiateAuth
// REFRESH_TOKEN_AUTH (API pubblica Cognito, nessuna firma richiesta). Altrimenti
// usa LDL_BEARER_TOKEN statico (fallback manuale, scadendo dà 401 in UI).
//
// Secrets (supabase secrets set):
//   LDL_COGNITO_REFRESH_TOKEN = <dal localStorage del browser, chiave ...refreshToken>
//   LDL_COGNITO_CLIENT_ID     = <default: client productione liberidalavoro.it>
//   LDL_COGNITO_POOL_ID       = <default: eu-central-1_Gaq47fVqf>
//   LDL_BEARER_TOKEN          = <access token copiato a mano (solo fallback)>
//
// GET /ldl-odds?resource=puntapunta&... -> passthrough JSON da OddsScasser
// resource ammesse: events | odds | coverodds | bestevents | sites | puntapunta | puntabanca
//
// Risposta: { data: unknown, error?: string }
// (shape RAW OddsScasser; la normalizzazione avviene lato app in coverOddsFeed.ts)

const LDL_BASE = 'https://api.liberidalavoro.it/v1/oddsscasser/';
const ALLOWED_RESOURCES = new Set([
  'events',
  'odds',
  'coverodds',
  'bestevents',
  'sites',
  // ricerca coperture (GET con parametri dal form del sito, conferma 2026-09-10):
  'puntapunta',
  'puntabanca',
]);

const DEFAULT_POOL_ID = 'eu-central-1_Gaq47fVqf';
const DEFAULT_CLIENT_ID = '7tbdal5hjeth0oq9nlifs5m8e0';

type Json = Record<string, unknown>;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ---- Cognito refresh ----

let cached: { token: string; expiresAt: number } | null = null;

function jwtExpMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function refreshFromCognito(): Promise<string | null> {
  const refreshToken = Deno.env.get('LDL_COGNITO_REFRESH_TOKEN');
  if (!refreshToken) return null;
  const clientId = Deno.env.get('LDL_COGNITO_CLIENT_ID') || DEFAULT_CLIENT_ID;
  const poolId = Deno.env.get('LDL_COGNITO_POOL_ID') || DEFAULT_POOL_ID;
  const region = poolId.split('_')[0];
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  });
  if (!res.ok) {
    console.error('cognito refresh failed', res.status, await res.text());
    return null;
  }
  const body = await res.json();
  const access = body?.AuthenticationResult?.AccessToken;
  if (typeof access !== 'string') return null;
  // ATTENZIONE: se Cognito ruota il refresh token (rotating), il valore nel
  // secret va aggiornato col nuovo; il pool LDL e' configurato static => no.
  cached = { token: access, expiresAt: jwtExpMs(access) || Date.now() + 55 * 60_000 };
  return access;
}

async function getLdlToken(force = false): Promise<string | null> {
  if (!force && cached && Date.now() < cached.expiresAt - 60_000) return cached.token;
  const fresh = await refreshFromCognito();
  if (fresh) return fresh;
  return Deno.env.get('LDL_BEARER_TOKEN') || null;
}

async function ldlFetch(token: string, upstream: string): Promise<Response> {
  return fetch(upstream, { headers: { Authorization: `Bearer ${token}` } });
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') ?? 'events';
  if (!ALLOWED_RESOURCES.has(resource)) {
    return json({ error: `resource non ammessa: ${resource}`, data: null }, 400);
  }

  const upstream = new URL(resource, LDL_BASE);
  for (const [k, v] of url.searchParams) {
    if (k === 'resource') continue;
    upstream.searchParams.set(k, v);
  }

  try {
    let token = await getLdlToken();
    if (!token) return json({ error: 'nessun token LDL: imposta LDL_COGNITO_REFRESH_TOKEN (o LDL_BEARER_TOKEN)', data: null }, 501);

    let res = await ldlFetch(token, upstream.toString());
    if (res.status === 401) {
      // token probabilmente scaduto: forza refresh e riprova una volta
      cached = null;
      token = await getLdlToken(true);
      if (token) {
        res = await ldlFetch(token, upstream.toString());
        if (res.status === 401) {
          return json({ error: 'LDL token scaduto/invalido (401 anche dopo refresh): rinnovare LDL_COGNITO_REFRESH_TOKEN', data: null }, 401);
        }
      } else {
        return json({ error: 'LDL_BEARER_TOKEN scaduto o non valido (401 da OddsScasser)', data: null }, 401);
      }
    }
    if (!res.ok) return json({ error: `HTTP ${res.status}`, data: null }, 502);
    const data = await res.json();
    return json({ data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), data: null }, 502);
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  return handle(req).catch((e) => json({ error: e instanceof Error ? e.message : String(e), data: null }, 500));
});
