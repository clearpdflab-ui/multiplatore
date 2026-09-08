// Supabase Edge Function — odds-api.io proxy con rotazione multi-account.
//
// Perche' server-side: le chiavi API non devono mai raggiungere il client
// (secret policy §8). Ogni account free vede solo i suoi 2 bookmaker, quindi
// il proxy interroga ogni chiave e unisce i bookmaker osservati.
//
// Secrets (supabase secrets set):
//   ODDS_API_IO_KEYS      = key1,key2,key3      (una per account free)
//   ODDS_API_IO_BOOKIES    = "Snai IT|Eurobet IT;;Goldbet IT|Sisal IT;;..."
//                            (opzionale; libro per chiave, '|' separa, ';;' separa chiavi)
// Se ODDS_API_IO_BOOKIES e' vuoto, il proxy lascia che ogni chiave restituisca
// i bookmaker attualmente selezionati su quell'account.
//
// GET  /odds?eventIds=1,2,3        -> MergeTutti i book per evento
// POST /odds { eventIds: [1,2,3] }  -> idem
//
// Risposta: { data: RawEventOdds[], errors: string[], usedKeys: number }
// (shape RAW odds-api.io; la normalizzazione Totals 3.5 avviene lato app.)

const ODDS_BASE = 'https://api.odds-api.io/v3';

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

function parseKeys(): string[] {
  return Deno.env.get('ODDS_API_IO_KEYS')
    ? Deno.env.get('ODDS_API_IO_KEYS')!.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
}

function parseBookiesPerKey(): string[][] {
  const raw = Deno.env.get('ODDS_API_IO_BOOKIES');
  if (!raw) return [];
  return raw.split(';;').map((chunk) => chunk.split('|').map((b) => b.trim()).filter(Boolean));
}

async function fetchOddsForChunk(key: string, bookies: string[], ids: string[]): Promise<Json[]> {
  const params = new URLSearchParams({ apiKey: key, eventIds: ids.join(','), markets: 'Totals' });
  if (bookies.length > 0) params.set('bookmakers', bookies.join(','));
  const res = await fetch(`${ODDS_BASE}/odds/multi?${params.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const arr = Array.isArray(body) ? body : Array.isArray((body as Json).data) ? (body as Json).data : [];
  return arr as Json[];
}

function mergeEvent(base: Json | undefined, add: Json): Json {
  if (!base) return add;
  const bm = { ...((base.bookmakers ?? {}) as Json), ...((add.bookmakers ?? {}) as Json) };
  return { ...base, bookmakers: bm };
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const keys = parseKeys();
  if (keys.length === 0) return json({ error: 'ODDS_API_IO_KEYS non impostato', data: [] }, 501);

  let eventIds: string[] = [];
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      eventIds = (body.eventIds ?? body.ids ?? []).map(String);
    } catch {
      return json({ error: 'body JSON non valido', data: [] }, 400);
    }
  } else {
    eventIds = (url.searchParams.get('eventIds') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (eventIds.length === 0) return json({ error: 'eventIds obbligatorio', data: [] }, 400);
  const limit = Number(url.searchParams.get('limit') ?? '100');

  const bookiesPerKey = parseBookiesPerKey();
  const chunks: string[][] = [];
  for (let i = 0; i < eventIds.length; i += 10) chunks.push(eventIds.slice(i, i + 10));

  const merged = new Map<string, Json>();
  const errors: string[] = [];
  let usedKeys = 0;

  for (let ki = 0; ki < keys.length; ki++) {
    usedKeys++;
    const bookies = bookiesPerKey[ki] ?? [];
    for (const chunk of chunks) {
      try {
        const rows = await fetchOddsForChunk(keys[ki], bookies, chunk);
        for (const r of rows) {
          const id = String(r.id ?? '');
          if (!id) continue;
          merged.set(id, mergeEvent(merged.get(id), r));
        }
      } catch (e) {
        errors.push(`key#${ki + 1} chunk[${chunk[0]}..]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const data = [...merged.values()].slice(0, limit);
  return json({ data, errors, usedKeys });
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  return handle(req).catch((e) => json({ error: String(e), data: [] }, 500));
});
