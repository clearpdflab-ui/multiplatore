# HANDOFF — Multiplatore a scalare (production)

> Ultimo aggiornamento: 2026-09-07. Stato: F0+F1+F2 completati e pushati.
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
- odds-api.net (NON the-odds-api.com): SDK TS+Python, mock mode, comparison. ⚠️ `.env` ha
  `THE_ODDS_API_KEY` (naming da the-odds-api.com!) — VERIFICARE a quale servizio appartiene la key (test status-only in F4).

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
- Comandi: `npx vitest run` · `npx tsc --noEmit` · `python -m pytest pyengine/tests -q` ·
  `python -m pyengine.cli chain --n 30` · supabase: serve `SUPABASE_ACCESS_TOKEN` da
  `.env:SUPABASE_TOKEN_ACCESS` nell'env di shell prima dei comandi.

## 8. Secret policy (obbligatoria)

MAI stampare/inccollare valori secret in chat o tool-output. Nomi ammessi. `.env` è
gitignored. service_role solo server-side. Deploy key solo per questo repo.

## 9. Da fare (prossimo: F3)

- **F3 cicli UI**: dashboard cicli, ledger multi-ciclo + tabelle Supabase (cycles/tickets),
  calcolatore terminazione, flusso void/top-up, exposure meter + shared-leg guard, auth UI.
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
repo odds-api.net, setup F0/F1/F2 con credenziali già in `.env`
(SUPABASE_TOKEN_ACCESS, THE_ODDS_API_KEY, GEMINI_API_KEY, VITE_*).
