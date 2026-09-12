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
`fetchCoverOdds` (/odds per-event) — **poi sostituito in F5d**. UI mostra badge rating + lega/kickoff.

### F5d — Auto-refresh Cognito + Calendario su /puntapunta (2026-09-10, post-15:00)

- **Causa "poche partite"**: LDL_BEARER_TOKEN (access token Cognito) scaduto ~1h → 401
  su tutto → fallback mock (4 eventi). L'utente ha incollato in chat un nuovo access
  token (valido 24h, exp ~2026-11? no: 24h) — impostato come `LDL_BEARER_TOKEN`.
  **Va comunque sostituito con il VERO refresh token** (localStorage LDL, chiave
  `CognitoIdentityServiceProvider.7tbdal5hjeth0oq9nlifs5m8e0.<user>.refreshToken`) →
  `supabase secrets set LDL_COGNITO_REFRESH_TOKEN=<valore>`: la nuova edge function
  (`supabase/functions/ldl-odds/index.ts`) fa `InitiateAuth REFRESH_TOKEN_AUTH` da sola
  (pool produzione `eu-central-1_Gaq47fVqf`, client `7tbdal5hjeth0oq9nlifs5m8e0`,
  sovrascrivibili via secret) + retry automatico su 401 + cache JWT exp. Rideployata.
- **Calendario ora su /puntapunta** (1 chiamata, `fetchCoverFeed` in `ldlOddsApi.ts`):
  eventi con U+O appaiati + rating server, `size=100`/`page` supportati (verificato:
  100 righe complete U+O in ~1.1s, prima erano ~15 via /odds per-evento). Selettori
  UI "Madre"/"Copertura" popolati da `fetchLdlBookmakers()` (siti type=bookmaker, 38 attivi).
  Rimosso il vecchio path per-evento (`fetchCoverOdds`/`ODDS_FETCH_LIMIT`); `fetchCoverOdds`
  non più esportato. Badge rating ★ anche nel Calendario; messaggio mock ora mostra
  l'errore reale. Vecchi test `normalizeEventsFeed` ancora verdi (funzione tenuta nell'engine).
- Test **84/84**, tsc pulito, build OK, smoke dal vivo OK (Guingamp-Annecy 0.918 in testa).
- **Aperto**: ~~refresh token vero nel secret~~ → **RISOLTO in F8** (2026-09-11);
  paginazione "carica più partite";
  coppia book madre/copertura configurabile per ciclo (oggi default globali 16→23).

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

## F6 — Login Supabase sistemato (2026-09-10)

