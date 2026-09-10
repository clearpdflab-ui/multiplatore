# HANDOFF — Multiplatore a scalare (production)

> Ultimo aggiornamento: 2026-09-08. Stato: F0–F3 + F4a (`ced7b46`) + F5 (`de860ea`) pushati;
> migration F3 `20260907180000` APPLICATA su remote (REST verificato 200 su cycles+tickets).
> Repo: `git@github.com:clearpdflab-ui/multiplatore.git` (branch `main`, tree pulito).
> Progetto Supabase: **Multiplatore a scalare** (`ekzjsltnamndtydodkhx`, West EU).

## 1. Obiettivo

App React+TS per gestione multiple Under/Over 3.5 a scalare: madre + coperture
sequenziali Over-first + lock exchange, con sizing armonizzato, multi-book,
multi-ciclo parallelo, bankroll 3000€ iniziale, target 3000–5000€/mese via throughput.

## 2. Regole metodo (congelate, non negoziabili senza l'utente)

- 1 ticket attivo per path decisionale; coperture CONDIZIONALI (piazzate DOPO l'esito).
- `N_slip` = sole pending → quote/bonus. `N_internal` = confermate+pending → SOLO assicurazione.
- Copertura = `[Over@prossimo_evento_madre] + [N-1 gambe libere]` (restanti o altri match,
  qualsiasi quota, N 1–30). Prima gamba OBBLIGATA a coprire la madre.
- Madre standard: **30 eventi** Under (S0 2–5€, default 2). Refill-30 automatico dopo morte
  precoce (riuso + nuove per tornare a 30).
- Bonus 5–30 eventi (tabella sotto); N<5 → 0%. Bonus valido tutti i campionati (da verificare per book).
- Assicurazione FUORI dal computo: solo rimborso passivo separato, mai nelle formule.
- Mai perdita: pavimento netto ≥ 0, al massimo void. No stop-loss (vietato dall'utente).
- T MAI fisso (da bankroll), unico obbligo mai < 0. U da bankroll (lo determina l'agente).
- Stake sempre formula, mai sotto la neutra (ROUNDUP), floor = max(1.00€, min book), step 0.50€.
- Lock finale = singola exchange @2.75, ESECUZIONE MANUALE su Betfair (no API exchange).
- Un ticket = un solo book. Madre → book miglior bonus; coperture → best fin_b.

## 3. Formula universale v3 (implementata in `src/engine/harmony.ts` + `pyengine/core.py`)

```
fin  = (Π q_i reali) × (1 + min(bonus_b(N), cap_b)/100)
s*   = (S + B + T(d)) / (fin − 1)
s    = ROUNDUP(max(s*, min_stake)) a 0.50, floor 1.00€
T(d) = min(max(T_br, ρ·S), T_max) ; T_br = τ×B0 (τ=1.5% default → 45€ su 3000€)
B    = riserva bleed EV (expectedBleed, p=0.6944) — MAI worst-case (diverge: Σ1/fin>1, dimostrato)
S_max lock = s_cap×(lockFin−1) − T − B  → oltre questa soglia: lock/terminazione forzati
Scala: T pieno → T' ridotto → N corto (terminazione) → lock → stop (null, mai perdita forzata)
```

Risultati verificati: catena-15 tutta piazzabile (lock 122€ ≤ cap), ogni netto pre-bleed ≥45€,
rollover M2 = 195.46€ (motore) / 96.73€ con floor Excel 0.50 (obsoleto, vedi §7).

## 4. Decisioni prese (log Q&A)

- Terminazione libera: N 1–30, nessuna quota minima. T' a scaletta da definire.
- Tetti parallelo/bankroll: n_max = min(6, floor(B0/(2×C_worst))), U = n×C/B0.
- Riuso squadre automatico, refill a 30, no review gate. Correlation guard su esposizione resta.
- T da bankroll (τ), U da bankroll (regola sopra). Default proposti NON ancora confermati:
  τ=1.5%, ρ=0 (default implementato), fattore 2×, opcap 6, s_cap=150€, S0=2€, α-early (non implementato).
- Book main: cap bonus 500%, min stake 1€ (operativo 2–5€). Cover su book diversi per quote.
- Sezione Book gestionale IN APP (CRUD+versioni+CSV), versionamento append-only, rollback = nuova versione.
- Excel ELIMINATO dal repo (commit 4236ac5); calcoli in `pyengine/`. Niente più openpyxl.
- ~~odds-api.net~~ → **odds-api.io** (scelta 2026-09-07, vedi §9): SDK TS+Python,
  mock mode, comparison. Key `.env` `THE_ODDS_API_KEY` = **the-odds-api.com**
  (VERIFICATO 2026-09-07: 200 lì, 401 su odds-api.io/net) → non riusarla per odds-api.io.

## 5. Stack e ambiente (verificati)

Node 24.11, npm 11.2, git 2.51, Supabase CLI 2.116.0 (path npm:
`C:\Users\Quixel\AppData\Roaming\npm\supabase.exe`; system32 ha la vecchia 2.98.2),
gh (account attivo Quixelone; **Btcwheel VIETATO per questo progetto**),
Vercel CLI 50.37, Python 3.13.2, pytest 9.1.1, openpyxl 3.1.5 (non più usato).
OS win32, shell pwsh. Push via **deploy key SSH repo-scoped**
(`~/.ssh/multiplatore_clearpdflab`, core.sshCommand repo-locale, remote SSH).

## 6. Stato lavori (tutto pushato su origin/main)

- F0: .env ripulito (parser Supabase ok), link progetto verificato, .gitignore standard,
  9 config resuscitati, orfano build_excel.py rimosso, npm install, CLI aggiornata,
  VITE_SUPABASE_URL+ANON in .env.
- F1: migration `supabase/migrations/20260907134515_create_books_and_bonus.sql`
  (tabelle books + book_bonus_versions + RLS + seed Main) APPLICATA e verificata via REST.
  Motore `src/engine/books.ts` (tabella validata, cap, selectBestBook) + `bonus.ts` compat.
  UI sezione **Book & Bonus** (`BooksManager`, `useBooks`, nav Header/Footer) + client supabase.
  Test: 18 engine + 18 harmony = **36/36 verdi**, tsc pulito.
- F2: `src/engine/harmony.ts` (sizing, catena riferimento, audit TRUE, T/U bankroll, void,
  fallback ladder, ledger math). Trovati e fixati: off-by-one gambe coperture; riserva
  worst-case divergente → neutral+EV. Floor motore 1.00€ (book min).
- Excel: rimosso. `pyengine/` (model+core+cli+tests, stdlib, 9/9 test) = riferimento calcolo.

## 7. File chiave

- `src/engine/harmony.ts`, `books.ts`, `dutching.ts` (floor 1.00), `index.ts`
- `pyengine/model.py`, `core.py`, `cli.py`, `tests/test_core.py`
- `src/components/BooksManager.tsx`, `src/hooks/useBooks.ts`, `src/services/supabaseClient.ts`
- `supabase/migrations/20260907134515_create_books_and_bonus.sql`
- F3 (pushata `b3723a1`): `supabase/migrations/20260907180000_create_cycles_and_tickets.sql`,
  `src/engine/cycles.ts`, `tests/unit/cycles.test.ts`, `src/hooks/useCycles.ts`,
  `src/hooks/useAuth.ts`, `src/components/CyclesDashboard.tsx`, `src/components/AuthBar.tsx`
- F4a (locale): `src/engine/oddsFeed.ts`, `src/data/mockOdds.ts`, `tests/unit/oddsFeed.test.ts`,
  `src/services/oddsApi.ts`, `supabase/functions/odds/index.ts`
- Comandi: `npx vitest run` · `npx tsc --noEmit` · `python -m pytest pyengine/tests -q` ·
  `python -m pyengine.cli chain --n 30` · supabase: serve `SUPABASE_ACCESS_TOKEN` da
  `.env:SUPABASE_TOKEN_ACCESS` nell'env di shell prima dei comandi.

## 8. Secret policy (obbligatoria)

MAI stampare/inccollare valori secret in chat o tool-output. Nomi ammessi. `.env` è
gitignored. service_role solo server-side. Deploy key solo per questo repo.

## 9. Da fare (F3 committata+pushata `b3723a1`; F4a in locale 2026-09-07)

- **F3 cicli UI — FATTO in locale** (locale-first + auth minimale, da committare):
  migration `supabase/migrations/20260907180000_create_cycles_and_tickets.sql`
  (tabelle cycles + tickets + RLS, CREATA e APPLICATA su remote 2026-09-08);
  `src/engine/cycles.ts` (refill-30, shared-leg guard, exposure summary,
  gambe terminazione) + `tests/unit/cycles.test.ts` (**7/7 verdi**);
  tipi Cycle/CycleTicket + ViewMode 'cycles' (`src/types.ts`);
  `src/hooks/useCycles.ts` (localStorage-first, 1 ticket attivo/ciclo,
  void gamba/ticket, top-up bankroll, refill-30, sync Supabase best-effort);
  `src/hooks/useAuth.ts` + `src/components/AuthBar.tsx` (login email/pw minimale);
  `src/components/CyclesDashboard.tsx` (exposure meter, shared-leg conflicts,
  ledger ticket W/L/V, void singola gamba, piazza ticket con preview sizing,
  calcolatore terminazione full→N corto→lock→stop, top-up, refill-30,
  chiudi/elimina); nav Header/Footer/App; shim `src/types/lucide-react.d.ts`
  esteso (LogIn/LogOut/User/Ban/Wallet/Repeat).
  Verifiche: `tsc` pulito, `vitest` **43/43**, `vite build` OK.
- **F4 — decisione servizio (2026-09-07, utente)**: si usa **odds-api.io**
  (https://docs.odds-api.io, base `https://api.odds-api.io/v3`, auth `?apiKey=`).
  Free tier: **2 bookmaker/account, 100 req/h, 500 req/giorno** → fino a 6 book con
  3 account free. `/odds/multi` = 1 chiamata fino a 10 eventi (chiave del budget):
  sweep completo 30 eventi × 1 account = 3 chiamate → ~166 sweep/giorno.
  Book IT disponibili: Snai IT, Eurobet IT, Goldbet IT, Sisal IT, Planetwin365 IT,
  Lottomatica IT, BetFlag IT, 888Sport IT... **Partenza decisa: 2 book
  (Snai IT + Eurobet IT)** su 1 account, architettura già pronta a 3 chiavi.
  ⚠ VERIFICATO: `THE_ODDS_API_KEY` in `.env` appartiene a **the-odds-api.com**
  (HTTP 200; su odds-api.io e odds-api.net dà 401) → va trattata come servizio
  diverso/unused. Le chiavi odds-api.io si impostano SOLO server-side:
  `supabase secrets set ODDS_API_IO_KEYS=key1,key2,key3` (+ opzionale
  `ODDS_API_IO_BOOKIES="Snai IT|Eurobet IT;;..."`; selection per-account è su
  odds-api.io, endpoint `/bookmakers/selected`).
- **F4a — FATTO in locale (non committato)**: `src/engine/oddsFeed.ts`
  (normalize Totals @line, best-across-book, findRegistryBook ↔ Book.apiBookKey,
  planSweep budget) + `src/data/mockOdds.ts` (shape docs, buco 3.5 gestito) +
  `tests/unit/oddsFeed.test.ts` (9/9, totale **52/52**); Edge Function
  `supabase/functions/odds/index.ts` (proxy multi-chiave server-side, merge
  bookmakers, chunk 10, CORS; NON deployata); client `src/services/oddsApi.ts`
  (POST edge → fallback mock). tsc pulito.
- **F4b (prossimo)**: deploy Edge Function + chiavi nel `.env`/secrets (utente),
  comparatore book live nel Calendario (ingest `/events`→eventIds→oddsFeed),
  import quote nelle schedine, Gemini, lock manuale (istruzione calcolata).
- **Nota 2026-09-07 (lavoro parallelo)**: apparsi su origin/main `ef44492`
  (parity rho default pyengine↔harmony) e `3f85c91` (green-up back+lay per LOCK,
  solo Python: `lay_stake_for_green`, `green_profit`, `back_stake_for_target_green`
  + sottocomando `lock` in `pyengine/cli.py`). NON ancora cablato in
  build_chain/resolve_fallback: serve matching update di `harmony.ts` per parità
  TS/Python (task aperto, posteriore a F3). Nessun conflitto con i file F3.
- **F4**: ingest odds-api.net (Edge Function SDK TS + mock test), comparatore book live,
  Gemini, lock manuale (istruzione calcolata). Verificare servizio della key in .env.
- **F6**: rimuovere Express (`server/`) + proxy `/api`, full test/lint.
- **F7**: deploy Vercel (collegare repo GitHub per auto-deploy, o CLI con login utente).
- **Aperto**: conferma default numerici (§4); T&C per book (via UI, campi già pronti);
  T' scaletta terminazione; α-early sì/no; payout-cap reali.

## 10. Contesto conversazione

Discussione lunga su: metodo multipla a scalare, tabelle bonus/assicurazione fornite
dall'utente, validazione EV, dimensionamento stake, throughput 100/ciclo/sett,
parallelismo e correlazione, bleed dei ticket intermedi (scoperta chiave),
terminazione, restart refill-30, no-loss/no-stop-loss, sezione Book, audit script,
servizio odds (odds-api.io), setup F0/F1/F2 con credenziali già in `.env`
(SUPABASE_TOKEN_ACCESS, THE_ODDS_API_KEY, GEMINI_API_KEY, VITE_*).

## F5 — OddsScasser (liberidalavoro.it) + risultati live (scoretrend.net) — M1–M3 FATTO in locale

**Piano approvato**: C:\Users\Quixel\.claude\plans\snug-beaming-music.md

### Stato
- Fonti esterne confermate via curl diretto (non assunte):
  - **liberidalavoro.it / OddsScasser**: base reale **`https://api.liberidalavoro.it/v1/oddsscasser/*`**
    (VERIFICATO 2026-09-09: 200 con dati reali su `sites` e `events`), Bearer-token auth (401 senza
    token, verificato). `https://api.ldl-test.eu/` (usato inizialmente in `ldl-odds/index.ts`) è
    **SBAGLIATO per produzione**: è solo il fallback dev del bundle del sito quando
    `hostname.includes("localhost")` (funzione `Lm()` in `main.<hash>.js`); in produzione il sito
    stesso usa `api.{hostname}` → `api.liberidalavoro.it`. Rotte reali enumerate dal bundle JS: `events`, `odds`,
    `coverodds`, `bestevents`, `sites` (+ `bonuses*`, `multiples*`, `rollovers`, `singles*`, non
    usate in F5). `coverodds` è il target diretto per "quote migliori per le coperture". Auth:
    Cognito **access token** (non id token) via `Authorization: Bearer`, JWKS
    `https://cognito-idp.eu-central-1.amazonaws.com/<userPoolId>/.well-known/jwks.json`, scade
    e va rinnovato a mano da DevTools (nessun refresh automatico in questa fase).
  - **scoretrend.net**: API pubblica, nessuna auth. `GET /live-event-filtered` (live scores),
    `POST /search/matches` con body **array di stringhe** id (non oggetto, non int) →
    `time_status` (0/1/3), `ss` "H-A". sofascore (403 Cloudflare) e diretta.it/flashscore (418)
    scartati: non richiamabili server-side.
- **M1 — quote LDL (FATTO)**: `src/engine/coverOddsFeed.ts` (normalize eventi+sites@line,
  `bestCoverSide`, mappatura stati italiani `normalizeLdlStatus`; shape `RawLdlEvent` presa
  dal dump reale dell'utente, shape `sites`/`coverodds` da confermare contro l'API autenticata
  reale — normalizzatore scritto tollerante/difensivo apposta) + `src/data/mockCoverOdds.ts`
  (incl. caso `sites: null` come nel dump reale) + `tests/unit/coverOddsFeed.test.ts` (7/7).
  Edge Function `supabase/functions/ldl-odds/index.ts` (proxy GET events/odds/coverodds/
  bestevents/sites, header `Authorization: Bearer $LDL_BEARER_TOKEN`, 401 esplicito se
  token assente/scaduto; **DEPLOYATA e VERIFICATA end-to-end 2026-09-09**, `resource=events`
  e `resource=sites` rispondono 200 con dati reali). Client `src/services/ldlOddsApi.ts`
  (fetch edge → fallback mock, riusa `findRegistryBook` da `oddsFeed.ts` per i nomi book).
- **M2 — risultati scoretrend (FATTO)**: `src/engine/resultsFeed.ts` (`parseScoreString` "H-A",
  `normalizeMatchTimeStatus` 0/1/3 con default prudente `'live'` sui codici non mappati,
  `isOverLine`, `matchEventByTeams` match esatto per nome squadra normalizzato — ambiguo/nessun
  match → null, nessun campo orario affidabile nello schema osservato per disambiguare) +
  `src/data/mockResults.ts` + `tests/unit/resultsFeed.test.ts` (10/10). Edge Function
  `supabase/functions/results/index.ts` (proxy pubblico, nessun secret; NON deployata). Client
  `src/services/resultsApi.ts`.
- **M3 — aggancio dati/UI (FATTO)**: `TicketLeg`/`CycleMotherEvent` estesi con
  `externalEventId?`/`ldlEventId?` (`src/types.ts`, dentro JSONB, nessuna migration). In
  `CyclesDashboard.tsx`, sezione "Piazza ticket" ora ha un pannello "Quote suggerite
  (liberidalavoro.it)" (bottone manuale `Aggiorna quote LDL`, mai polling automatico) con
  bottoni U/O per riga che aggiungono la gamba precompilata e risolvono `externalEventId` via
  scoretrend in background (best-effort, silenzioso se ambiguo/non trovato).
- Verifiche fatte: `npx vitest run` **69/69 verdi** (52 pre-F5 + 17 nuovi), `npx tsc --noEmit`
  pulito. Verificato anche contro l'API reale (2026-09-09, vedi sotto), non ancora fatto
  `vite build`/test manuale in UI con dati LDL live.
- **COMMITTATO**: F4a → `ced7b46`, F5 → `de860ea`, entrambi pushati su origin/main.

### F4b — deploy Edge Functions: fatto, con un blocco residuo (2026-09-09)
Tutte e tre le Edge Function sono deployate su `ekzjsltnamndtydodkhx` e verificate via curl:
- `results` (scoretrend.net): nessun secret richiesto, 200 subito.
- `ldl-odds`: **risolto un bug reale** — `LDL_BASE` puntava a `https://api.ldl-test.eu/` (fallback
  dev del sito, usato quando `hostname.includes("localhost")` nel bundle JS di liberidalavoro.it),
  mentre l'host di produzione vero è `https://api.liberidalavoro.it/` (bundle: `Lm()` → `"https://api."+hostname+"/"`).
  Corretto in `supabase/functions/ldl-odds/index.ts`, riddeployato, secret `LDL_BEARER_TOKEN`
  aggiornato con un access token Cognito valido, verificato end-to-end (200 con dati reali su
  `resource=events` e `resource=sites` passando dalla Edge Function, non solo diretto su LDL).
  La shape di `coverodds` e' stata nel frattempo confermata e cablata (vedi F5c). Il token va **rinnovato a mano** quando scade (nessun refresh
  automatico) — riprendere la procedura DevTools se torna 401.
- `odds` (odds-api.io): **bloccato indefinitamente** — le registrazioni free-tier di odds-api.io
  sono sospese a tempo indeterminato (dichiarato dall'utente 2026-09-09). Nessuna azione
  possibile finché non si sblocca la registrazione o si trova un'alternativa; il fallback mock
  lato client resta attivo.

### F5c — Shape coverodds/odds CONFERMATA + pipeline feed riscritta (2026-09-10)

**Verifica reali** (via Edge Function deployata, token server-side — dump utente + curl):
- `GET /coverodds` **senza** `eventId` → 400; **con** `eventId&selection="Over 3.5"` →
  lista PIATTA di offerte (alternative di copertura per quel lato). La shape
  `{event, odds[], rating}` (dump utente) arriva da **`/bestevents`**, i cui parametri
  completi NON sono ancora stati replicati (calleda senza date → 200 vuoto; con date
  ISO `toISOString()` → ancora 0 items: mancano campi del form di ricerca, vedi bundle
  `main.dc841c5e.js`: sports/sites1/leaguesIds/eventsIds/size/page/dateFrom/dateTo ISO).
- `GET /odds?eventId=X` → 200, ~660 offerte piatte ALL markets × ~45 siti (U/O 3.5 inclusi).
- `GET /sites` → 95 siti con `id→name` + `type`: `bookmaker` (attivi), `bookmaker_removed`,
  `bookmaker_hidden`, `exchange` (Betfair id 6, Betflag id 9, "Broker" id 7). 57/95 INATTIVI.
- `GET /events` → 917 eventi con metadati veri (datetime/league/status/score), `sites:null`.

**Feed del Calendario adesso è**: `/events` (metadati) + `/sites` (nomi+flag) +
`/odds?eventId` sugli eventi prossimi (cap `ODDS_FETCH_LIMIT=40`, concurrency 4) →
`normalizeEventsFeed` in `src/engine/coverOddsFeed.ts`. Nomi book risolti via index;
siti non-`bookmaker` esclusi (`collectInactiveSiteIds`). `RawLdlEvent` campi chiave ora
nullable (l'API reale manda null). Mock aggiornati alla shape vera (`MOCK_LDL_COVERODDS`,
`MOCK_LDL_SITES`, `MOCK_LDL_COVER_EVENTS`). Verifica end-to-end dal vivo: Fenerbahce-Roma
U:Bet365@1.57 O:Bwin@2.5, 34-36 book attivi/evento. Test **83/83**, tsc pulito, build OK.

**Aperto (aggiornato ore 14:35)**: L'endpoint giusto era **`/puntapunta`** (query reale
dell'utente: sites1=madre, sites2PuntaPunta=coperture, selections=Under+Over 3.5,
oddsMin/Max, dateTo ISO, order=rating). Confermato via Edge Function **rideployata** con
`puntapunta|puntabanca` in whitelist: stessi item del dump, rating server-side. Aggiunti:
`CoverOddsRow.rating`, `fetchCoverSuggestions()` in `ldlOddsApi.ts` (merge sites+events,
sort rating desc — smoke dal vivo: 15 righe, es. Montpellier-Pau U:Lottomatica@1.25
O:Sisal@3.75 [0.9167]). `bestevents` non serve piu`. Test **84/84**, tsc pulito, build OK.
**Deciso con l'utente**: il pannello "Coperture suggerite" di CyclesDashboard usa
`fetchCoverSuggestions` (siti 16→23 e fascia 1.25–1.49 come costanti in cima al
componente, migrazione alla sezione Book rimandata); il Calendario resta su
`fetchCoverOdds` (/odds per-event). UI mostra badge rating + lega/kickoff.

### F5b — CalendarOddsMonitor ricollegato a dati reali (2026-09-10)
Bug segnalato dall'utente: la vista "Calendario" mostrava partite inventate che non si
aggiornavano mai. Causa: `CalendarOddsMonitor.tsx` + `src/services/fixturesService.ts` erano
completamente scollegati dall'integrazione LDL (F4b/F5) — usavano un elenco hardcoded di ~26
partite fittizie (`generateRealOfficialFixtures()`), cacheato per sempre in `localStorage`,
con quote sintetiche a 5 bookmaker fissi derivate per aritmetica e una simulazione di gol via
`setInterval`. Nessuna fetch di rete.

Fix: `CalendarOddsMonitor.tsx` riscritto per usare `fetchCoverOdds()` (stesso client di
`CyclesDashboard.tsx`), con refresh manuale + auto-refresh reale ogni 60s. Estesa
`src/engine/coverOddsFeed.ts` (`CoverOddsRow`) con `homeScore`/`awayScore`/`totalGoals`/
`lineStatus` (passthrough dai punteggi reali già presenti in `RawLdlTeam.score`, prima
scartati). Filtri lega/stato ora dinamici sui dati reali (nessun `leagueId`/round hardcoded).
Copertura bookmaker per riga variabile (`row.books`, non più 5 fissi), aggio calcolato per
libro reale via `calculateBookmakerAggio`. Import in Schedina Madre usa `bestCoverSide()` per
scegliere la quota migliore osservata per lato; righe senza copertura completa non sono
selezionabili.

Eliminato `src/services/fixturesService.ts` (nessun altro importatore). Rimossi da
`src/types.ts` i tipi morti `FixtureMatch`, `BookmakerQuote`, `BookmakerId`.

Verifiche fatte: `npx tsc --noEmit` pulito, `npx vitest run` **72/72 verdi** (10 in
`coverOddsFeed.test.ts`, inclusi i nuovi casi su score/lineStatus). Smoke test manuale in
browser non completato in questa sessione (tool di automazione Chrome non funzionante su
`localhost:3000`/`127.0.0.1:3000` — errore indipendente dall'app, server verificato via
`curl` con risposta 200). **Da verificare manualmente dall'utente**: aprire il Calendario con
`npm run dev`, confermare partite reali (non più Fiorentina-Torino/Juventus-Milan), controllare
Network tab per confermare che il bottone "Aggiorna Ora"/auto-refresh rifanno la fetch, e
testare import di una partita con copertura completa nella Schedina Madre.

### Fuori scope in F5 (rimandato, dipende da questo)
Agente cron auto-copertura (F6, richiede `pg_cron`/`pg_net`, nessun precedente nel repo) e
riempimento assistito schedina via browser automation (book-per-book, ispezione live di
Snai/Eurobet/BetFlag — non fattibile "alla cieca"). Piazzamento resta sempre a conferma
manuale dell'utente.