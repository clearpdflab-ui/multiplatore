# Graph Report - Multiplatore  (2026-09-11)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 590 nodes · 1201 edges · 56 communities (36 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7c0c5285`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- engine/index.ts
- types.ts
- coverOddsFeed.ts
- core.py
- compilerOptions
- oddsFeed.ts
- resultsFeed.ts
- dependencies
- useBooks.ts
- test_core.py
- scripts
- App.tsx
- useSavedSlips.ts
- ldl-odds/index.ts
- server/index.ts
- devDependencies
- dependencies
- devDependencies
- server/package.json
- public.tickets
- odds/index.ts
- nvidia_chat.py
- create-auth-user.mjs
- schema.sql
- 20260907134515_create_books_and_bonus.sql
- package.json
- 20260911150000_create_saved_slips.sql
- results/index.ts
- eslint.config.js
- @types/cors
- @types/node
- lucide-react.d.ts
- @testing-library/user-event
- @eslint/js
- eslint-plugin-react-hooks
- eslint-plugin-react-refresh
- globals
- jsdom
- postcss
- prettier
- tailwindcss
- @testing-library/react
- @types/react
- typescript-eslint
- @vitejs/plugin-react
- vitest
- @vitest/coverage-v8
- cors.d.ts
- public.books

## God Nodes (most connected - your core abstractions)
1. `CyclesDashboard()` - 20 edges
2. `Book` - 19 edges
3. `compilerOptions` - 18 edges
4. `scripts` - 16 edges
5. `roundToFiftyCents()` - 15 edges
6. `getSupabase()` - 15 edges
7. `getBonusPercentage()` - 14 edges
8. `r2()` - 14 edges
9. `useCycles()` - 13 edges
10. `TicketLeg` - 12 edges

## Surprising Connections (you probably didn't know these)
- `computeLineStatusFor()` --calls--> `normalizeCoverOdds()`  [EXTRACTED]
  tests/unit/coverOddsFeed.test.ts → src/engine/coverOddsFeed.ts
- `loadLdlOdds()` --calls--> `fetchCoverSuggestions()`  [EXTRACTED]
  src/components/CyclesDashboard.tsx → src/services/ldlOddsApi.ts
- `types` --extends--> `@testing-library/jest-dom`  [EXTRACTED]
  tsconfig.json → package.json
- `BuildChainArgs` --references--> `Book`  [EXTRACTED]
  src/engine/harmony.ts → src/types.ts
- `CreateCycleInput` --references--> `CycleMotherEvent`  [EXTRACTED]
  src/hooks/useCycles.ts → src/types.ts

## Import Cycles
- None detected.

## Communities (56 total, 20 thin omitted)

### Community 0 - "engine/index.ts"
Cohesion: 0.09
Nodes (61): CyclesDashboard(), loadLdlOdds(), emptyLeg(), LegRow, parseLegs(), BookSelection, DEFAULT_BONUS_TABLE, DEFAULT_BOOK (+53 more)

### Community 1 - "types.ts"
Cohesion: 0.09
Nodes (46): AsymmetricStrategyGuide(), AsymmetricStrategyGuideProps, GeometricVisualizer(), GeometricVisualizerProps, LiveSlipTracker(), MathematicalAnalysis(), PracticalSimulator(), SequentialRelayLadder() (+38 more)

### Community 2 - "coverOddsFeed.ts"
Cohesion: 0.08
Nodes (47): CalendarOddsMonitor(), autoFindMatches(), loadRows(), formatKickoff(), LdlBookmaker, loadStoredSites(), MOCK_LDL_COVER_EVENTS, MOCK_LDL_COVERODDS (+39 more)

### Community 3 - "core.py"
Cohesion: 0.11
Nodes (35): Namespace, cmd_chain(), cmd_lock(), cmd_size(), main(), CLI: python -m pyengine.cli {chain|size|lock} (stdlib only; tests via pytest)., back_stake_for_target_green(), bankroll_tbr() (+27 more)

### Community 4 - "compilerOptions"
Cohesion: 0.06
Nodes (29): @testing-library/jest-dom, DOM, DOM.Iterable, ES2022, server, src, tests, vite/client (+21 more)

### Community 5 - "oddsFeed.ts"
Cohesion: 0.13
Nodes (25): MOCK_ODDS_EVENTS, mockOddsForEventIds(), BestSide, bestTotalsSide(), BookTotals, compareMatches(), CompareRow, extractTotalsLine() (+17 more)

### Community 6 - "resultsFeed.ts"
Cohesion: 0.19
Nodes (18): applyLdlRow(), MOCK_LIVE_EVENTS, MOCK_MATCH_DETAILS, mockMatchDetailsForIds(), isOverLine(), matchEventByTeams(), NormalizedMatch, normalizeMatchDetail() (+10 more)

### Community 7 - "dependencies"
Cohesion: 0.11
Nodes (19): @google/genai, lucide-react, motion, dependencies, express, @google/genai, lucide-react, motion (+11 more)

### Community 8 - "useBooks.ts"
Cohesion: 0.18
Nodes (16): BooksManager(), handleExportCsv(), handleImportCsv(), Draft, draftFromBook(), emptyTable(), newDraft(), bonusTableToCsv() (+8 more)

