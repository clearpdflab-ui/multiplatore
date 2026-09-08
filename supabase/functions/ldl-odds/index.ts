// Supabase Edge Function — proxy per l'API "OddsScasser" di liberidalavoro.it
// (servizio a pagamento dell'utente, F5).
//
// Perche' server-side: il Bearer token dell'account non deve mai raggiungere
// il client (secret policy HANDOFF §8). Il proxy inoltra le chiamate GET
// events/coverodds/odds/sites/bestevents aggiungendo l'header Authorization.
//
// Secrets (supabase secrets set):
//   LDL_BEARER_TOKEN = <token copiato da DevTools dopo login su liberidalavoro.it>
//   (va rinnovato a mano quando scade — nessun login automatico in questa fase)
//
// GET /ldl-odds?resource=coverodds&eventIds=1,2,3 -> passthrough JSON da OddsScasser
// resource ammesse: events | odds | coverodds | bestevents | sites
//
// Risposta: { data: unknown, error?: string }
// (shape RAW OddsScasser; la normalizzazione avviene lato app in coverOddsFeed.ts)

const LDL_BASE = 'https://api.ldl-test.eu/v1/oddsscasser/';
const ALLOWED_RESOURCES = new Set(['events', 'odds', 'coverodds', 'bestevents', 'sites']);

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

async function handle(req: Request): Promise<Response> {
  const token = Deno.env.get('LDL_BEARER_TOKEN');
  if (!token) return json({ error: 'LDL_BEARER_TOKEN non impostato', data: null }, 501);

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
    const res = await fetch(upstream.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      return json({ error: 'LDL_BEARER_TOKEN scaduto o non valido (401 da OddsScasser)', data: null }, 401);
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