- Causa login rotto: **zero utenti in auth** + `mailer_autoconfirm=false` senza SMTP
  (nessuno avrebbe mai potuto confermare l'email). Fix: autoconfirm **ON** via
  Management API (`PATCH /v1/projects/ekzjsltnamndtydodkhx/config/auth`), nessuna UI
  aggiunta (scelta utente: pochi account fidati, niente signup/reset/magic link).
- `scripts/create-auth-user.mjs`: crea utenti con admin API (`/auth/v1/admin/users`,
  service_role presa da `.env:SUPABASE_TOKEN_ACCESS` via api-keys, mai stampata;
  password chiesta nel terminale con input nascosto). Uso:
  `node scripts/create-auth-user.mjs tua@email.it`.
- Verificato end-to-end con utente usa-e-getta: create 200, **signInWithPassword 200 con
  sessione**, pulizia fatta via SQL (`api.supabase.com/v1/projects/<ref>/database/query`
  — il DELETE di GoTrue risponde 405, usare la via SQL per rimozioni manuali).
- Aperto F7: `site_url` resta `http://localhost:3000` → aggiornare all'URL Vercel al deploy.

### Fuori scope in F5 (rimandato, dipende da questo)

Agente cron auto-copertura (F6, richiede `pg_cron`/`pg_net`, nessun precedente nel repo) e
riempimento assistito schedina via browser automation (book-per-book, ispezione live di
Snai/Eurobet/BetFlag — non fattibile "alla cieca"). Piazzamento resta sempre a conferma
manuale dell'utente.

## F8 — LDL sync: causa "cade sempre" risolta + refresh token vero (2026-09-11)

- **Causa radice**: il secret `LDL_COGNITO_REFRESH_TOKEN` **non era mai stato
  impostato** (`supabase secrets list` → solo `LDL_BEARER_TOKEN`). L'auto-refresh
  della edge non partiva mai; la sync viveva dell'access token statico incollato a
  mano in F5d (scadenza ~13/09) → 401 → fallback mock. Ora l'utente ha impostato il
  **vero refresh token** dal dashboard (Edge Secrets).
- **Perche' dashboard e non CLI**: `supabase secrets set` da CLI fallisce con
  "insufficient privileges" perche' la CLI **non e' loggata** (`~/.supabase/
  access_token` assente); il `SUPABASE_TOKEN_ACCESS` in `.env` invece i permessi
  secrets li ha (GET /v1/projects/<ref>/secrets → 200). Per i secrets: o CLI con
  `supabase login`, o dashboard, o Management API.
- **Refresh verificato end-to-end**: nuova resource edge **`tokencheck`**
  (`GET /functions/v1/ldl-odds?resource=tokencheck`) risponde
  `{ refreshOk, accessTokenExp, fallbackPresent, working }` — mai token. Esito:
  `refreshOk:true`, accessToken exp 24h (il pool LDL emette access token da ~24h,
  non 1h come ipotizzato).
- **Edge `ldl-odds` v10 (deployata via Management API
  `POST /v1/projects/<ref>/functions/deploy?slug=ldl-odds`, multipart,
  verify_jwt=true come in produzione)**: errori Cognito tipizzati con prefisso
  `TOKEN:` nei messaggi verso la UI (`TOKEN_NOT_AUTHORIZED` = rinnovo 30gg,
  `COGNITO_RESOURCE_NOT_FOUND` = clientId/pool, `COGNITO_NETWORK` = transitorio),
  1 retry su 5xx/rete.
- **UI Calendario**: banner ambra dedicato quando `ldlErrors` contiene `TOKEN:`
  con la procedura di rinnovo in 3 passi (distincto dal banner mock/rete).
- **PROCEDURA RINNOVO OGNI ~30 GIORNI** (il refresh token Cognito ha validita'
  propria e il pool e' static, nessuna rotazione):
  1. Login su liberidalavoro.it → DevTools → Local Storage → chiave
     `CognitoIdentityServiceProvider.7tbdal5hjeth0oq9nlifs5m8e0.<utente>.refreshToken`
  2. Dashboard Supabase → Settings → API Keys → Edge Secrets → aggiorna
     `LDL_COGNITO_REFRESH_TOKEN`
  3. Verifica: `?resource=tokencheck` → `refreshOk:true`
- **Committed in F8** (`48ffbfa`): multi-selettore book + Trova Partite nel
  Calendario, campo multi_days_limit gestionale, edge tokencheck.

## F9 — LDL sync: hardening anti-"cade sempre" (2026-09-11, pomeriggio)

- **Trigger**: banner "Dati mock" riapparso a token OK. Diagnosi: lato server
  sempre 200 (tokencheck/puntapunta 7gg 22-book/events/sites, 6 chiamate
  ravvicinate senza rate-limit) → il problema è il **design del fallback**:
  un solo refresh fallito (isolate cold al deploy, jitter LDL, abort 30s)
  buttava i dati reali buona e mostrava mock.
- **Client `ldlOddsApi.ts`**: `fetchResourceWithRetry` (2 tentativi, backoff 2s,
  solo errori retryable — `TOKEN:` mai ritentato; timeout 30s→45s per tentativo;
  ora anche gli errori edge non-200 includono il `body.error` nel messaggio);
  `fetchCoverSuggestions` usa `allSettled` per sites/events (degradazione: feed
  senza nomi/metadati invece di mock totale; solo puntapunta e' critico);
  `fetchLdlBookmakers` passa al retry helper.
- **UI Calendario**: `hasEdgeDataRef` + `lastUpdatedAt` — i dati mock sostituiscono
  i reali MAI (solo se non c'e' mai stato un edge OK); header lista mostra
  "agg. HH:MM (:ss) (ultimo riuscito)"; banner sky = "aggiornamento fallito/
  incompleto, sotto gli ultimi dati reali" (non piu' "partial-data").
- **Edge `ldl-odds` v11**: cache in-memory 5' per isolate su `events` e `sites`
  (i dati lenti-a-variare; il poll 60s x3 risorse costa ora ~4x meno LDL).
  Verifica: 10 chiamate parallele → 1 cache-hit (gli altri finiscono su isolates
  separati cold: il traffico reale mono-utente riusa lo stesso isolate).
  `tokencheck` e `puntapunta` NON cacheati (token live/quote live).
- **Quirk API**: `GET /v1/projects/<ref>/functions/ldl-odds/body` restituisce
  sorgente obsoleto (manca perfino tokencheck) mentre il runtime ha la v11:
  per verificare il deploy usare comportamenti live (header `cache`, tokencheck),
  non il body endpoint.

## F10 — Libreria schedine salvate (2026-09-11, sera)

- Richiesta: "devo poter salvare le schedine". Snapshot nominato della
  workbench LiveSlipTracker: `UserMatch[]` + parametri Dutching
  (`SavedSlipParams` in `src/types.ts`: baseStake, targetProfit, asymmetricMode,
  enableBooster, boosterOdds, bookmakerModel, modelApplyScope).
- **Tabella `saved_slips`** (`20260911150000_create_saved_slips.sql`, APPLICATA
  al live via Management API): id/owner/name/matches jsonb/params jsonb + RLS
  owner-scoped (modello cycles). Aggiornamento della riga senza retrigger del
  trigger updated_at: `.update()` CLI-compatibile.
- **Hook `useSavedSlips`**: pattern identico a useCycles — localStorage vince
  sempre (`multiplatore:saved_slips:v1`), write-through cloud best-effort se
  c'e' sessione; API: saveSlip / overwriteSlip / renameSlip / deleteSlip /
  usingFallback (badge "solo locale" vs "sync cloud attiva" in UI).
- **UI LiveSlipTracker**: pannello "Schedine Salvate" tra header e parametri:
  input nome (placeholder auto `Schedina N eventi — data ora`), Salva ora,
  griglia card con Carica (ristabilisce partite + tutti i parametri) /
  Sovrascrivi / Elimina.
- **Nota d.ts**: `src/types/lucide-react.d.ts` e' una lista MANUALE di export
  (i tipi reali del pacchetto non vengono risolti): aggiungere qui ogni nuova
  icona (F10: `FolderOpen`; per questo `Wand2` non compilava in F8).
- Test 84/84, tsc pulito, build OK.

## F11 — Perche' la produzione sembrava "demo": deploy Vercel SENZA env build-time (2026-09-11, sera)

- **Sintomi utente**: su multiplatore.vercel.app niente login, dati fermi/-demo.
- **Diagnosi**: il bundle live CONTIENE l'ultima versione del codice (stringhe
  F10 presenti) quindi la Git-integration di Vercel funziona; MA nel bundle NON
  c'e' l'anon key JWT ne' l'URL progetto → la build e' partita **senza**
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` → `isSupabaseConfigured=false`
  → AuthBar nascosta, hooks in fallback locale, feed Calendario sempre mock.
- **Attenzione scope**: CLI loggata `quixelone` (team personale `quixelones-projects`,
  vecchio progetto multiplatore con env GIUSTE ma deployment di 3giu' prima).
  Il sito live e' nel team **`rcsitalia`** (scope non raggiungibile da
  quixelone: "specified scope does not exist"). **Da fare**: aggiungere le due
  env vars su Project Settings -> Environment Variables del progetto
  rcsitalia/multiplatore (ambiente Production) e Redeploy dall'ultima
  deployment. Valori: `VITE_SUPABASE_URL=https://ekzjsltnamndtydodkhx.supabase.co`,
  `VITE_SUPABASE_ANON_KEY=<anon public key dashboard API Keys>`.
- **Pipeline CI mai verde dal 07/09** (non blocca Vercel, ma era tutta rossa):
  cause a cascata: (1) regole `@typescript-eslint/*` senza plugin -> crash eslint;
  (2) `.prettierrc` con `@prettier/plugin-xml` non installato -> crash prettier;
  (3) config eslint senza scope ne' globals (browser/node/deno mescolati) -> 5k
  errori; (4) threshold coverage 80% globali su TUTTO src (UI/hooks non testati).
  Fix: devDeps `typescript-eslint` + `globals`, eslint.config a scope con parser
  + globals per ambiente, `eqeqeq {null:'ignore'}`, prettier senza plugin xml +
  endOfLine auto + `npm run format`, coverage `include: src/engine/**` + nuovi
  test slips/timeline/risk/dutching -> **lint/format/test/typecheck/build tutti
  verdi, coverage motore 97%, 110 test**. (5) rimosso il job `deploy` dalla
  workflow: usava `amondnet/vercel-action@v30` (release inesistente) ed era
  ininfluente perche' Vercel pubblica via propria Git integration. Prima run
  CI VERDE dal 2026-09-07.
## F11 UX — vedi sopra (stato vuoto LiveSlipTracker)

- **F11 UX**: LiveSlipTracker non carica piu' le 8 Serie A finte di default:
  stato vuoto con empty-state + CTA "Apri Calendario" / preset demo su richiesta.
  `DEFAULT_SERIE_A_MATCHES` resta solo come preset manuale.

## F12 — Bug GRAVE calcolo netto relay nel workbench schedine (2026-09-11, sera)

- **Segnalazione utente**: schedina salvata "multipla prova" (8 partite) — nello
  scontro finale C7 vs C8 (Over al match 7, match 8 decisivo), se vince C7 la
  perdita reale è ~100€, ma l'app mostrava un utile "garantito".
- **Causa radice** (`src/engine/slips.ts`): nel ramo `WON_COVERAGE`,
  `netGainRealized = winningSlip.potentialNetProfit`, che sottrae solo i costi
  fino alla copertura vincente. Ma nel relay "Live Relay a Scalare" le
  coperture SUCCESSIVE alla vincente vengono comunque piazzate e perse: se vince
  C7, la singola finale C8 (piazzata prima del match 8) è persa e il suo stake
  resta scoperto. Idem per Over intermedi (vince C5 su 8 → scoperti C6+C7+C8).
  `timeline.ts` (PracticalSimulator) e `pyengine build_chain` (`true_netto`)
  e `harmony.ts` (`trueNetto` con `laterStakes`) calcolavano già correttamente:
  slips.ts era l'outlier.
- **Fix**:
  - `netGainRealized` (WON_COVERAGE) = `payout vincente − totaleInvestito`
    (= `maxPotentialExposure` a esito risolto, S0 + tutte le puntate).
  - Nuovo campo `GeneratedSlip.realizedNetIfWon` (secondo passaggio in
    `generateCustomSlips`): netto finale proiettato se quella schedina vince la
    corsa = `payout − esposizione massima`. È il numero mostrato sulle card
    ("Netto Finale se Vince", rosso se negativo, con target step secondario) e
    nella clipboard; banner "Vinta Copertura Cx!" ora con segno reale.
  - Test regressione in `tests/unit/slips.test.ts`: Over@7/Under@8 (netto
    sconta stake C8), Over@7+8 (C8 → target), Over@5 su 8 (sconta C6..C8),
    madre WON invariata. 117/117 verdi, tsc pulito, lint 0 error (fixati anche
    2 `curly` pre-esistenti in slips.ts/timeline.ts), build OK.
- **Nota strategica (aperto, decisione utente)**: la formula di sizing dello
  step (`(cumulato+target)/(quota−1)`) non garantisce per costruzione
  `realizedNetIfWon ≥ 0` per le coperture non-finali: con quote/aggio reali la
  coda di puntate può eccedere il target (caso C7). Il no-loss vero richiede
  o sizing su payout comune (dutching, se Σ1/quota < 1) o il motore harmony con
  T/B/terminazione/lock. L'app ora almeno mostra il numero VERo.
- NOTA: nel working tree c'erano già modifiche non committate a
  `timeline.ts`/`timeline.test.ts` (sessione precedente, non F12).

## F13 — Finale in BANCA (LAY Under 3.5 su Betfair) + curva back_loaded (2026-09-11, notte)

- **Richiesta utente**: "la finale dovrebbe essere una bancata Lay su Betfair,
  deve essere rivisto" + "sbilanciare un po' le puntate iniziali per recuperare
  più capitale nelle puntate finali".
- **Motore `src/engine/slips.ts`**: nuovo parametro `finalHedgeMode`
  ('book_single' default retrocompatibile | 'lay_exchange') + `layOdds`
  (default = quota Under dell'ultimo match) + `layCommissionPct` (default 5).
  Con 'lay_exchange' l'ultimo step C_N non è più la singola Over in bookmaker
  ma una BANCA (LAY Under 3.5) su exchange, tipo `FINAL_LAY`, dimensionata a
  GREEN-UP sullo scontro finale: `B = P/(L−c)` dove P = payout della schedina
  attiva alla finale (madre se nessun Over, altrimenti C_k dell'ultimo Over),
  L = quota lay, c = commissione. I due rami finali chiudono entrambi a
  `P(1−c)/(L−c) − I` (pari, ≥0 se la scala lo consente). La responsabilità
  `B(L−1)` NON è una puntata: contabilità separata (`bookInvestedSoFar` vs
  `layAtRisk`); ramo Over (vince la banca) sottrae solo le puntate book, ramo
  Under (vince la attiva) sottrae anche la responsabilità persa.
  `maxPotentialExposure` = puntate book + responsabilità.
- **Curva `back_loaded`** (`dutching.ts` + tipo `AsymmetricMode`): specchio di
  front_loaded (target 0.3x all'inizio → 1.8x in finale, arrotondi a 5€):
  puntate iniziali leggere, recupero caricato su coperture finali + banca.
- **UI `LiveSlipTracker`**: toggle "Finale in Banca (Betfair)" (default ON per
  direttiva utente), input quota lay (auto = Under ultimo match) + commissione
  (2%/5%), opzione Curva "Recupero in Finale", card C_N con chip viola
  "LAY UNDER 3.5", "Banca (Stake Puntatore)" + responsabilità, "Utile se Over
  (netto comm.)", clipboard con istruzione Bancа completa, banner "Vinta
  Banca Finale!", caption esposizione dinamica. Parametri persistiti in
  `SavedSlipParams` (finalHedgeMode/layOdds/layCommissionPct) → le schedine
  salvate (es. "multipla prova") ricaricano tutto.
- **Numeri** (8 partite 1.32/3.0, S0=20, target=45, lay@1.30 c.5%):
  - flat+lay: Over@7 → **+4.33/+4.67** su TUTTI E DUE i rami finali (prima
    con book: −39.72/+45); madre +51.65.
  - back_loaded+lay: Over@7 → **+22.36/+22.9**, madre +45.65, scala stake
    1.5→51, banca resp. 48.60.
  - **TRADE-OFF ONESTO (mostrato in rosso dall'app)**: con Over PRECOCE
    (match 1–3) il green-up non può recuperare tutta la scala: flat −64/−63,
    back_loaded −101/−80, front_loaded −37/−40. Nessun profilo di target
    rende verdi TUTTE le posizioni con quote 1.32/3.0 (richiederebbe payout
    early ≥ 1.32× scala totale → dutching completo o motore harmony con T/B).
    Scelta profilo lasciata all'utente (selettore Curva).
- Test: +5 in `tests/unit/slips.test.ts` (green-up pari, ramo Over senza
  responsabilità, sizing su madre, default book_single invariato, back_loaded
  + Over precoce onesto). **122/122**, tsc pulito, lint 0 error, build OK.
- Da valutare (prossimo passo se richiesto): sizing "tutte le posizioni verdi"
  (solver iterativo sui target o dutching a payout comune), portare la banca
  anche in `timeline.ts`/PracticalSimulator e in harmony/pyengine (task parità
  TS/Python già aperto in §F-nota 3f85c91).

## F14 — Fix bancata finale: il green-up a quota pre-match comprimeva tutto a ~0 (2026-09-11, notte bis)

- **Segnalazione utente**: "la bancata finale è proprio in errore". Confermato
  dal dump: con la bancata green-up a quota lay = quota Under pre-match
  (1.32), il lock estrae solo (1−c)/(L−c) ≈ 74.8% del payout → lo scontro
  C7/banca chiudeva a **+2.2/+2.8** su 168€ investiti (operazione da 8 partite
  ridotta a zero). Il sizing delle coperture non considerava il taglio del
  lock: payout C7 (cum+45) non basta a reggere lock E target.
- **Fix sizing (`src/engine/slips.ts`)**: quando `finalHedgeMode='lay_exchange'`,
  l'ULTIMA copertura book C_{N−1} viene sovradimensionata al punto fisso
  `t' = (k−1)(cum+s) + k·t` con `k = (L−c)/(1−c)`, così il suo payout regge
  `P = k·(I+t)` e il green-up con la banca chiude **ENTRAMBI i rami al target
  della curva** (il `targetProfit` mostrato resta quello di curva; il gonfio
  è solo nel sizing). Guard: `mult > k` altrimenti niente gonfio (quotes non
  reggono il lock, mostrato onesto).
- **Numeri** (8 partite 1.32/3.0, S0=20, t=45, lay@1.32 c.5%, flat no-booster):
  - C7 stake 43→65, payout 170.28→257.40; banca B=203, resp 64.96.
  - Scontro: **Under +45.44 / Over +45.85** (prima del fix: +2.24/+2.77; con
    la vecchia singola book: −39.72/+45.00).
  - Esposizione 211.96 ≈ identica alla vecchia singola book (210): stessa
    capitale, ma ora PERDITA ZERO su entrambi i rami + target pieno.
  - back_loaded: scontro chiude a **~+70/+70** (target curva C7), madre ~+17.
  - front_loaded (default UI): scontro ~+16/+16 (target curva), madre ~+54.
  - Lay IN-PLAY a quota scesa (es. @1.10) → il lock costa meno: stesso target
    con meno capitale (il campo quota lay è editabile, ricalcola tutto).
  - Trade-off onesto invariato: Over precoci (match 1–5) restano rossi (nessun
    sizing a scala li copre senza dutching completo; arrotondato in rosso).
- Test aggiornati: C7.realized ≈ target e C8.realized ≈ target su flat (45) e
  back_loaded (70), stake C7 > 50. **122/122**, tsc pulito, lint 0 error,
  build OK.
- **F14b — stake bancata MANUALE** (richiesta utente: "stake 40"): nuovo campo
  "Stake" nel pannello Finale in Banca (vuoto = green-up automatico con gonfio
  su C_{N-1}; compilato = sizing dell'utente: scala standard, nessun gonfio,
  netti dei due rami mostrati per come sono). Engine: `layStakeOverride`
  (10° parametro), `SavedSlipParams.layStake`. Con stake 40 @1.30:
  responsabilità 12; ramo Under = P_attiva − I − 12, ramo Over = 38 − I.
  Test +1 (stake manuale): **123/123**, tsc, lint, build OK.
- **F14c — fix "puntate C7/C8 sballate" sui dati reali** (2026-09-11, notte 3;
  slip utente: 8 match Under 1.33–1.95, base 40, flat, lay auto 1.95):
  1. RIMOSSO il gonfio automatico F14 su C_{N-1}: con lay 1.95 il k-factor
     2.0 raddoppiava lo stake (C7 34→93). Sizing STANDARD su tutta la scala.
  2. Riferimento sizing banca a piano/partita-in-corso = scontro C_{N-1}/banca
     (NON più la madre: payout 8 gambe → banca 912€/RESP 866 sui dati reali).
     La madre torna riferimento SOLO a scontro realmente risolto (primi N−1
     tutti Under risolti). Over verificato → C_k dell'ultimo Over.
  3. `realizedNetIfWon` delle schedine Under sconta la responsabilità della
     banca SOLO se piazzata (status ≠ PENDING): a piano C7 mostra l'atteso
     puro del relay (+45.62 sui dati utente), non 45−RESP.
  Numeri utente dopo fix: C1..C7 = 1.5/1.5/2/4.5/11/19/34; banca auto 84/RESP
  79.8 (netto se vince banca −33.7: onesto, il lock pari a 1.95 pre-match
  perde); con stake manuale 40 → RESP 38, Under +45.62 / Over −75.5.
  Test: +2 (piano: sizing su C_{N−1} e atteso senza responsabilità) →
  **124/124**, tsc, lint 0 error, build OK. Commit `46fa96b` + fix successivo.

## F15 — Regola MAI-PERDITA obbligatori: sizing ARMONIZZATO (2026-09-11, notte 4)

- **Direttiva utente**: "la regola è obbligatoria non devo mai perdere, quindi
  le puntate vanno armonizzate per trovarmi sempre in positivo alla fine".
- **Formalizzazione** (`src/engine/slips.ts`): no-loss su OGNI esito finale
  (madre, qualsiasi C_k, banca se esce Over) ⇒ dutching a PAYOUT COMUNE D:
  con k=(L−c)/(1−c) il lock estrae (1−c)/(L−c) del payout, quindi serve
  D = k·(I+t) con I = S0+Σ puntate book; da I = S0 + D·Σ(1/m_k) segue
  **fattibilità ⇔ k·Σ(1/m_k) < 1**; L_max = (1−c)/Σ(1/m_k)+c. Bancata
  dimensionata sul payout comune (ramo peggiore) ⇒ ogni ramo ≥ equalizedNet.
- **Engine**: refactor in 2 pass (pass 1 scheletri con moltiplicatori/stato,
  pass 2 sizing standard-sequenziale OPPURE armonizzato); nuovo oggetto
  `lay: LayFinaleOptions` (layOdds/layCommissionPct/layStake/harmonized) al
  posto dei parametri posizionali; `CustomSlipsResult.harmonization` con
  verdetto (requested/feasible/kFactor/Σ1/m/maxLayQuote/equalizedNet).
  Infeasible ⇒ fallback sizing standard + rami onesti. In armonizzato la
  responsabilità banca è conteggiata nei netti da subito (la bancata è parte
  del piano); in standard solo se piazzata.
- **UI LiveSlipTracker**: toggle "Armonizza (mai perdita)" (default ON, solo
  lay_exchange), banner verdetto: verde "Scala ARMONIZZATA: ogni esito ≥
  +€X, book €I + resp €R" / rosso "IMPOSSIBILE a lay @L, serve ≤ @L_max
  (in-play quando l'Under scende), scala standard con rami onesti".
  `SavedSlipParams.harmonized` persistito.
- **Numeri su dati reali utente** (8 match Under 1.33–1.95, S0=40, t=45,
  Σ1/m=0.558, L_max=1.75):
  - lay @1.40 in-play: C1..C7 = 7.5/9/11.5/27.5/58.5/88/125 (payout comune
    ~585-603), banca 432.5/RESP 173, madre +1192 → **ogni ramo ≥ +43.25,
    esposizione 540€**.
  - lay @1.60: fattibile ma capitale esplode (esposizione 1502€) — il costo
    della garanzia cresce con la quota lay (diverge verso L_max).
  - lay @1.95 pre-match: **IMPOSSIBILE** (k=2.0, k·Σ=1.12 ≥ 1) → banner
    rosso + scala standard.
- Test: +4 (fattibile @1.4 ogni ramo > 0 e payout comune; impossibile @1.95
  con maxLayQuote ~1.75 e fallback C7=34; null in book; null se non
  richiesto) → **128/128**, tsc, lint 0 error, build OK.

## F16 — Calendario/Trova Partite: proposta in ordine di data/ora crescente (2026-09-12)

- **Richiesta utente**: quando crea una nuova multipla e cerca le partite, la
  proposta deve essere in ordine di data e orario crescente (il relay e'
  sequenziale nel tempo).
- **Com'era**: il feed puntapunta arriva ordinato per RATING (server
  `order=rating` + sort client in `ldlOddsApi`), il Calendario mostrava le
  righe in quell'ordine e "Trova Partite" selezionava le top-rated. Solo
  l'import nella multipla ordinava per kickoff.
- **Scelta utente (confermata)**: "prima le più vicine nel tempo" — la
  selezione automatica prende le N idonee con kickoff più vicino, non le
  meglio classificate.
- **Fix**:
  - `src/engine/coverOddsFeed.ts`: comparatore esportato `byKickoffAsc`
    (kickoff crescente; righe senza kickoff valido in coda; stabile a pari
    fascia).
  - `CalendarOddsMonitor.tsx`: `filteredRows` = filtro lega/stato → sort
    `byKickoffAsc` (lista proposta in ordine cronologico);
    `autoFindMatches` ordina i candidati per kickoff PRIMA del
    `.slice(0, target)` e il messaggio ora dice "ordine data/ora ↑". Il
    rating resta visibile come badge su ogni riga ma non decide la
    selezione. L'import ordina già per kickoff (doppio sort innocuo).
  - NON toccato: sort rating a livello servizio (`fetchCoverSuggestions`):
    il pannello "Coperture suggerite" di CyclesDashboard continua a vedere
    l'ordine rating. Nessun `order=date` server (non documentato).
- Test: +3 in `coverOddsFeed.test.ts` (crescente misto, kickoff vuoto/invalido
  in fondo, stabilità a pari orario) → **131/131**, tsc, lint 0 error,
  build OK.
- **F16b — partite già iniziate escluse** (stessa richiesta utente): motore
  `hasKickoffPassed(row, now)`; `filteredRows` nasconde di default le righe
  con kickoff ≤ ora attuale (toggle "Solo future"/"Anche già iniziate" sulla
  barra filtri, ricalcolo dell'ora a ogni refresh 60s); `autoFindMatches`
  le filtra sempre (anche se il feed le mostra 'scheduled' per lentezza);
  `handleImportSelected` guardia finale + nota "(N già iniziate escluse)".

## F17 — Alert selezione partita a <2h dall'avvio (2026-09-12)

- **Richiesta utente**: alert popup o tooltip se seleziona per errore un
  evento a meno di 2 ore dall'avvio; + opzione "solo il primo tempo" se
  decide comunque di inserirla (quest'ultima da chiarire, vedi sotto).
- **Fatto (alert)**:
  - Motore: `isKickoffTooSoon(row, now, hours=2)` — kickoff futuro ma entro
    2 ore dall'ora attuale (+3 test: vicina/limite true, lontana false,
    passata/mancante false).
  - UI Calendario: badge ambra "⚠ <2h" con tooltip sulla riga (visibile
    PRIMA di selezionare); popup/banner ambra dismissibile alla selezione
    ("Home - Away parte tra N minuti (meno di 2 ore)...", auto-chiusura 8s,
    la selezione resta valida — decide l'utente); Trova Partite conta le
    too-soon selezionate nel messaggio ("⚠ N a meno di 2h dall'avvio").
  - Costante `MIN_HOURS_TO_KICKOFF = 2`.
- **Aperto (da chiarire con l'utente)**: "devo poter scegliere solo il primo
  tempo" — letture possibili: (a) flag per gamba "Solo 1° tempo" (mercato
  primo tempo, quote a mano — il feed LDL non ha quote 1T); (b) forza la
  partita come PRIMA della scala (position 1); (c) regola di spacing ≥2h
  TRA le partite selezionate (alert se due selezionate sono a <2h di
  distanza). Non implementato finché l'utente non sceglie.
- Test: **134/134**, tsc, lint 0 error, build OK.
- **F17b — "Solo 1° tempo" (scelta utente: mercato 1T sulla gamba)**:
  - Tipi: `UserMatch.firstHalfOnly?: boolean`; `GeneratedSlipItem.market` +=
    `'UNDER 3.5 1T' | 'OVER 3.5 1T' | 'LAY UNDER 3.5 1T'`.
  - Engine `slips.ts`: helper `legMarket()` — tutte le gambe di una partita
    flagged (madre, prima gamba Over delle coperture, gambe Under nelle
    coperture successive, banca finale) usano l'etichetta 1T. Le quote sono
    quelle nei campi Under/Over del workbench (l'utente le aggiusta a mano
    con le quote 1T: il feed LDL non le fornisce).
  - Calendario: bottone "Solo 1° tempo" sulle righe <2h (attiva il flag +
    seleziona); badge "N solo 1° tempo" nella barra selezione; deselezione
    pulisce il flag; import passa `firstHalfOnly` + nota "solo 1° tempo";
    messaggio dell'alert rimanda al bottone 1T.
  - Workbench: colonna "Solo 1T" nella tabella partite (toggle per riga,
    con tooltip esplicativo); chip di mercato per prefisso (OVER/BOOSTER/
    LAY/UNDER) così le varianti 1T ereditano i colori.
  - Persistenza automatica: `firstHalfOnly` viaggia dentro `UserMatch` →
    localStorage + saved_slips (nessuna migration).
  - Test +2 (etichette 1T su madre/coperture/banca, match intermedio e
    ultimo) → **136/136**, tsc, lint 0 error, build OK.

## F18 — Formato data/ora "12-09 - 12:30" + date visibili (2026-09-12)

- **Richiesta utente**: il campo data/ora non deve essere "sab 12 set, 15:30"
  ma "12-09 - 12:30", e le date/ore devono essere visibili (al momento non
  lo sono).
- **Fix**:
  - `formatKickoff` (Calendario): formato compatto `gg-mm - hh:mm` locale
    ("12-09 - 12:30"); kickoff invalido → "—". Essendo la fonte del
    `timeSlot` all'import, le nuove schedine importate arrivano già così
    (le schedine già salvate mantengono le stringhe vecchie, campo libero).
  - Workbench: colonna "Data - Ora" allargata (w-24 → w-36, prima il testo
    lungo veniva tagliato), placeholder/title con esempio del formato.
  - Card schedine: ogni gamba ora mostra anche il suo `timeSlot` in piccolo
    (prima le gambe non mostravano data/ora, solo la tempistica in testata).
- Test: **136/136** (nessun nuovo test: UI pura), tsc, lint 0 error, build OK.