### Community 9 - "test_core.py"
Cohesion: 0.11
Nodes (7): Parity tests: same validated numbers as TS engine + Excel model., Reference-chain audit signal: at N=30/s0=2 only the final LOCK row exceeds…, Default rho=1.0 mirrors harmony.ts resolveWithFallback: recovery target grows…, Inter-Genoa example: back 1 @1.45 >=2d before kickoff, lay @1.40 once the…, test_chain_30_lock_hits_spend_ceiling(), test_lock_green_up_trade(), test_resolve_fallback_rho_grows_with_spent()

### Community 10 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, clean, dev, format, format:check, lint, lint:fix (+8 more)

### Community 11 - "App.tsx"
Cohesion: 0.23
Nodes (9): App(), AuthBar(), Footer(), FooterProps, Header(), HeaderProps, useAuth(), UseAuthState (+1 more)

### Community 12 - "useSavedSlips.ts"
Cohesion: 0.23
Nodes (14): CalendarOddsMonitorProps, LiveSlipTrackerProps, CreateSlipInput, DbSavedSlipRow, loadLocal(), nowIso(), rowToSlip(), saveLocal() (+6 more)

### Community 13 - "ldl-odds/index.ts"
Cohesion: 0.22
Nodes (13): ALLOWED_RESOURCES, CACHEABLE_RESOURCES, cognitoErrorKind(), cognitoRefreshCall(), CORS, getLdlToken(), handle(), Json (+5 more)

### Community 14 - "server/index.ts"
Cohesion: 0.26
Nodes (7): config, app, errorHandler(), setupAuthRoutes(), setupMatchRoutes(), setupOddsRoutes(), setupSlipRoutes()

### Community 15 - "devDependencies"
Cohesion: 0.18
Nodes (11): autoprefixer, @eslint-community/eslint-plugin-eslint-comments, devDependencies, autoprefixer, cors, @eslint-community/eslint-plugin-eslint-comments, tsx, @types/react-dom (+3 more)

### Community 16 - "dependencies"
Cohesion: 0.20
Nodes (10): better-sqlite3, dotenv, dotenv, dependencies, better-sqlite3, cors, dotenv, express (+2 more)

### Community 17 - "devDependencies"
Cohesion: 0.22
Nodes (9): @types/express, typescript, @types/express, typescript, devDependencies, tsx, @types/express, typescript (+1 more)

### Community 18 - "server/package.json"
Cohesion: 0.22
Nodes (8): name, private, scripts, build, dev, start, type, version

### Community 19 - "public.tickets"
Cohesion: 0.32
Nodes (7): public.book_bonus_versions, cycles_updated_at, public.cycles, public.tickets, auth.users, public.books, public.set_updated_at

### Community 20 - "odds/index.ts"
Cohesion: 0.39
Nodes (7): CORS, fetchOddsForChunk(), handle(), Json, mergeEvent(), parseBookiesPerKey(), parseKeys()

### Community 21 - "nvidia_chat.py"
Cohesion: 0.52
Nodes (6): OpenAI, ask(), load_env(), main(), make_client(), CLI per NVIDIA API (endpoint OpenAI-compatible). Uso: python…

### Community 22 - "create-auth-user.mjs"
Cohesion: 0.29
Nodes (4): envFile, found, mgmtToken, projectUrl

### Community 23 - "schema.sql"
Cohesion: 0.52
Nodes (6): bet_history, matches, odds_cache, slips, user_settings, users

### Community 24 - "20260907134515_create_books_and_bonus.sql"
Cohesion: 0.33
Nodes (5): books_updated_at, public.book_bonus_versions, public.books, auth.users, public.set_updated_at

### Community 25 - "package.json"
Cohesion: 0.33
Nodes (5): main, name, private, type, version

### Community 26 - "20260911150000_create_saved_slips.sql"
Cohesion: 0.40
Nodes (4): public.saved_slips, saved_slips_updated_at, auth.users, public.set_updated_at

### Community 29 - "@types/cors"
Cohesion: 0.67
Nodes (3): @types/cors, @types/cors, @types/cors

### Community 30 - "@types/node"
Cohesion: 0.67
Nodes (3): @types/node, @types/node, @types/node

## Knowledge Gaps
- **133 isolated node(s):** `LegRow`, `BonusRule`, `BoosterConfig`, `CycleStatus`, `UseAuthState` (+128 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `compilerOptions`, `devDependencies`, `package.json`, `@types/cors`, `@types/node`, `@testing-library/user-event`, `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `jsdom`, `postcss`, `prettier`, `tailwindcss`, `@testing-library/react`, `@types/react`, `typescript-eslint`, `@vitejs/plugin-react`, `vitest`, `@vitest/coverage-v8`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `@testing-library/jest-dom` connect `compilerOptions` to `devDependencies`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **What connects `LegRow`, `BonusRule`, `BoosterConfig` to the rest of the system?**
  _133 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `engine/index.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08528951486697965 - nodes in this community are weakly interconnected._
- **Should `types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08928571428571429 - nodes in this community are weakly interconnected._
- **Should `coverOddsFeed.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08350168350168351 - nodes in this community are weakly interconnected._
- **Should `core.py` be split into smaller, more focused modules?**
  _Cohesion score 0.112375533428165 - nodes in this community are weakly interconnected._