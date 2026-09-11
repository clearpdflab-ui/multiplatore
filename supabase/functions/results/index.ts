// Supabase Edge Function — proxy per l'API pubblica di scoretrend.net (F5).
// Nessun secret richiesto: l'API e' pubblica e senza auth (verificato via
// curl diretto, nessun blocco Cloudflare/anti-bot incontrato). Centralizzata
// qui comunque per coerenza architetturale col resto del progetto e per non
// esporre pattern di polling dal client.
//
// GET /results?eventIds=13090114,13090115 -> POST /search/matches [ids...] upstream
// GET /results (senza eventIds)           -> GET /live-event-filtered upstream
//
// Risposta: { data: unknown, error?: string }
// (shape RAW scoretrend; la normalizzazione avviene lato app in resultsFeed.ts)

const ST_BASE = 'https://api.scoretrend.net';

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
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('eventIds');

  try {
    if (idsParam) {
      const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
      const res = await fetch(`${ST_BASE}/search/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids),
      });
      if (!res.ok) {return json({ error: `HTTP ${res.status}`, data: null }, 502);}
      return json({ data: await res.json() });
    }
    const res = await fetch(`${ST_BASE}/live-event-filtered`);
    if (!res.ok) {return json({ error: `HTTP ${res.status}`, data: null }, 502);}
    return json({ data: await res.json() });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), data: null }, 502);
  }
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {return new Response(null, { headers: CORS });}
  return handle(req).catch((e) => json({ error: e instanceof Error ? e.message : String(e), data: null }, 500));
});
