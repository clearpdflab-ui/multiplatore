import React, { useState, useMemo, useEffect } from 'react';
import { UserMatch } from '../types';
import {
  bestCoverSide,
  byKickoffAsc,
  hasKickoffPassed,
  isKickoffTooSoon,
  parseLdlDateTime,
  type CoverOddsRow,
  type LdlMatchStatus,
  type LineStatus,
} from '../engine/coverOddsFeed';
import { fetchCoverFeed, fetchCoverSuggestions, fetchLdlBookmakers } from '../services/ldlOddsApi';
import {
  findHarmonizableLadders,
  type FinderCandidate,
  type FinderResult,
} from '../engine/finder';
import { runScout, type ScoutPick, type ScoutProgress } from '../engine/scout';
import { useScoutRuns } from '../hooks/useScoutRuns';
import { generateIdealLadders, type SynthResult } from '../engine/synth';
import { findRegistryBook } from '../engine/oddsFeed';
import { useBooks } from '../hooks/useBooks';
import { calculateBookmakerAggio } from '../utils/mathEngine';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Filter,
  Layers,
  Scale,
  Award,
  CheckSquare,
  Square,
  ChevronDown,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

interface CalendarOddsMonitorProps {
  onImportToTracker: (matches: UserMatch[]) => void;
  onNavigateToTracker: () => void;
}

const REFRESH_INTERVAL_MS = 60000;
const CALENDAR_WINDOW_DAYS = 10;
const MAX_AUTO_PAGES = 3;
// F17: regola relay — una partita selezionata deve avere almeno 2 ore di
// margine dall'ora attuale (tempo per piazzare madre + copertura).
const MIN_HOURS_TO_KICKOFF = 2;
const STORE_MADRE = 'multiscale_cal_madre_sites_v1';
const STORE_COPERTURA = 'multiscale_cal_copertura_sites_v1';

