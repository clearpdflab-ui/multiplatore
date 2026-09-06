# Multiplatore — Piano di Sviluppo Completo

## Stato Attuale
- React 19 + TypeScript + Vite + Tailwind CSS v4
- 1000+ righe di engine matematico in un solo file (`mathEngine.ts`)
- 4 view funzionanti: Calendar, Live Slip Tracker, Simulator, Math Analysis
- Zero backend, zero test, zero autenticazione
- App puramente client-side

## Architettura Target
```
multiplatore/
├── public/                  # Static assets
├── server/                  # Express backend
│   ├── index.ts            # Server entry
│   ├── config/             # DB, env config
│   ├── routes/             # API routes
│   │   ├── auth.ts
│   │   ├── matches.ts
│   │   ├── slips.ts
│   │   └── odds.ts
│   ├── middleware/         # Auth, CORS, error handling
│   ├── models/            # SQLite models
│   └── services/          # Business logic
├── src/
│   ├── components/        # React components (suddivisi)
│   │   ├── layout/        # Header, Footer, Layout
│   │   ├── calendar/      # CalendarOddsMonitor
│   │   ├── tracker/       # LiveSlipTracker + subcomponents
│   │   ├── simulator/     # PracticalSimulator + subcomponents
│   │   ├── analysis/      # MathematicalAnalysis
│   │   └── ui/           # Shared UI components
│   ├── engine/            # Split mathEngine
│   │   ├── odds.ts        # Bookmaker aggio calculations
│   │   ├── dutching.ts    # Dutching stake calculation
│   │   ├── bonus.ts       # Bonus percentage logic
│   │   ├── slips.ts       # Slip generation (generateCustomSlips)
│   │   ├── timeline.ts    # Sequential timeline (buildSequentialTimeline)
│   │   ├── risk.ts        # Binomial risk calculations
│   │   └── index.ts       # Re-exports
│   ├── store/             # Zustand global state
│   │   ├── matchStore.ts
│   │   ├── slipStore.ts
│   │   └── uiStore.ts
│   ├── services/          # API clients, external services
│   │   ├── api.ts         # Axios/fetch wrapper
│   │   ├── oddsApi.ts     # The Odds API client
│   │   └── aiService.ts   # Gemini AI integration
│   ├── types/             # TypeScript types
│   ├── utils/             # Utilities
│   ├── hooks/             # Custom hooks
│   ├── data/              # Seed data
│   ├── App.tsx
│   └── main.tsx
├── tests/                 # Test files
│   ├── unit/
│   │   ├── odds.test.ts
│   │   ├── dutching.test.ts
│   │   ├── bonus.test.ts
│   │   ├── slips.test.ts
│   │   ├── timeline.test.ts
│   │   └── risk.test.ts
│   └── integration/
├── docs/                  # Documentation
├── docker/                # Docker configuration
├── .env.example
├── .env
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.app.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
├── .prettierrc
├── tailwind.config.ts
├── postcss.config.js
├── index.html
└── Dockerfile
```

## Fasi di Esecuzione

### Fase 1 — Code Quality & Architecture (3-5 giorni)
1. Configurare ESLint + Prettier
2. Aggiornare tsconfig con strict mode
3. Suddividere `mathEngine.ts` in moduli (`engine/`)
4. Creare struttura directory `src/engine/`
5. Aggiornare tutti i imports
6. Aggiungere Error Boundary component
7. Aggiungere `react-helmet-async` per SEO

### Fase 2 — Testing (2-3 giorni)
1. Configurare Vitest + Testing Library + jsdom
2. Scrivere test unitari per ogni modulo dell'engine
3. Scrivere test di integrazione per i componenti critici
4. Aggiungere coverage thresholds (80% minimum)
5. Configurare GitHub Actions per test automatici

### Fase 3 — Backend & Database (4-5 giorni)
1. Creare `server/index.ts` con Express
2. Configurare SQLite con better-sqlite3
3. Creare modelli database: Users, Matches, Slips, Bets
4. Creare API routes:
   - POST /api/auth/register
   - POST /api/auth/login
   - GET /api/matches
   - POST /api/matches
   - GET /api/slips
   - POST /api/slips/generate
   - GET /api/odds/:league
5. Middleware JWT authentication
6. CORS configuration
7. Error handling middleware

### Fase 4 — Auth & State Management (2-3 giorni)
1. Installare Zustand per global state
2. Creare matchStore, slipStore, uiStore
3. Aggiungere localStorage sync per persistenza
4. Implementare ErrorBoundary component
5. Aggiungere React Query (TanStack Query) per server state
6. Aggiungere loading states e skeleton screens

### Fase 5 — AI + Live Odds (2-3 giorni)
1. Integrare @google/genai per consigli scommesse
2. Creare `/api/ai/suggestions` endpoint
3. Integrare The Odds API per quote live real-time
4. Creare servizio di polling per odds aggiornati
5. Aggiungere notifiche per quote che cambiano

### Fase 6 — Features Avanzate (2-3 giorni)
1. Export PDF delle schedine (pdfkit)
2. Export CSV
3. Storico schedine e P&L tracking
4. Dashboard analytics
5. Filtri avanzati per storico

### Fase 7 — Landing Page (2-3 giorni)
1. Creare landing page marketing Next.js o nella stessa app
2. SEO ottimizzato
3. 11 elementi essenziali per conversione
4. Animazioni Framer Motion
5. Social proof section
6. CTA per download/app

### Fase 8 — Deploy & Infrastructure (2-3 giorni)
1. Dockerfile + docker-compose
2. GitHub Actions CI/CD pipeline
3. Deploy su Vercel (frontend) + Railway (backend)
4. Configurare dominio personalizzato
5. SSL/HTTPS automatico
6. Environment variables management

### Fase 9 — Monitoring & Polish (1-2 giorni)
1. Integrare Sentry per error tracking
2. Configurare Vercel Analytics
3. Performance optimization (lazy loading, code splitting)
4. PWA con service worker
5. Test su dispositivi mobili
6. Core Web Vitals optimization
7. Accessibility audit

## Stima Totale
- **18-27 giorni** di lavoro focused
- **2-3 mesi** con revisioni e test utente
- **Release V1**: Fasi 1-6 (~2 settimane)
- **Release V2**: Fasi 7-9 (~1 settimana aggiuntiva)
