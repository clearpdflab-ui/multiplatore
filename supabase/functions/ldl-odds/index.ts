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
// GET /ldl-odds?resource=tokencheck -> health-check auth: { refreshOk,
//   accessTokenExp, fallbackPresent, working } (reporta solo stati, mai token).
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
  // health-check locale (NIENTE in upstream): stato refresh Cognito, mai token.
  'tokencheck',
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

type RefreshResult =
  | { ok: true; token: string }
  | { ok: false; code: string; detail: string };

// Codici tipizzati perche' la UI possa distinguere "token da rinnovare"
// (NOT_AUTHORIZED: login LDL scaduto >30gg) da errori di config o transitori.
function cognitoErrorKind(status: number, body: string): { code: string; detail: string } {
  if (/NotAuthorizedException|refresh token/i.test(body)) {
    return {
      code: 'TOKEN_NOT_AUTHORIZED',
      detail: 'TOKEN: refresh token LDL scaduto/non valido — rifare login su liberidalavoro.it, pescare la chiave refreshToken dal Local Storage e aggiornare il secret LDL_COGNITO_REFRESH_TOKEN (procedura rinnovo in HANDOFF)',
    };
  }
  if (/ResourceNotFoundException/i.test(body)) {
    return { code: 'COGNITO_RESOURCE_NOT_FOUND', detail: 'TOKEN: clientId o pool Cognito errati (controllare LDL_COGNITO_CLIENT_ID / LDL_COGNITO_POOL_ID)' };
  }
  return { code: `COGNITO_${status}`, detail: `TOKEN: refresh Cognito respinto (${status}): ${body.slice(0, 160)}` };
}

async function cognitoRefreshCall(refreshToken: string, clientId: string, region: string): Promise<Response> {
  return fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth' },
    body: JSON.stringify({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    }),
  });
}

async function refreshFromCognito(): Promise<RefreshResult> {
  const refreshToken = Deno.env.get('LDL_COGNITO_REFRESH_TOKEN');
  if (!refreshToken) {
    return { ok: false, code: 'TOKEN_SECRET_MISSING', detail: 'TOKEN: secret LDL_COGNITO_REFRESH_TOKEN non impostato (vedi procedura in HANDOFF)' };
  }
  const clientId = Deno.env.get('LDL_COGNITO_CLIENT_ID') || DEFAULT_CLIENT_ID;
  const poolId = Deno.env.get('LDL_COGNITO_POOL_ID') || DEFAULT_POOL_ID;
  const region = poolId.split('_')[0];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await cognitoRefreshCall(refreshToken, clientId, region);
      if (!res.ok) {
        const body = await res.text();
        console.error('cognito refresh failed', res.status, body);
        // 5xx Cognito: transitorio, un retry.
        if (res.status >= 500 && attempt === 0) {continue;}
        return cognitoErrorKind(res.status, body);
      }
      const parsed = await res.json();
      const access = parsed?.AuthenticationResult?.AccessToken;
      if (typeof access !== 'string') {
        return { ok: false, code: 'COGNITO_NO_TOKEN', detail: 'TOKEN: risposta Cognito senza AccessToken' };
      }
      // ATTENZIONE: se Cognito ruota il refresh token (rotating), il valore nel
      // secret va aggiornato col nuovo; il pool LDL e' configurato static => no.
      cached = { token: access, expiresAt: jwtExpMs(access) || Date.now() + 55 * 60_000 };
      return { ok: true, token: access };
    } catch (e) {
      console.error('cognito refresh network error', e);
      if (attempt === 0) {continue;}
      return { ok: false, code: 'COGNITO_NETWORK', detail: 'refresh Cognito non raggiungibile (transitorio, riprovare)' };
    }
  }
  return { ok: false, code: 'COGNITO_UNKNOWN', detail: 'refresh Cognito fallito' };
}

async function getLdlToken(force = false): Promise<{ token: string | null; refreshIssue: string | null }> {
  if (!force && cached && Date.now() < cached.expiresAt - 60_000) {return { token: cached.token, refreshIssue: null };}
  const fresh = await refreshFromCognito();
  if (fresh.ok) {return { token: fresh.token, refreshIssue: null };}
  const fallback = Deno.env.get('LDL_BEARER_TOKEN') || null;
  return { token: fallback, refreshIssue: fresh.detail };
}

async function ldlFetch(token: string, upstream: string): Promise<Response> {
  return fetch(upstream, { headers: { Authorization: `Bearer ${token}` } });
}

// F9: cache 5' per isolate sui dati lenti-a-variare. L'UI pesca sites+events
// ogni 60s: senza cache sono ~30 chiamate LDL/ora per i soli dati di supporto;
// con la cache diventa ~12/giorno. puntapunta NO (quote live, cambia tutto).
const CACHEABLE_RESOURCES = new Set(['events', 'sites']);
const CACHE_TTL_MS = 5 * 60_000;
const upstreamCache = new Map<string, { body: unknown; expiresAt: number }>();

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const resource = url.searchParams.get('resource') ?? 'events';
  if (!ALLOWED_RESOURCES.has(resource)) {
    return json({ error: `resource non ammessa: ${resource}`, data: null }, 400);
  }

  // Health-check: forza un refresh e riporta SOLO stati (mai il token).
  if (resource === 'tokencheck') {
    cached = null;
    const { token, refreshIssue } = await getLdlToken(true);
    return json({
      data: {
        refreshOk: !refreshIssue,
        refreshIssue: refreshIssue ?? null,
        accessTokenExp: token ? new Date(jwtExpMs(token) || 0).toISOString() : null,
        fallbackPresent: Boolean(Deno.env.get('LDL_BEARER_TOKEN')),
        working: Boolean(token),
      },
    });
  }

  const upstream = new URL(resource, LDL_BASE);
  for (const [k, v] of url.searchParams) {
    if (k === 'resource') {continue;}
    upstream.searchParams.set(k, v);
  }

  const cacheKey = CACHEABLE_RESOURCES.has(resource) ? resource : null;
  if (cacheKey) {
    const hit = upstreamCache.get(cacheKey);
    if (hit && Date.now() < hit.expiresAt) {return json({ data: hit.body, cache: 'hit' });}
  }

  try {
    const first = await getLdlToken();
    let token = first.token;
    if (!token) {
      return json({ error: first.refreshIssue ?? 'nessun token LDL disponibile', data: null }, 501);
    }

    let res = await ldlFetch(token, upstream.toString());
    if (res.status === 401) {
      // token probabilmente scaduto: forza refresh e riprova una volta
      cached = null;
      const second = await getLdlToken(true);
      token = second.token;
      if (token) {
        res = await ldlFetch(token, upstream.toString());
        if (res.status === 401) {
          return json({ error: `TOKEN: LDL ha respinto 401 anche dopo refresh (${second.refreshIssue ?? 'refresh ok'}). Rinnovare i credential LDL.`, data: null }, 401);
        }
      } else {
        return json({ error: `TOKEN: LDL token scaduto/invalido e refresh non riuscito — ${second.refreshIssue ?? 'motivo sconosciuto'}`, data: null }, 401);
      }
    }
    if (!res.ok) {return json({ error: `HTTP ${res.status}`, data: null }, 502);}
    const data = await res.json();
    if (cacheKey) {upstreamCache.set(cacheKey, { body: data, expiresAt: Date.now() + CACHE_TTL_MS });}
    return json({ data });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), data: null }, 502);
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {return new Response(null, { headers: CORS });}
  return handle(req).catch((e) => json({ error: e instanceof Error ? e.message : String(e), data: null }, 500));
});