function loadStoredSites(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const arr = JSON.parse(raw);
    const ids = Array.isArray(arr) ? arr.map(Number).filter((n) => Number.isFinite(n)) : [];
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

interface LdlBookmaker {
  id: number;
  name: string;
}

function BookMultiSelect({
  label,
  options,
  selected,
  onChange,
  registeredIds,
  daysLimits,
}: {
  label: string;
  options: LdlBookmaker[];
  selected: number[];
  onChange: (ids: number[]) => void;
  registeredIds: Set<number>;
  daysLimits: Map<number, number>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  const visible = options.filter((o) => o.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1.5 text-xs font-mono bg-[#1A1D26] border border-[#2D3139] text-white rounded-xs flex items-center gap-1.5 hover:border-[#3B82F6]"
        title={`Book selezionati per: ${label}`}
      >
        <span className="text-[#94A3B8]">{label}:</span>
        <span className="font-bold">
          {selected.length > 0 ? `${selected.length} book` : 'nessuno'}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-72 bg-[#0F1117] border border-[#2D3139] rounded-sm shadow-xl">
            <div className="p-2 border-b border-[#2D3139]">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca bookmaker…"
                className="w-full bg-[#0A0B10] border border-[#2D3139] rounded-xs px-2 py-1 text-xs font-mono text-white outline-none focus:border-[#3B82F6]"
              />
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-[#20242C]">
              {visible.map((o) => {
                const limit = daysLimits.get(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-[#1A1D26] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(o.id)}
                      onChange={() => toggle(o.id)}
                      className="accent-[#3B82F6]"
                    />
                    <span className="text-white font-mono flex-1 truncate">{o.name}</span>
                    {registeredIds.has(o.id) && (
                      <span className="text-[9px] px-1 rounded-xs bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-mono">
                        reg
                      </span>
                    )}
                    {limit != null && (
                      <span
                        className="text-[9px] text-amber-300 font-mono"
                        title={`Multipla: gambe entro ${limit} giorni`}
                      >
                        ≤{limit}gg
                      </span>
                    )}
                  </label>
                );
              })}
              {visible.length === 0 && (
                <div className="p-3 text-[11px] font-mono text-[#64748B]">Nessun bookmaker.</div>
              )}
            </div>
            <div className="p-2 border-t border-[#2D3139] flex items-center justify-between">
              <button
                onClick={() => onChange([])}
                className="text-[10px] font-mono text-[#64748B] hover:text-white uppercase"
              >
                Azzera
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[10px] font-mono text-[#3B82F6] hover:text-white uppercase font-bold"
              >
                Chiudi
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatKickoff(iso: string): string {
  try {
    // F25: kickoff interpretato come UTC (vedi parseLdlDateTime), mostrato in
    // ora locale del browser.
    const t = parseLdlDateTime(iso);
    if (!Number.isFinite(t)) {
      return iso || '—';
    }
    const d = new Date(t);
    // F18: formato compatto richiesto dall'utente: "12-09 - 12:30"
    // (giorno-mese - ora:minuto, ora locale), leggibile anche nelle colonne
    // strette del workbench e sulle card delle schedine.
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}-${mm} - ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: LdlMatchStatus }) {
  switch (status) {
    case 'live':
      return (
        <span className="px-1.5 py-0.5 rounded-xs bg-red-600 text-white font-bold text-[10px] animate-pulse">
          LIVE
        </span>
      );
    case 'finished':
      return (
        <span className="px-1.5 py-0.5 rounded-xs bg-zinc-800 text-[#94A3B8] text-[10px]">
          FINALE
        </span>
      );
    case 'scheduled':
      return (
        <span className="px-1.5 py-0.5 rounded-xs bg-blue-950/60 text-blue-300 text-[10px]">
          PROGRAMMATA
        </span>
      );
    case 'postponed':
      return (
        <span className="px-1.5 py-0.5 rounded-xs bg-amber-950/60 text-amber-300 text-[10px]">
          POSTICIPATA
        </span>
      );
    default:
      return (
        <span className="px-1.5 py-0.5 rounded-xs bg-zinc-800 text-[#64748B] text-[10px]">
          ALTRO
        </span>
      );
  }
}

function LineStatusBadge({ lineStatus, line }: { lineStatus: LineStatus | null; line: number }) {
  if (!lineStatus) {
    return null;
  }
  if (lineStatus === 'over') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-xs font-bold bg-amber-950/60 text-amber-300 border border-amber-500/40">
        OVER {line} ATTIVO
      </span>
    );
  }
  if (lineStatus === 'warning') {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded-xs font-bold bg-orange-950/60 text-orange-300 border border-orange-500/40">
        A RISCHIO
      </span>
    );
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-xs font-bold bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
      UNDER {line} SICURO
    </span>
  );
}

export const CalendarOddsMonitor: React.FC<CalendarOddsMonitorProps> = ({
  onImportToTracker,
  onNavigateToTracker,
}) => {
  const [rows, setRows] = useState<CoverOddsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<'edge' | 'mock' | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [activeLeagueFilter, setActiveLeagueFilter] = useState<string>('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    'all' | 'scheduled' | 'live' | 'finished'
  >('all');
  // F16b: le partite GIA' INIZIATE (kickoff <= ora attuale) non vengono
  // proposte — niente lista, niente Trova Partite, niente import.
  const [hideStarted, setHideStarted] = useState<boolean>(true);
  // F17: alert se seleziono una partita a meno di 2 ore dall'avvio.
  const [selectionAlert, setSelectionAlert] = useState<string | null>(null);
  // F17: eventi marcati "solo 1° tempo" (per partite troppo vicine che si
  // decidono comunque di inserire, sul mercato del primo tempo).
  const [firstHalfIds, setFirstHalfIds] = useState<string[]>([]);
  // F19 — motore ricerca scale armonizzate: parametri + risultato.
  const [fBase, setFBase] = useState('40');
  const [fTarget, setFTarget] = useState('45');
  const [fMinN, setFMinN] = useState('6');
  const [fMaxN, setFMaxN] = useState('9');
  const [fLay, setFLay] = useState(''); // '' = auto (Under ultimo match scala)
  const [fComm, setFComm] = useState('4.5');
  // F23 — budget totale ipotetico I_tot ('' = sizing dutch classico).
  const [fBudget, setFBudget] = useState('');
  // F27 — modo ROI + tetto S0 nella ricerca scale.
  const [fTargetMode, setFTargetMode] = useState<'fixed' | 'roi'>('fixed');
  const [fRoiPct, setFRoiPct] = useState('4');
  const [fBaseCap, setFBaseCap] = useState('10');
  const [finderLoading, setFinderLoading] = useState(false);
  const [finderResult, setFinderResult] = useState<FinderResult | null>(null);
  const [finderLayUsed, setFinderLayUsed] = useState<string>('auto');
  // Scout Radar: caccia autonoma (P1-P3). Legge `rows`, scrive la shortlist
  // sola-lettura via useScoutRuns (locale + cloud).
  const { latest: scoutLatest, saveRun: saveScoutRun, clearRuns: clearScoutRuns } = useScoutRuns();
  const [scoutLoading, setScoutLoading] = useState(false);
  const [scoutProgress, setScoutProgress] = useState<ScoutProgress | null>(null);
  const [scoutMsg, setScoutMsg] = useState<string | null>(null);
  // F24 — Scala Ideale inversa: tu dai q0 + target, il motore propone N* e quote.
  const [sQ0, setSQ0] = useState('1.40');
  const [sTarget, setSTarget] = useState('45');
  const [sBase, setSBase] = useState('1');
  const [sOver, setSOver] = useState('2.75');
  const [sLay, setSLay] = useState('');
  const [sComm, setSComm] = useState('4.5');
  const [sMinN, setSMinN] = useState('5');
  const [sMaxN, setSMaxN] = useState('30');
  // F26 — linea Totals variabile (1.5/2.5/3.5/4.5)
  const [selectedLine, setSelectedLine] = useState<number>(3.5);
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthResult, setSynthResult] = useState<SynthResult | null>(null);
  // F20 — matrice per-ramo espandibile per candidato (chiave modo+eventi).
  const [matrixOpen, setMatrixOpen] = useState<string | null>(null);
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [ldlErrors, setLdlErrors] = useState<string[]>([]);
  // Coppia book per la ricerca /puntapunta: madre=book con Under (sites1),
  // copertura=book con Over (sites2PuntaPunta). Multi-selezione libera:
  // default = book registrati nel gestionale (match per nome), altrimenti
  // Lottomatica[16] -> Sisal[23] (ricerca standard OddsScasser).
  const [bookmakers, setBookmakers] = useState<LdlBookmaker[]>([]);
  const { books: registryBooks } = useBooks();
  const [madreSites, setMadreSites] = useState<number[]>(() => loadStoredSites(STORE_MADRE) ?? []);
  const [coperturaSites, setCoperturaSites] = useState<number[]>(
    () => loadStoredSites(STORE_COPERTURA) ?? [],
  );
  const [oddsMin, setOddsMin] = useState('1,25');
  const [targetCount, setTargetCount] = useState('30');
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoMsg, setAutoMsg] = useState<string | null>(null);

  const parsedOddsMin = useMemo(() => {
    const v = parseFloat(oddsMin.replace(',', '.'));
    return Number.isFinite(v) && v > 1 ? v : 1.25;
  }, [oddsMin]);

  const parsedTarget = useMemo(
    () => Math.min(30, Math.max(3, parseInt(targetCount, 10) || 30)),
    [targetCount],
  );

  // Book LDL -> book gestionale: id dei registrati + limiti giorni multipla.
  const registeredLdlIds = useMemo(() => {
    const active = registryBooks.filter((b) => b.isActive);
    const set = new Set<number>();
    if (!active.length) {
      return set;
    }
    for (const b of bookmakers) {
      if (findRegistryBook(active, b.name)) {
        set.add(b.id);
      }
    }
    return set;
  }, [bookmakers, registryBooks]);

  const daysLimitsByLdlId = useMemo(() => {
    const active = registryBooks.filter((b) => b.isActive);
    const map = new Map<number, number>();
    if (!active.length) {
      return map;
    }
    for (const b of bookmakers) {
      const limit = findRegistryBook(active, b.name)?.multiDaysLimit ?? null;
      if (limit != null && limit >= 1) {
        map.set(b.id, limit);
      }
    }
    return map;
  }, [bookmakers, registryBooks]);

  // Default di selezione: book registrati (pre-spuntati), fallback 16/23.
  useEffect(() => {
    if (!bookmakers.length) {
      return;
    }
    const registered = [...registeredLdlIds];
    setMadreSites((prev) => (prev.length ? prev : registered.length ? registered : [16]));
    setCoperturaSites((prev) => (prev.length ? prev : registered.length ? registered : [23]));
  }, [bookmakers, registeredLdlIds]);

  useEffect(() => {
    if (madreSites.length) {
      localStorage.setItem(STORE_MADRE, JSON.stringify(madreSites));
    }
  }, [madreSites]);
  useEffect(() => {
    if (coperturaSites.length) {
      localStorage.setItem(STORE_COPERTURA, JSON.stringify(coperturaSites));
    }
  }, [coperturaSites]);

  const madreKey = madreSites.join(',');
  const coperturaKey = coperturaSites.join(',');

  // F9: una volta ottenuti dati reali, un refresh che fallisce NON deve
  // sostituirli con il mock: si tengono gli ultimi buoni + errore in banner.
  const hasEdgeDataRef = React.useRef(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // F26: cambiando linea, i dati della vecchia linea non devono mai restare
  // visibili come se fossero quelli correnti: si azzera tutto e si ricarica.
  useEffect(() => {
    hasEdgeDataRef.current = false;
    setRows([]);
    setSource(null);
    setLdlErrors([]);
  }, [selectedLine]);

  async function loadRows() {
    if (!madreSites.length || !coperturaSites.length) {
      return;
    }
    setLoading(true);
    try {
      const r = await fetchCoverFeed({
        sites1: madreSites,
        sites2PuntaPunta: coperturaSites,
        dateTo: new Date(Date.now() + CALENDAR_WINDOW_DAYS * 24 * 3600_000).toISOString(),
        line: selectedLine,
      });
      if (r.source === 'edge') {
        hasEdgeDataRef.current = true;
        setRows(r.matches);
        setSource('edge');
        setLdlErrors(r.errors);
        setLastUpdatedAt(Date.now());
      } else {
        setLdlErrors(r.errors);
        if (!hasEdgeDataRef.current) {
          setRows(r.matches);
          setSource('mock');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    fetchLdlBookmakers()
      .then((list) =>
        setBookmakers(
          list.length
            ? list
            : [
                { id: 16, name: 'Lottomatica' },
                { id: 23, name: 'Sisal' },
              ],
        ),
      )
      .catch(() =>
        setBookmakers([
          { id: 16, name: 'Lottomatica' },
          { id: 23, name: 'Sisal' },
        ]),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [madreKey, coperturaKey, selectedLine]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }
    const interval = setInterval(() => {
      void loadRows();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // loadRows richiama madreSites/coperturaSites: senza deps aggiornate il
    // timer manterrebbe la vecchia coppia di book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, madreKey, coperturaKey, selectedLine]);

  // F23: la lega da sola e' ambigua ("Serie A" = Italia E Brasile nel feed
  // LDL): filtro e label usano lega + nazione.
  const leagueKey = (league: string, country: string): string =>
    country ? `${league} (${country})` : league;
  const leagues = useMemo(() => {
    const seen = new Map<string, { league: string; country: string }>();
    for (const r of rows) {
      const key = leagueKey(r.league, r.country);
      if (!seen.has(key)) {
        seen.set(key, { league: r.league, country: r.country });
      }
    }
    return Array.from(seen.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({ key, ...v }));
  }, [rows]);

  // Errori auth LDL: la edge function marca i problemi token con prefisso "TOKEN:".
  const tokenIssue = useMemo(
    () => ldlErrors.find((e) => e.includes('TOKEN:')) ?? null,
    [ldlErrors],
  );

  const filteredRows = useMemo(() => {
    // F16: la lista e' proposta in ordine di data/ora di kickoff CRESCENTE
    // (prima le partite piu' vicine nel tempo), non per rating del feed.
    // F16b: di default le partite gia' iniziate (kickoff <= ora attuale) non
    // vengono menzionate; l'ora e' ricalcolata a ogni refresh dei dati (60s).
    const now = Date.now();
    return rows
      .filter((r) => {
        if (hideStarted && hasKickoffPassed(r, now)) {
          return false;
        }
        if (activeLeagueFilter !== 'all' && leagueKey(r.league, r.country) !== activeLeagueFilter) {
          return false;
        }
        if (activeStatusFilter !== 'all' && r.status !== activeStatusFilter) {
          return false;
        }
        return true;
      })
      .sort(byKickoffAsc);
  }, [rows, activeLeagueFilter, activeStatusFilter, hideStarted]);

  const toggleMatchSelection = (row: CoverOddsRow) => {
    const eventId = row.eventId;
    const wasSelected = selectedEventIds.includes(eventId);
    setSelectedEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    );
    // Deselezionando si perde anche l'eventuale flag "solo 1° tempo".
    if (wasSelected) {
      setFirstHalfIds((prev) => prev.filter((id) => id !== eventId));
      setSelectionAlert(null);
      return;
    }
    // F17: selezione di una partita troppo vicina (<2h) -> alert popup.
    // La selezione resta (puoi decidere tu), ma devi saperlo subito: se vuoi
    // inserirla comunque, il bottone "Solo 1° tempo" sulla riga la porta sul
    // mercato del primo tempo.
    if (isKickoffTooSoon(row, Date.now(), MIN_HOURS_TO_KICKOFF)) {
      const minutes = Math.max(
        0,
        Math.round((parseLdlDateTime(row.kickoff) - Date.now()) / 60000),
      );
      setSelectionAlert(
        `⚠ ${row.home} - ${row.away} parte tra ${minutes} minuti (meno di ${MIN_HOURS_TO_KICKOFF} ore): ` +
          `tempo insufficiente per piazzare madre e copertura con calma. Se vuoi inserirla comunque, ` +
          `usa il bottone "Solo 1° tempo" sulla riga: la partita entra sul mercato del primo tempo ` +
          `(poi aggiorna le quote nel workbench).`,
      );
      setTimeout(() => setSelectionAlert(null), 10000);
    }
  };

  // F17: marca/demarca una partita troppo vicina come "solo 1° tempo" e la
  // tiene selezionata per l'import.
  const toggleFirstHalf = (row: CoverOddsRow) => {
    const eventId = row.eventId;
    const active = firstHalfIds.includes(eventId);
    setFirstHalfIds((prev) =>
      active ? prev.filter((id) => id !== eventId) : [...prev, eventId],
    );
    if (!active) {
      setSelectedEventIds((prev) =>
        prev.includes(eventId) ? prev : [...prev, eventId],
      );
      setSelectionAlert(
        `⏱ ${row.home} - ${row.away} inserita SOLO sul 1° tempo: nel workbench aggiorna le quote ` +
          `Under/Over di questa partita con quelle del primo tempo.`,
      );
      setTimeout(() => setSelectionAlert(null), 8000);
    }
  };

  // F19: lancia il motore di ricerca scale armonizzate sulla pool corrente.
  // F21: accetta override per i bottoni "riprova con..." (evita state staleness).
  async function runFinder(overrides?: { lay?: string; minN?: string; maxN?: string; oddsMin?: string }) {
    setFinderLoading(true);
    setFinderResult(null);
    try {
      // lascia dipingere lo spinner prima del calcolo sincrono (beam search)
      await new Promise((resolve) => setTimeout(resolve, 30));
      const layStr = overrides?.lay ?? fLay;
      const layNum = parseFloat(layStr.replace(',', '.'));
      const layParam: 'prematch' | number = Number.isFinite(layNum) && layNum > 1 ? layNum : 'prematch';
      setFinderLayUsed(
        layParam === 'prematch' ? 'auto pre-match' : `@${layNum.toFixed(2)}`,
      );
      const minStr = overrides?.minN ?? fMinN;
      const maxStr = overrides?.maxN ?? fMaxN;
      const budgetNum = parseFloat(fBudget.replace(',', '.'));
      const oddsStr = overrides?.oddsMin ?? oddsMin;
      const oddsNum = parseFloat(oddsStr.replace(',', '.'));
      const roiNum = parseFloat(fRoiPct.replace(',', '.'));
      const capNum = parseFloat(fBaseCap.replace(',', '.'));
      const res = findHarmonizableLadders({
        rows,
        now: Date.now(),
        baseStake: Math.max(1, parseFloat(fBase.replace(',', '.')) || 40),
        targetProfit: Math.max(5, parseFloat(fTarget.replace(',', '.')) || 45),
        layCommissionPct: Math.min(20, Math.max(0, parseFloat(fComm.replace(',', '.')) || 0)),
        lay: layParam,
        oddsMin: Math.max(1, Number.isFinite(oddsNum) ? oddsNum : 1),
        minEvents: Math.max(2, parseInt(minStr, 10) || 6),
        maxEvents: Math.min(15, Math.max(2, parseInt(maxStr, 10) || 9)),
        topK: 3,
        budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
        targetMode: fTargetMode,
        roiPct: Number.isFinite(roiNum) && roiNum > 0 ? roiNum : undefined,
        baseCap: Number.isFinite(capNum) && capNum > 0 ? capNum : undefined,
      });
      setFinderResult(res);
    } catch (e) {
      setFinderResult({
        feasible: [],
        best: null,
        closestMaxLay: null,
        fallback: null,
        closest: null,
        poolSize: 0,
        skippedDuplicates: 0,
        skippedGap: 0,
        evaluations: 0,
        budgetHit: false,
      });
      setAutoMsg(`⚠ Motore scale: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFinderLoading(false);
    }
  }

  // F19: importa nel tracker la scala trovata dal motore (riusa il percorso
  // di import standard: sort kickoff, guardie started/1T).
  const importFinderCandidate = (c: FinderCandidate) => {
    setSelectedEventIds(c.eventIds);
    handleImportSelected(c.eventIds);
  };

  // Scout Radar (P3): spazza pool × S0 × r% × scenari lay e promuove solo il
  // verificato (tutti gli N+1 rami + shock). Scrive la shortlist sola-lettura.
  const handleRunScout = async () => {
    if (scoutLoading || rows.length === 0) {
      return;
    }
    setScoutLoading(true);
    setScoutProgress(null);
    setScoutMsg(null);
    try {
      const s0num = Math.max(1, parseFloat(fBase.replace(',', '.')) || 10);
      const oddsNum = parseFloat(oddsMin.replace(',', '.'));
      const res = await runScout(
        rows,
        {
          s0: [s0num],
          roiPct: [4],
          layDiscount: [0, 0.1, 0.2, 0.3],
          minEvents: Math.max(2, parseInt(fMinN, 10) || 2),
          maxEvents: Math.min(9, Math.max(2, parseInt(fMaxN, 10) || 6)),
          oddsMin: Math.max(1.25, Number.isFinite(oddsNum) ? oddsNum : 1.25),
          layCommissionPct: Math.min(20, Math.max(0, parseFloat(fComm.replace(',', '.')) || 0)),
          baseCap: s0num,
          topK: 10,
        },
        {
          onProgress: (p) => setScoutProgress(p),
        },
      );
      await saveScoutRun(res);
      setScoutMsg(
        res.picks.length > 0
          ? `Radar: ${res.picks.length} scale promosse su ${res.evaluatedWindows} finestre (${res.exactSolves} verifiche, ${(res.msElapsed / 1000).toFixed(1)}s).`
          : `Radar: niente da giocare — ${res.evaluatedWindows} finestre vagliate, tutte scartate con motivo. Vedi ragioni sotto.`,
      );
    } catch (e) {
      setScoutMsg(`Radar fallito: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setScoutLoading(false);
    }
  };

  const scoutScenarioBadge = (p: ScoutPick): string =>
    p.layScenario === 'prematch'
      ? 'pre-match'
      : p.layScenario === 'inplay-10'
        ? 'lay −10% in-play?'
        : p.layScenario === 'inplay-20'
          ? 'lay −20% in-play?'
          : p.layScenario === 'inplay-30'
            ? 'lay −30% in-play?'
            : 'lay scontata?';

  const renderScoutPick = (p: ScoutPick, idx: number) => {
    const expired = p.expiresAtMs !== null && p.expiresAtMs <= Date.now();
    const shock = (ok: boolean, label: string, title: string) => (
      <span
        key={label}
        title={title}
        className={`px-1 py-0.2 rounded-xs border font-mono ${ok ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-zinc-800 text-[#64748B] border-zinc-700'}`}
      >
        {ok ? '✓' : '·'}
        {label}
      </span>
    );
    return (
      <div
        key={p.key}
        className={`border rounded-xs p-2.5 ${expired ? 'border-zinc-700 bg-[#141824] opacity-60' : 'border-emerald-500/40 bg-emerald-500/5'}`}
      >
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="text-white font-bold">
            #{idx + 1} · {p.n} eventi · linea {p.line}
          </span>
          <span
            title={
              p.layScenario === 'prematch'
                ? 'Chiude ai prezzi osservati ora'
                : "Chiude SE la lay dell'ultimo scende del X% in-play (ipotesi da monitorare, non garanzia)"
            }
            className={`px-1.5 py-0.2 rounded-xs border font-bold ${p.layScenario === 'prematch' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-amber-500/15 text-amber-300 border-amber-500/40'}`}
          >
            {scoutScenarioBadge(p)}
          </span>
          <span className="text-emerald-300 font-bold" title="Utile garantito minimo su ogni esito">
            ≥ €{p.equalizedNet.toFixed(2)}
          </span>
          <span className="text-[#94A3B8]" title={`Target ${p.roiPct}% di €${p.exposure.toFixed(2)} esposti`}>
            (t €{p.targetUsed.toFixed(2)} · E €{p.exposure.toFixed(2)})
          </span>
          <span className="text-[#94A3B8]">
            {p.finaleMode === 'lay'
              ? `banca @${p.layQuote.toFixed(2)} (max @${p.maxLayQuote.toFixed(2)})`
              : 'punta/punta'}
          </span>
          {expired && <span className="text-red-300 font-bold">SCADUTA</span>}
        </div>
        <div className="mt-1.5 grid sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#94A3B8]">
          {p.legs.map((l, i) => (
            <div key={i} className="truncate" title={`${l.home} - ${l.away} · ${l.league} · ${l.kickoff}`}>
              <span className="text-[#64748B]">{i + 1}.</span> {l.home} - {l.away}{' '}
              <span className="text-white">
                U@{l.under.toFixed(2)} O@{l.over.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
          <span className="text-[#64748B] font-mono">shock:</span>
          {shock(p.shocks.quoteMinus5, 'Q−5%', 'Regge a quote −5%')}
          {shock(p.shocks.quoteMinus10, 'Q−10%', 'Regge a quote −10%')}
          {shock(p.shocks.layPlus01, 'L+10', 'Regge a lay +0.10')}
          {shock(p.shocks.layPlus02, 'L+20', 'Regge a lay +0.20')}
          {shock(p.shocks.comm5, 'C5%', 'Regge a commissione 5%')}
          {shock(p.shocks.noBonus, 'NB', 'Regge senza bonus Over')}
        </div>
      </div>
    );
  };

  // F24: lancia il generatore di scala ideale (q0 + target -> N* e quote).
  async function runSynth() {
    setSynthLoading(true);
    setSynthResult(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      const num = (v: string, fb: number) => {
        const n = parseFloat(v.replace(',', '.'));
        return Number.isFinite(n) ? n : fb;
      };
      const layStr = sLay.trim();
      const layNum = parseFloat(layStr.replace(',', '.'));
      setSynthResult(
        generateIdealLadders({
          q0: Math.max(1, num(sQ0, 1.4)),
          targetProfit: Math.max(5, num(sTarget, 45)),
          baseStake: Math.max(1, num(sBase, 1)),
          overQ: Math.max(1.25, num(sOver, 2.75)),
          layCommissionPct: Math.min(20, Math.max(0, num(sComm, 4.5))),
          layQuote: layStr === '' || !(Number.isFinite(layNum) && layNum > 1) ? undefined : layNum,
          nMin: Math.max(2, Math.floor(num(sMinN, 5)) || 5),
          nMax: Math.min(30, Math.max(2, Math.floor(num(sMaxN, 30)) || 30)),
          topK: 3,
          line: selectedLine,
        }),
      );
    } catch (e) {
      setAutoMsg(`⚠ Scala ideale: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSynthLoading(false);
    }
  }

  // F24: usa le quote ideali come filtro per la ricerca reale (oddsMin + rerun).
  const applyIdealAsFilter = (underQ: number) => {
    const v = underQ.toFixed(2).replace('.', ',');
    setOddsMin(v);
    void runFinder({ oddsMin: v });
  };

  // F21: card di una scala trovata (fattibile o fallback), con matrice.
  const renderFinderCard = (
    c: FinderCandidate,
    idx: number,
    badge: React.ReactNode,
  ): React.ReactNode => {
                const mKey = `${c.finaleMode}|${c.eventIds.join('|')}`;
                const isLay = c.finaleMode === 'lay';
                return (
                <div
                  key={mKey}
                  className="bg-[#141824] border border-emerald-500/30 rounded-xs p-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="font-mono text-xs font-bold text-white">
                      <span className="text-emerald-400">#{idx + 1}</span> Scala {c.n} eventi{' '}
                      <span
                        className="text-[10px] px-1.5 py-0.2 rounded-xs border bg-amber-500/20 text-amber-300 border-amber-500/40"
                        title={`Linea Totals di tutta la scala: Under/Over ${c.line}`}
                      >
                        U/O {c.line}
                      </span>{' '}
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-xs border ${
                          isLay
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        }`}
                        title={
                          isLay
                            ? `Finale in banca: LAY Under ultimo match @${c.layQuote.toFixed(2)} (fee ${c.layCommissionPct}%)`
                            : 'Finale in punta/punta: singola Over in bookmaker, dutching puro senza banca'
                        }
                      >
                        {isLay ? `BANCA @${c.layQuote.toFixed(2)}` : 'PUNTA/PUNTA'}
                      </span>{' '}
                      — garantito{' '}
                      <span className="text-emerald-400">≥ +€{(c.equalizedNet ?? 0).toFixed(2)}</span>{' '}
                      su OGNI esito
                      {badge}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setMatrixOpen(matrixOpen === mKey ? null : mKey)}
                        className="px-3 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#94A3B8] hover:text-white border border-[#2D3139] font-mono font-bold text-xs rounded-xs transition-colors"
                        title="Mostra la matrice completa: per ogni ramo (S0, C1.., finale) stake, quota, payout e netto se vince"
                      >
                        {matrixOpen === mKey ? 'Nascondi matrice' : 'Matrice'}
                      </button>
                      <button
                        onClick={() => importFinderCandidate(c)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xs transition-colors"
                        title="Importa questa scala nel workbench (riarmonizzata con i tuoi parametri)"
                      >
                        Importa scala
                      </button>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#94A3B8] mb-2">
                    {c.rows.map((r, i) => (
                      <div key={r.eventId} className="truncate">
                        <span className="text-[#64748B]">#{i + 1}</span> {r.home} - {r.away}{' '}
                        <span className="text-[#64748B]">({formatKickoff(r.kickoff)})</span>
                      </div>
                    ))}
                  </div>
                    <div className="font-mono text-[11px] text-[#E0E2E7] flex flex-wrap gap-x-4 gap-y-1">
                    <span title="Puntate bookmaker S0 + C1..: la scala dutcha a payout comune">
                      Book €{c.bookStakes.toFixed(2)} ({c.stakes.slice(0, -1).join(' / ')})
                    </span>
                    {isLay ? (
                      <span title="Bancata exchange dimensionata sul ramo peggiore">
                        Banca €{c.stakes[c.stakes.length - 1].toFixed(2)} (resp €
                        {c.liability.toFixed(2)} @{c.layQuote.toFixed(2)})
                      </span>
                    ) : (
                      <span title="Singola finale Over in bookmaker (ultimo stake della dutched)">
                        Singola €{c.stakes[c.stakes.length - 1].toFixed(2)}
                      </span>
                    )}
                    <span>Esposizione €{c.exposure.toFixed(2)}</span>
                    <span>Madre lorda €{c.motherGross.toFixed(2)}</span>
                    <span title="Copertura con 1/quota più alta: la gamba che comanda la chiusura">
                      Gamba critica C{c.bindingStep}
                    </span>
                    {isLay ? (
                      <span>lay max @{c.maxLayQuote.toFixed(2)}</span>
                    ) : (
                      <span>Σ(1/quota) {c.sumInverse.toFixed(3)} &lt; 1 ✓</span>
                    )}
                    {matrixOpen === mKey && (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full text-left font-mono text-[11px] border-collapse">
                          <thead>
                            <tr className="border-b border-[#2D3139] text-[#64748B] text-[10px] uppercase">
                              <th className="p-1.5">Ramo vincente</th>
                              <th className="p-1.5">Composizione</th>
                              <th className="p-1.5 text-right">Quota</th>
                              <th className="p-1.5 text-right">Puntata €</th>
                              <th className="p-1.5 text-right">Payout €</th>
                              <th className="p-1.5 text-right text-emerald-400">Netto €</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#20242C]">
                            {c.legs.map((leg) => (
                              <tr key={leg.code} className="hover:bg-[#1A1D26]/40">
                                <td className="p-1.5 font-bold text-white">{leg.code}</td>
                                <td className="p-1.5 text-[#94A3B8]">{leg.desc}</td>
                                <td className="p-1.5 text-right text-white">{leg.mult.toFixed(2)}</td>
                                <td className="p-1.5 text-right text-[#3B82F6]">{leg.stake.toFixed(2)}</td>
                                <td className="p-1.5 text-right text-white">{leg.payout.toFixed(2)}</td>
                                <td className="p-1.5 text-right font-bold text-emerald-400">+{leg.net.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
                );
  };


  const deselectAll = () => {
    setSelectedEventIds([]);
    setFirstHalfIds([]);
  };

  // Finestra effettiva: min(10gg, limite giorni multipla piu' restrittivo tra
  // i book madre selezionati (dal gestionale).
  const motherWindowDays = useMemo(() => {
    let days = CALENDAR_WINDOW_DAYS;
    for (const idStr of madreKey.split(',').filter(Boolean)) {
      const limit = daysLimitsByLdlId.get(Number(idStr));
      if (limit != null) {
        days = Math.min(days, limit);
      }
    }
    return days;
  }, [madreKey, daysLimitsByLdlId]);

  async function autoFindMatches() {
    if (!madreSites.length || !coperturaSites.length) {
      setAutoMsg('⚠ Seleziona almeno un book madre e uno di copertura.');
      return;
    }
    setAutoLoading(true);
    setAutoMsg(null);
    try {
      const now = Date.now();
      const dateTo = new Date(now + motherWindowDays * 24 * 3600_000).toISOString();
      const seen = new Map<string, CoverOddsRow>();
      for (let page = 0; page < MAX_AUTO_PAGES; page++) {
        const r = await fetchCoverSuggestions({
          sites1: madreSites,
          sites2PuntaPunta: coperturaSites,
          oddsMin: parsedOddsMin,
          dateFrom: new Date(now).toISOString(),
          dateTo,
          size: 100,
          page,
          line: selectedLine,
        });
        let fresh = 0;
        for (const m of r.matches) {
          if (!seen.has(m.eventId)) {
            seen.set(m.eventId, m);
            fresh++;
          }
        }
        const candidates = [...seen.values()].filter((row) => {
          if (row.status !== 'scheduled') {
            return false;
          }
          const under = bestCoverSide(row, 'under');
          const over = bestCoverSide(row, 'over');
          return Boolean(under && over && under.odds >= parsedOddsMin);
        });
        // Risposta breve o nessuna riga nuova = altre pagine inutili.
        if (r.matches.length < 100 || fresh === 0 || candidates.length >= parsedTarget) {
          break;
        }
      }
      // F16: la proposta e' in ordine di data/ora CRESCENTE — si selezionano
      // le partite idonee PIU' VICINE NEL TEMPO (il relay e' sequenziale), non
      // le meglio classificate per rating. Il resta visibile come badge.
      // F16b: le partite gia' iniziate (kickoff <= ora attuale) mai proposte,
      // anche se il feed le mostra ancora 'scheduled' (dato lento).
      const candidates = [...seen.values()]
        .filter((row) => {
          if (row.status !== 'scheduled') {
            return false;
          }
          if (hasKickoffPassed(row, now)) {
            return false;
          }
          const under = bestCoverSide(row, 'under');
          const over = bestCoverSide(row, 'over');
          return Boolean(under && over && under.odds >= parsedOddsMin);
        })
        .sort(byKickoffAsc)
        .slice(0, parsedTarget);
      setSelectedEventIds(candidates.map((r) => r.eventId));

      let msg = `Selezionate ${candidates.length}/${parsedTarget} partite (Under ≥ ${parsedOddsMin.toFixed(2)}, finestra ${motherWindowDays}gg, ordine data/ora ↑)`;
      // F17: segnala se tra le selezionate ce n'e' qualcuna a <2h dall'avvio
      const tooSoon = candidates.filter((r) =>
        isKickoffTooSoon(r, now, MIN_HOURS_TO_KICKOFF),
      );
      if (tooSoon.length > 0) {
        msg += ` · ⚠ ${tooSoon.length} a meno di ${MIN_HOURS_TO_KICKOFF}h dall'avvio`;
      }
      if (candidates.length < parsedTarget) {
        msg += ' · nel calendario non ci sono altre partite idonee con questi filtri';
      }
      const times = candidates
        .map((r) => parseLdlDateTime(r.kickoff))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      if (times.length > 1) {
        const spreadDays = Math.ceil((times[times.length - 1] - times[0]) / (24 * 3600_000));
        if (spreadDays > motherWindowDays) {
          msg += ` · ⚠ spread ${spreadDays}gg: supera il limite ${motherWindowDays}gg dei book madre`;
        }
      }
      setAutoMsg(msg);
    } catch (e) {
      setAutoMsg(`⚠ Ricerca non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAutoLoading(false);
    }
  }

  // F19: accetta gli id espliciti (import diretto di una scala trovata dal
  // motore) oppure usa la selezione corrente.
  const handleImportSelected = (ids?: string[]) => {
    const sel = ids ?? selectedEventIds;
    // F16b: guardia finale — una partita gia' iniziata non entra mai nella
    // multipla, nemmeno se selezionata a mano con il filtro "mostra" attivo.
    const now = Date.now();
    const matchesToImport = rows.filter(
      (r) => sel.includes(r.eventId) && !hasKickoffPassed(r, now),
    );
    const skippedStarted = sel.length - matchesToImport.length;
    const sorted = [...matchesToImport].sort(
      (a, b) => parseLdlDateTime(a.kickoff) - parseLdlDateTime(b.kickoff),
    );

    const userMatches: UserMatch[] = [];
    sorted.forEach((row, idx) => {
      const under = bestCoverSide(row, 'under');
      const over = bestCoverSide(row, 'over');
      if (!under || !over) {
        return;
      }

      let outcome: 'PENDING' | 'UNDER' | 'OVER' = 'PENDING';
      if (row.lineStatus === 'over') {
        outcome = 'OVER';
      } else if (row.status === 'finished' && row.lineStatus === 'safe') {
        outcome = 'UNDER';
      }

      userMatches.push({
        id: `m_ldl_${row.eventId}_${Date.now()}_${idx}`,
        order: idx + 1,
        timeSlot: formatKickoff(row.kickoff),
        homeTeam: row.home,
        awayTeam: row.away,
        underOdds: under.odds,
        overOdds: over.odds,
        outcome,
        resultScore: row.totalGoals !== null ? `${row.homeScore} - ${row.awayScore}` : undefined,
        kickoff: row.kickoff || undefined,
        firstHalfOnly: firstHalfIds.includes(row.eventId) || undefined,
        note: `${row.league}${row.country ? ` (${row.country})` : ''} (U:${under.book} / O:${over.book})${firstHalfIds.includes(row.eventId) ? ' · solo 1° tempo' : ''}`,
        line: row.line,
        // F31 prenotate: vincolo book per lato + offerte per poter cambiare nel workbench.
        underBook: under.book,
        overBook: over.book,
        feedBooks: row.books
          .filter((b) => b.under !== null || b.over !== null)
          .map((b) => ({ book: b.book, under: b.under, over: b.over })),
      });
    });

    if (userMatches.length === 0) {
      return;
    }

    onImportToTracker(userMatches);
    setImportNotification(
      `✅ ${userMatches.length} partite importate con quote reali liberidalavoro.it! Reindirizzamento in corso...` +
        (skippedStarted > 0 ? ` (${skippedStarted} già iniziate escluse)` : ''),
    );
    setTimeout(() => {
      setImportNotification(null);
      onNavigateToTracker();
    }, 900);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-[#3B82F6] text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-xs flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Live Feed &amp; Calendario
              </span>
              <span className="text-xs text-[#94A3B8] font-mono">
                Quote reali liberidalavoro.it/OddsScasser
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Calendario Partite &amp; Monitoraggio Bookmaker Live
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 max-w-3xl leading-relaxed">
              Partite ed quote under/over {selectedLine} recuperate in tempo reale dal feed OddsScasser su
              finestra di <strong className="text-white">{CALENDAR_WINDOW_DAYS} giorni</strong>. Usa{' '}
              <strong className="text-blue-300">Trova Partite</strong> per selezionare in automatico
              fino a 30 eventi con copertura completa e quota Under sopra la soglia, sui book in cui
              sei registrato. Seleziona le partite per generare la{' '}
              <strong className="text-emerald-400">Schedina Madre</strong>.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <BookMultiSelect
              label="Madre (Under)"
              options={bookmakers}
              selected={madreSites}
              onChange={setMadreSites}
              registeredIds={registeredLdlIds}
              daysLimits={daysLimitsByLdlId}
            />
            <BookMultiSelect
              label="Copertura (Over)"
              options={bookmakers}
              selected={coperturaSites}
              onChange={setCoperturaSites}
              registeredIds={registeredLdlIds}
              daysLimits={daysLimitsByLdlId}
            />
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-[#94A3B8]">
              Linea
              <select
                value={selectedLine}
                onChange={(e) => setSelectedLine(parseFloat(e.target.value))}
                className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-xs text-white font-mono"
                title="Linea Totals del feed (Under/Over): ricarica calendario, Trova Partite, Scala Ideale e ricerca scale"
              >
                <option value="1.5">1.5</option>
                <option value="2.5">2.5</option>
                <option value="3.5">3.5</option>
                <option value="4.5">4.5</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-[#94A3B8]">
              Quota min
              <input
                type="number"
                step="0.05"
                min="1.05"
                value={oddsMin}
                onChange={(e) => setOddsMin(e.target.value)}
                className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-xs text-white font-mono"
                title="Quota Under minima della madre (filtro server-side /puntapunta)"
              />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-mono text-[#94A3B8]">
              N
              <input
                type="number"
                min="3"
                max="30"
                value={targetCount}
                onChange={(e) => setTargetCount(e.target.value)}
                className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-xs text-white font-mono"
                title="Numero di partite da selezionare automaticamente"
              />
            </label>
            <button
              onClick={() => void autoFindMatches()}
              disabled={autoLoading || loading || !madreSites.length || !coperturaSites.length}
              className="px-3 py-1.5 text-xs font-mono font-bold rounded-xs border flex items-center gap-1.5 transition-colors bg-[#3B82F6]/10 hover:bg-[#3B82F6]/25 text-blue-300 border-blue-500/40 disabled:opacity-50"
              title={`Cerca nel calendario dei prossimi ${motherWindowDays} giorni le partite con copertura completa e quota Under >= soglia, e seleziona le ${parsedTarget} migliori per rating`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${autoLoading ? 'animate-pulse' : ''}`} />
              <span>
                {autoLoading ? 'Ricerca…' : `Trova ${parsedTarget} Partite (${motherWindowDays}gg)`}
              </span>
            </button>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 text-xs font-mono rounded-xs border transition-colors flex items-center gap-1.5 ${
                autoRefresh
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139]'
              }`}
              title="Aggiornamento automatico ogni 60s dal feed OddsScasser"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{autoRefresh ? 'Auto-Refresh Attivo' : 'Auto-Refresh Pausa'}</span>
            </button>

            <button
              onClick={() => void loadRows()}
              disabled={loading}
              className="px-2.5 py-1.5 text-xs font-mono text-[#94A3B8] hover:text-white bg-[#1A1D26] border border-[#2D3139] rounded-xs disabled:opacity-50"
              title="Ricarica ora le quote dal feed OddsScasser"
            >
              {loading ? 'Carico…' : 'Aggiorna Ora'}
            </button>
          </div>
        </div>
      </div>

      {/* F24 — Scala Ideale inversa: dai q0 + target, il motore propone N* e quote */}
      <div className="bg-[#0F1117] border border-violet-500/30 p-4 rounded-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              Scala Ideale
              <span className="text-[10px] px-1.5 py-0.2 bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-xs">
                q0 + target → N* e quote
              </span>
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5 max-w-3xl">
              Tu dai <strong className="text-white">quota iniziale</strong> e{' '}
              <strong className="text-white">target finale</strong>: il motore propone numero
              eventi e quote ideali (mai sotto 1.25) che chiudono in positivo su ogni ramo.
              Poi cerchi i mercati reali più vicini.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs shrink-0">
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Quota iniziale di riferimento (Under madre)">
              q0
              <input type="number" step="0.01" min="1.25" value={sQ0} onChange={(e) => setSQ0(e.target.value)} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Netto garantito voluto su ogni ramo">
              Target €
              <input type="number" step="5" min="5" value={sTarget} onChange={(e) => setSTarget(e.target.value)} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-emerald-400 font-bold" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Puntata base S0 (anche 1€)">
              Base €
              <input type="number" step="1" min="1" value={sBase} onChange={(e) => setSBase(e.target.value)} className="w-14 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Quota Over uniforme di riferimento">
              Over
              <input type="number" step="0.05" min="1.25" value={sOver} onChange={(e) => setSOver(e.target.value)} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Linea Totals (1.5/2.5/3.5/4.5)">
              Linea
              <select value={selectedLine} onChange={(e) => setSelectedLine(parseFloat(e.target.value))} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white">
                <option value="1.5">1.5</option>
                <option value="2.5">2.5</option>
                <option value="3.5">3.5</option>
                <option value="4.5">4.5</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Eventi min-max da provare (tetto bonus 30)">
              N
              <input type="number" min="2" max="30" value={sMinN} onChange={(e) => setSMinN(e.target.value)} className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
              <span>–</span>
              <input type="number" min="2" max="30" value={sMaxN} onChange={(e) => setSMaxN(e.target.value)} className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <button
              onClick={() => void runSynth()}
              disabled={synthLoading}
              className="px-3 py-1.5 text-xs font-mono font-bold rounded-xs border flex items-center gap-1.5 transition-colors bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 border-violet-500/40 disabled:opacity-50"
              title="Genera le scale ideali: per ogni N valuta la matrice completa e tiene le migliori"
            >
              <Sparkles className={`w-3.5 h-3.5 ${synthLoading ? 'animate-pulse' : ''}`} />
              <span>{synthLoading ? 'Calcolo…' : 'Genera'}</span>
            </button>
          </div>
        </div>

        {synthResult && (
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono text-[#64748B]">
              {synthResult.evaluated} N valutati · q0 {synthResult.q0used.toFixed(2)}
              {synthResult.clamped ? ' (clampato a min 1.25)' : ''} · Over {synthResult.overUsed.toFixed(2)}
            </div>
            {synthResult.best === null ? (
              <div className="bg-red-950/30 border border-red-500/40 p-3 rounded-xs font-mono text-xs text-red-200">
                Nessun N chiude con queste quote/target: alza q0 o over, abbassa il target o la base.
              </div>
            ) : (
              synthResult.ladders.map((l, idx) => (
                <div key={l.n} className="bg-[#141824] border border-violet-500/30 rounded-xs p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="font-mono text-xs font-bold text-white">
                      <span className="text-violet-300">#{idx + 1}</span> N={l.n} eventi — Under ~
                      {l.unders[0].toFixed(2)} / Over ~{l.overs[0].toFixed(2)} — garantito{' '}
                      <span className="text-emerald-400">
                        ≥ +€{(l.sol.equalizedNet ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <button
                      onClick={() => applyIdealAsFilter(l.unders[0])}
                      className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xs transition-colors shrink-0"
                      title="Imposta la quota minima del Trova Partite e cerca partite reali vicine a queste quote"
                    >
                      Usa come filtro
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-[#E0E2E7] flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Stake S0 €{l.sol.stakes[0]?.toFixed(2) ?? '—'} → C{l.n - 1} €
                      {l.sol.stakes[l.sol.stakes.length - (l.sol.finaleMode === 'lay' ? 2 : 1)]?.toFixed(2) ?? '—'}
                    </span>
                    <span>Esposizione €{l.exposure.toFixed(2)}</span>
                    <span>Madre lorda €{l.sol.motherGross.toFixed(2)}</span>
                    <span>
                      {l.sol.finaleMode === 'lay'
                        ? `Banca (lay @${l.sol.layQuote.toFixed(2)}, resp €${l.sol.liability.toFixed(2)}, lay max @${l.sol.maxLayQuote.toFixed(2)})`
                        : 'Punta/punta (dutching puro)'}
                    </span>
                    <span className="text-[#64748B]">
                      margine {(l.margin * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* F19 — Motore ricerca scale armonizzate (regola mai-perdita) */}
      <div className="bg-[#0F1117] border border-emerald-500/30 p-4 rounded-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Trova Scala Armonizzata
              <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-xs">
                mai perdita
              </span>
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5 max-w-3xl">
              Il motore prova le sequenze cronologiche della pool e propone solo scale dove{' '}
              <strong className="text-white">OGNI esito finale</strong> (madre, qualsiasi
              copertura, banca) chiude ≥ target. I numeri vengono riarmonizzati nel workbench
              con i tuoi parametri all&apos;import.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs shrink-0">
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Numero eventi della scala (min-max, bonus da 5)">
              Eventi
              <input type="number" min="2" max="30" value={fMinN} onChange={(e) => setFMinN(e.target.value)} className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
              <span>–</span>
              <input type="number" min="2" max="30" value={fMaxN} onChange={(e) => setFMaxN(e.target.value)} className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Puntata base S0 usata nella ricerca">
              Base €
              <input type="number" step="1" min="1" value={fBase} onChange={(e) => setFBase(e.target.value)} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Utile garantito richiesto su ogni esito (modo € fisso)">
              Target €
              <input type="number" step="5" min="5" value={fTarget} onChange={(e) => setFTarget(e.target.value)} className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-emerald-400 font-bold" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Modo ROI: target = % del capitale (verifica stretta). Con ROI attivo il Target € è ignorato.">
              <button
                type="button"
                onClick={() => setFTargetMode(fTargetMode === 'roi' ? 'fixed' : 'roi')}
                className={`px-2 py-1 text-[11px] font-bold rounded-xs border ${fTargetMode === 'roi' ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40' : 'bg-[#0F1117] text-[#64748B] border-[#2D3139]'}`}
              >
                ROI {fTargetMode === 'roi' ? 'ON' : 'OFF'}
              </button>
            </label>
            {fTargetMode === 'roi' && (
              <>
                <label className="flex items-center gap-1 text-[#94A3B8]" title="Percentuale del capitale garantita su ogni esito">
                  ROI %
                  <input type="number" step="0.5" min="0.5" max="50" value={fRoiPct} onChange={(e) => setFRoiPct(e.target.value)} className="w-14 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-emerald-400 font-bold" />
                </label>
                <label className="flex items-center gap-1 text-[#94A3B8]" title="Tetto S0: oltre, la scala è scartata">
                  Cap €
                  <input type="number" step="1" min="1" value={fBaseCap} onChange={(e) => setFBaseCap(e.target.value)} className="w-14 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
                </label>
              </>
            )}
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Quota lay Under ultimo match: vuoto = auto pre-match (Under dell'ultimo match della scala), numero = prezzo a cui conti di bancare (es. in-play)">
              Lay @
              <input type="number" step="0.01" min="1.01" value={fLay} onChange={(e) => setFLay(e.target.value)} placeholder="auto" className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-violet-300" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Commissione exchange %">
              Comm %
              <input type="number" step="0.5" min="0" max="20" value={fComm} onChange={(e) => setFComm(e.target.value)} className="w-12 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-white" />
            </label>
            <label className="flex items-center gap-1 text-[#94A3B8]" title="Budget totale ipotetico € (vuoto = sizing dutch classico): OGNI copertura paga budget+target">
              Budget €
              <input type="number" step="10" min="0" value={fBudget} onChange={(e) => setFBudget(e.target.value)} placeholder="dutch" className="w-16 bg-[#0F1117] border border-[#2D3139] rounded-xs px-1.5 py-1 text-amber-300" />
            </label>
            <button
              onClick={() => void runFinder()}
              disabled={finderLoading || loading || rows.length === 0}
              className="px-3 py-1.5 text-xs font-mono font-bold rounded-xs border flex items-center gap-1.5 transition-colors bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 disabled:opacity-50"
              title="Cerca tra le partite del calendario le scale cronologiche che chiudono la regola mai-perdita al target"
            >
              <Sparkles className={`w-3.5 h-3.5 ${finderLoading ? 'animate-pulse' : ''}`} />
              <span>{finderLoading ? 'Cerco…' : 'Trova scale'}</span>
            </button>
          </div>
        </div>

        {finderResult && (
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono text-[#64748B]">
              Pool {finderResult.poolSize} partite · {finderResult.evaluations} scale valutate
              {finderResult.budgetHit ? ' (budget valutazioni esaurito)' : ''} · lay {finderLayUsed}
              {(finderResult.skippedDuplicates > 0 || finderResult.skippedGap > 0) && (
                <>
                  {' '}· scartate: {finderResult.skippedDuplicates} duplicate
                  {finderResult.skippedGap > 0 && `, ${finderResult.skippedGap} con gap <2h`}
                </>
              )}
            </div>
            {finderResult.feasible.length === 0 ? (
              <div className="space-y-2.5">
                <div className="bg-red-950/30 border border-red-500/40 p-3 rounded-xs font-mono text-xs text-red-200">
                  Nessuna scala da {fMinN}–{fMaxN} eventi chiude a lay {finderLayUsed}.
                  {finderResult.closestMaxLay !== null && (
                    <>
                      {' '}La più vicina servirebbe lay ≤{' '}
                      <strong className="text-white">@{finderResult.closestMaxLay.toFixed(2)}</strong>:
                      abbassa la quota lay (banca in-play quando l&apos;Under dell&apos;ultimo match
                      scende) o accorcia la scala.
                    </>
                  )}
                </div>
                {finderResult.fallback && (
                  <div className="space-y-2">
                    <div className="font-mono text-xs text-amber-200">
                      Sotto gli eventi richiesti invece CHIUDE — scala da{' '}
                      {finderResult.fallback.n} eventi:
                    </div>
                    {renderFinderCard(
                      finderResult.fallback,
                      0,
                      <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        fallback N={finderResult.fallback.n}
                      </span>,
                    )}
                    <button
                      onClick={() => {
                        const n = String(finderResult.fallback?.n ?? 4);
                        setFMinN(n);
                        setFMaxN(n);
                        void runFinder({ minN: n, maxN: n });
                      }}
                      className="px-3 py-1.5 text-xs font-mono rounded-xs border transition-colors bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border-amber-500/40"
                      title="Rilancia la ricerca fissata su questo numero di eventi"
                    >
                      Prova con N={finderResult.fallback.n} eventi
                    </button>
                  </div>
                )}
                {finderResult.closest && (
                  <div className="bg-[#141824] border border-[#2D3139] rounded-xs p-3">
                    <div className="font-mono text-xs font-bold text-white mb-2">
                      La più vicina{' '}
                      <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-red-500/20 text-red-300 border border-red-500/40">
                        NON CHIUDE
                      </span>{' '}
                      — sequenza e requisiti
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-[#94A3B8] mb-2">
                      {finderResult.closest.rows.map((r, i) => (
                        <div key={r.eventId} className="truncate">
                          <span className="text-[#64748B]">#{i + 1}</span> {r.home} - {r.away}{' '}
                          <span className="text-[#64748B]">({formatKickoff(r.kickoff)})</span>
                        </div>
                      ))}
                    </div>
                    <div className="font-mono text-[11px] text-[#E0E2E7] flex flex-wrap gap-x-4 gap-y-1 mb-2">
                      {finderResult.closest.finaleMode === 'lay' ? (
                        <span>
                          Servirebbe lay ≤{' '}
                          <strong className="text-white">
                            @{finderResult.closest.maxLayQuote.toFixed(2)}
                          </strong>{' '}
                          (ora @{finderResult.closest.layQuote.toFixed(2)})
                        </span>
                      ) : (
                        <span>
                          Σ(1/quota) {finderResult.closest.sumInverse.toFixed(3)} (serve &lt; 1)
                        </span>
                      )}
                      <span>
                        Gamba critica C{finderResult.closest.bindingStep}
                      </span>
                      <span>Esposizione scala standard €{finderResult.closest.exposure.toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {finderResult.closest.finaleMode === 'lay' &&
                        finderResult.closest.maxLayQuote > 0 && (
                          <button
                            onClick={() => {
                              const v = finderResult.closest!.maxLayQuote.toFixed(2);
                              setFLay(v);
                              void runFinder({ lay: v });
                            }}
                            className="px-3 py-1.5 text-xs font-mono rounded-xs border transition-colors bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 border-violet-500/40"
                            title="Rilancia la ricerca con la quota lay che farebbe chiudere questa scala"
                          >
                            Imposta lay @{finderResult.closest.maxLayQuote.toFixed(2)} e ricerca
                          </button>
                        )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              finderResult.feasible.map((c, idx) => renderFinderCard(c, idx, null))
            )}
          </div>
        )}
      </div>

      {/* Scout Radar: caccia autonoma scale da giocare (sola lettura) */}
      <div className="bg-[#0F1117] border border-sky-500/30 p-4 rounded-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Radar Scout
              <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-xs">
                solo verificate
              </span>
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5 max-w-3xl">
              Lo Scout spazza finestre cronologiche × S0 × ROI 4% × scenari lay (prematch e
              ipotesi in-play −10/−20/−30%) e promuove solo scale dove{' '}
              <strong className="text-white">OGNI esito</strong> verifica + regge gli shock
              (quote −5%, lay +0.10). Lista di lettura: per piazzare usa workbench + gate.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs shrink-0">
            <span className="text-[#64748B]" title="Base S0 e tetto usati nella caccia (dal campo Base € del finder)">
              S0/cap €{Math.max(1, parseFloat(fBase.replace(',', '.')) || 10)} · ROI 4%
            </span>
            <button
              onClick={() => void handleRunScout()}
              disabled={scoutLoading || loading || rows.length === 0}
              className="px-3 py-1.5 text-xs font-mono font-bold rounded-xs border flex items-center gap-1.5 transition-colors bg-sky-500/10 hover:bg-sky-500/25 text-sky-300 border-sky-500/40 disabled:opacity-50"
              title="Lancia la caccia su tutte le partite del calendario (può durare decine di secondi)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scoutLoading ? 'animate-spin' : ''}`} />
              <span>{scoutLoading ? 'Caccio…' : 'Lancia Scout'}</span>
            </button>
            {scoutLatest && scoutLatest.picks.length > 0 && (
              <button
                onClick={() => void clearScoutRuns()}
                disabled={scoutLoading}
                className="px-2 py-1.5 text-[11px] font-mono rounded-xs border bg-[#1A1D26] text-[#64748B] border-[#2D3139] hover:text-white disabled:opacity-50"
                title="Svuota la lista (locale + cloud)"
              >
                Svuota
              </button>
            )}
          </div>
        </div>

        {(scoutLoading && scoutProgress) || scoutMsg ? (
          <div className="font-mono text-xs text-sky-200">
            {scoutLoading && scoutProgress
              ? `Vaglio… ${scoutProgress.windows} finestre · ${scoutProgress.solves} verifiche · ${scoutProgress.picks} promosse`
              : null}
            {scoutMsg ? <div className={scoutLoading ? 'mt-1' : ''}>{scoutMsg}</div> : null}
          </div>
        ) : null}

        {scoutLatest && (
          <div className="space-y-2.5">
            <div className="text-[10px] font-mono text-[#64748B]">
              Run {new Date(scoutLatest.ranAt).toLocaleString('it-IT')} · pool{' '}
              {scoutLatest.poolSize} partite · {scoutLatest.evaluatedWindows} finestre ·{' '}
              {scoutLatest.exactSolves} verifiche · {(scoutLatest.msElapsed / 1000).toFixed(1)}s
              {scoutLatest.budgetHit ? ' (budget valutazioni esaurito)' : ''} · scarti:{' '}
              {Object.entries(scoutLatest.rejectedBy)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, v]) => `${k}×${v}`)
                .join(' · ') || '—'}
            </div>
            {scoutLatest.picks.length === 0 ? (
              <div className="font-mono text-xs text-amber-200 border border-amber-500/40 bg-amber-500/5 rounded-xs p-2.5">
                Niente da giocare in questa pool: ogni finestra è stata scartata con motivo
                (vedi conteggi sopra). Allarga N, abbassa le pretese di quota, o riprova col
                feed aggiornato.
              </div>
            ) : (
              scoutLatest.picks.map((p, idx) => renderScoutPick(p, idx))
            )}
          </div>
        )}
      </div>

      {/* Token LDL problematico: procedura di rinnovo (non e' un guasto di rete) */}
      {tokenIssue && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-4 rounded-xs text-amber-200 font-mono text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertCircle className="w-4 h-4" />
            Autenticazione LDL scaduta — la sincronizzazione quote non funziona finche' non rinnovi
            il refresh token
          </div>
          <p className="text-[#FDE68A]">{tokenIssue}</p>
          <div className="bg-[#0F1117] border border-amber-500/30 rounded-xs p-3 leading-relaxed">
            <div className="font-bold text-amber-300 mb-1.5 uppercase tracking-wider text-[10px]">
              Procedura di rinnovo (serve ogni ~30 giorni, dopo il login su liberidalavoro.it)
            </div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Browser loggato su liberidalavoro.it → F12 → Application → Local Storage → copia il
                valore della chiave{' '}
                <span className="text-white">
                  CognitoIdentityServiceProvider.…&lt;utente&gt;.refreshToken
                </span>
              </li>
              <li>
                Dashboard Supabase → Settings → API Keys →{' '}
                <span className="text-white">Edge Secrets</span> → aggiorna{' '}
                <span className="text-white">LDL_COGNITO_REFRESH_TOKEN</span>
              </li>
              <li>
                Ricarica questa pagina (verifica rapida: aggiungi ?resource=tokencheck all&apos;edge
                function)
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Mock data warning */}
      {source === 'mock' && !tokenIssue && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xs text-amber-300 font-mono text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>
            Dati mock (sempre su linea 3.5): feed LDL non raggiungibile (edge down o token
            LDL scaduto — vedi messaggio qui sotto). I rinnovi del token Cognito sono
            automatici se LDL_COGNITO_REFRESH_TOKEN e' impostato.
          </span>
          {ldlErrors.length > 0 && <span className="text-[#FDE68A]">· {ldlErrors[0]}</span>}
        </div>
      )}

      {/* Aggiornamento fallito/incompleto: i dati mostrati restano gli ultimi buoni */}
      {source === 'edge' && ldlErrors.length > 0 && (
        <div className="bg-sky-950/40 border border-sky-500/40 p-3 rounded-xs text-sky-300 font-mono text-xs">
          <span>
            ⚠ Ultimo aggiornamento: {ldlErrors.slice(0, 2).join(' · ')}
            {ldlErrors.length > 2 ? ` (+${ldlErrors.length - 2} altri)` : ''} — sotto ci sono gli
            ultimi dati reali riusciti.
          </span>
        </div>
      )}

      {/* Esito ricerca automatica partite */}
      {autoMsg && (
        <div
          className={`border p-3 rounded-xs font-mono text-xs flex items-center gap-2 ${
            autoMsg.startsWith('⚠')
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-blue-950/40 border-blue-500/40 text-blue-300'
          }`}
        >
          {autoMsg.startsWith('⚠') ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          )}
          <span>{autoMsg}</span>
        </div>
      )}

      {/* Notification toast if imported */}
      {importNotification && (
        <div className="bg-emerald-950/70 border border-emerald-500/50 p-3 rounded-xs text-emerald-300 font-mono text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* F17 — alert selezione partita troppo vicina (<2h all'avvio) */}
      {selectionAlert && (
        <div className="bg-amber-950/70 border border-amber-500/60 p-3 rounded-xs text-amber-200 font-mono text-xs flex items-start gap-2 animate-fade-in">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span className="flex-1">{selectionAlert}</span>
          <button
            onClick={() => setSelectionAlert(null)}
            className="px-1.5 text-amber-400 hover:text-white shrink-0"
            title="Chiudi"
          >
            ✕
          </button>
        </div>
      )}

      {/* Selection Control Bar & Filter Tabs */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* League & Status Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 mr-2 text-[#64748B]">
            <Filter className="w-3.5 h-3.5" />
            <span>Lega:</span>
          </div>
          <button
            onClick={() => setActiveLeagueFilter('all')}
            className={`px-2.5 py-1 rounded-xs transition-colors ${
              activeLeagueFilter === 'all'
                ? 'bg-[#3B82F6] text-white font-bold shadow-xs'
                : 'bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139] hover:text-white'
            }`}
          >
            Tutte ({rows.length})
          </button>
          {leagues.map(({ key }) => (
            <button
              key={key}
              onClick={() => setActiveLeagueFilter(key)}
              className={`px-2.5 py-1 rounded-xs transition-colors ${
                activeLeagueFilter === key
                  ? 'bg-[#3B82F6] text-white font-bold shadow-xs'
                  : 'bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139] hover:text-white'
              }`}
            >
              {key}
            </button>
          ))}

          {/* Status Tabs */}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-[#2D3139]">
            <button
              onClick={() => setActiveStatusFilter('all')}
              className={`px-2 py-1 rounded-xs ${
                activeStatusFilter === 'all'
                  ? 'bg-[#2A2F3D] text-white font-bold'
                  : 'text-[#64748B] hover:text-white'
              }`}
            >
              Tutti
            </button>
            <button
              onClick={() => setActiveStatusFilter('live')}
              className={`px-2 py-1 rounded-xs flex items-center gap-1 ${
                activeStatusFilter === 'live'
                  ? 'bg-red-950/60 text-red-300 border border-red-500/40 font-bold'
                  : 'text-red-400 hover:text-red-300'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              Live
            </button>
            <button
              onClick={() => setActiveStatusFilter('scheduled')}
              className={`px-2 py-1 rounded-xs ${
                activeStatusFilter === 'scheduled'
                  ? 'bg-[#2A2F3D] text-white font-bold'
                  : 'text-[#64748B] hover:text-white'
              }`}
            >
              Programmate
            </button>
            <button
              onClick={() => setActiveStatusFilter('finished')}
              className={`px-2 py-1 rounded-xs ${
                activeStatusFilter === 'finished'
                  ? 'bg-[#2A2F3D] text-white font-bold'
                  : 'text-[#64748B] hover:text-white'
              }`}
            >
              Finite
            </button>

            {/* F16b: partite già iniziate nascoste di default (non proposte) */}
            <button
              onClick={() => setHideStarted((v) => !v)}
              className={`px-2 py-1 rounded-xs flex items-center gap-1 ml-1 border transition-colors ${
                hideStarted
                  ? 'bg-[#2A2F3D] text-white font-bold border-[#3B82F6]/40'
                  : 'text-amber-300 border-amber-500/40 hover:text-amber-200'
              }`}
              title={
                hideStarted
                  ? 'Le partite già iniziate non vengono mostrate né proposte (regola multipla). Click per mostrarle.'
                  : 'Stai mostrando anche le partite già iniziate. Click per nasconderle.'
              }
            >
              <Clock className="w-3 h-3" />
              {hideStarted ? 'Solo future' : 'Anche già iniziate'}
            </button>
          </div>
        </div>

        {/* Bulk Selection Helpers */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
          <span className="text-[10px] text-[#64748B]">
            Usa <strong className="text-blue-300">Trova Partite</strong> in alto per la selezione
            automatica
          </span>
          <button onClick={deselectAll} className="px-2 py-1 text-[#64748B] hover:text-white">
            Deseleziona
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bar for Import */}
      {selectedEventIds.length > 0 && (
        <div className="sticky top-2 z-20 bg-[#141824] border-2 border-[#3B82F6] p-4 rounded-sm shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xs bg-[#3B82F6] flex items-center justify-center text-white font-bold font-mono text-sm shadow-sm shadow-[#3B82F6]/40">
              {selectedEventIds.length}
            </div>
            <div>
              <div className="text-white font-bold text-sm font-mono flex items-center gap-2">
                <span>{selectedEventIds.length} Partite Selezionate per la Multipla Madre</span>
                {selectedEventIds.length >= 8 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xs">
                    Bonus +26.2% Sbloccato!
                  </span>
                )}
                {selectedEventIds.length >= 5 && selectedEventIds.length < 8 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xs">
                    Bonus +{6 + (selectedEventIds.length - 5) * 6}% Attivo
                  </span>
                )}
                {firstHalfIds.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-violet-500/20 text-violet-300 border border-violet-500/40 rounded-xs">
                    {firstHalfIds.length} solo 1° tempo
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8]">
                Per ogni partita viene usata la quota migliore osservata tra i bookmaker coperti.
              </p>
            </div>
          </div>

          <button
            onClick={() => handleImportSelected()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
          >
            <span>Genera Schedine S0 &amp; Coperture</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Fixtures List */}
      <div className="bg-[#0F1117] border border-[#2D3139] rounded-sm overflow-hidden">
        <div className="p-4 border-b border-[#2D3139] flex items-center justify-between">
          <h3 className="text-xs uppercase font-mono text-white font-bold tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#3B82F6]" />
            Partite &amp; Copertura Bookmaker (Under {selectedLine} / Over {selectedLine})
          </h3>
          <div className="flex items-center gap-2 text-xs font-mono text-[#64748B]">
            <span>Mostrando {filteredRows.length} partite</span>
            {lastUpdatedAt && (
              <span className={ldlErrors.length > 0 && source === 'edge' ? 'text-amber-300' : ''}>
                · agg. {new Date(lastUpdatedAt).toLocaleTimeString('it-IT')}
                {ldlErrors.length > 0 && source === 'edge' && ' (ultimo riuscito)'}
              </span>
            )}
          </div>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-[#64748B]">
            {loading
              ? 'Caricamento partite in corso…'
              : 'Nessuna partita disponibile per questo filtro.'}
          </div>
        ) : (
          <div className="divide-y divide-[#20242C]">
            {filteredRows.map((row) => {
              const isSelected = selectedEventIds.includes(row.eventId);
              const under = bestCoverSide(row, 'under');
              const over = bestCoverSide(row, 'over');
              const canSelect = Boolean(under && over);

              return (
                <div
                  key={row.eventId}
                  className={`p-3 flex flex-col md:flex-row md:items-center gap-3 transition-colors ${
                    isSelected ? 'bg-[#141824]/80' : 'hover:bg-[#141824]/40'
                  }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => canSelect && toggleMatchSelection(row)}
                    disabled={!canSelect}
                    className="shrink-0 cursor-pointer text-[#3B82F6] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      !canSelect
                        ? 'Copertura incompleta: manca la quota su un lato'
                        : isSelected
                          ? 'Deseleziona'
                          : 'Seleziona per la multipla'
                    }
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-[#3B82F6]" />
                    ) : (
                      <Square className="w-4 h-4 text-[#64748B]" />
                    )}
                  </button>

                  {/* Match info */}
                  <div className="flex-1 min-w-[220px]">
                    <div className="flex items-center gap-1 text-[10px] text-[#64748B] mb-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{formatKickoff(row.kickoff)}</span>
                      {isKickoffTooSoon(row, Date.now(), MIN_HOURS_TO_KICKOFF) && (
                        <>
                          <span
                            className="ml-1 px-1.5 py-0.2 rounded-xs bg-amber-950/60 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1"
                            title={`Meno di ${MIN_HOURS_TO_KICKOFF} ore all'avvio: selezionandola avrai poco tempo per piazzare madre e copertura`}
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />&lt;{MIN_HOURS_TO_KICKOFF}h
                          </span>
                          {/* F17: scelta "solo primo tempo" se si decide di
                              inserire comunque la partita troppo vicina */}
                          <button
                            onClick={() => toggleFirstHalf(row)}
                            className={`px-1.5 py-0.2 rounded-xs font-bold border transition-colors ${
                              firstHalfIds.includes(row.eventId)
                                ? 'bg-violet-500/20 text-violet-300 border-violet-500/50'
                                : 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139] hover:text-white'
                            }`}
                            title={
                              firstHalfIds.includes(row.eventId)
                                ? `Questa partita entra SOLO sul mercato del primo tempo (Under/Over ${row.line} 1T). Click per tornare al mercato integrale.`
                                : `Meno di ${MIN_HOURS_TO_KICKOFF} ore: se vuoi inserirla comunque, portala SOLO sul primo tempo (le quote 1T le aggiusti poi nel workbench).`
                            }
                          >
                            {firstHalfIds.includes(row.eventId) ? 'Solo 1° tempo ✓' : 'Solo 1° tempo'}
                          </button>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        {row.league}
                        {row.country ? <span className="text-[#64748B]"> ({row.country})</span> : null}
                      </span>
                      {row.rating != null && (
                        <span
                          className="ml-1 text-emerald-400 font-mono"
                          title="Rating copertura OddsScasser"
                        >
                          ★ {row.rating.toFixed(3)}
                        </span>
                      )}
                    </div>
                    <div className="text-white font-bold text-sm">
                      {row.home} <span className="text-[#64748B]">vs</span> {row.away}
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <StatusBadge status={row.status} />
                      {row.totalGoals !== null && (
                        <span className="text-white font-bold px-1.5 py-0.2 bg-[#1A1D26] border border-[#2D3139] rounded-xs text-[11px]">
                          {row.homeScore} - {row.awayScore}
                        </span>
                      )}
                      <LineStatusBadge lineStatus={row.lineStatus} line={row.line} />
                    </div>
                  </div>

                  {/* Books coverage */}
                  <div className="flex-1 min-w-[240px]">
                    {row.books.length === 0 ? (
                      <div className="text-[11px] font-mono text-[#64748B]">
                        Nessuna copertura disponibile
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {row.books.map((b) => {
                          const aggio =
                            b.under !== null && b.over !== null
                              ? calculateBookmakerAggio(b.under, b.over)
                              : null;
                          const isBestUnder = under?.book === b.book;
                          const isBestOver = over?.book === b.book;
                          return (
                            <div
                              key={b.book}
                              className={`px-2 py-1 rounded-xs border text-[10px] font-mono ${
                                isBestUnder || isBestOver
                                  ? 'border-[#3B82F6] bg-[#141824]'
                                  : 'border-[#2D3139] bg-[#0F1117]'
                              }`}
                            >
                              <div className="text-white font-bold">{b.book}</div>
                              <div className="flex gap-2">
                                {b.under !== null && (
                                  <span
                                    className={
                                      isBestUnder ? 'text-emerald-400 font-bold' : 'text-[#94A3B8]'
                                    }
                                  >
                                    U {b.under.toFixed(2)}
                                  </span>
                                )}
                                {b.over !== null && (
                                  <span
                                    className={
                                      isBestOver ? 'text-amber-400 font-bold' : 'text-[#94A3B8]'
                                    }
                                  >
                                    O {b.over.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              {aggio && (
                                <div className="text-[9px] text-[#64748B]">
                                  Aggio {aggio.aggioPercent.toFixed(2)}%
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Educational Box */}
      <div className="bg-[#141824] border border-[#2D3139] p-5 rounded-sm">
        <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2 mb-2">
          <Scale className="w-4 h-4 text-amber-400" />
          Perché la Copertura Reale per Bookmaker Fa la Differenza
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#94A3B8] leading-relaxed">
          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              1. Quota Migliore per Lato
            </div>
            <p>
              Ogni riga mostra solo i bookmaker che coprono davvero questa partita alla linea{' '}
              {rows[0]?.line ?? 3.5}. Under e Over evidenziati sono la quota più alta osservata, non
              una media inventata.
            </p>
          </div>

          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-blue-400" />
              2. Aggio per Bookmaker
            </div>
            <p>
              L&apos;aggio mostrato per ogni libro deriva dalle quote under/over effettive di quel
              bookmaker: più basso è l&apos;aggio, meno capitale serve per coprire un eventuale
              errore.
            </p>
          </div>

          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              3. Aggiornamento ogni 60s
            </div>
            <p>
              Con Auto-Refresh attivo la lista viene ricaricata dal feed OddsScasser ogni minuto,
              cosí punteggi e quote restano allineati alla realtà delle partite in corso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
