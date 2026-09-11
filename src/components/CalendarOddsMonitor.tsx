import React, { useState, useMemo, useEffect } from 'react';
import { UserMatch } from '../types';
import { bestCoverSide, type CoverOddsRow, type LdlMatchStatus, type LineStatus } from '../engine/coverOddsFeed';
import { fetchCoverFeed, fetchCoverSuggestions, fetchLdlBookmakers } from '../services/ldlOddsApi';
import { findRegistryBook } from '../engine/oddsFeed';
import { useBooks } from '../hooks/useBooks';
import { calculateBookmakerAggio } from '../utils/mathEngine';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Filter,
  Layers,
  Scale,
  Award,
  CheckSquare,
  Square,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface CalendarOddsMonitorProps {
  onImportToTracker: (matches: UserMatch[]) => void;
  onNavigateToTracker: () => void;
}

const REFRESH_INTERVAL_MS = 60000;
const CALENDAR_WINDOW_DAYS = 7;
const MAX_AUTO_PAGES = 3;
const STORE_MADRE = 'multiscale_cal_madre_sites_v1';
const STORE_COPERTURA = 'multiscale_cal_copertura_sites_v1';

function loadStoredSites(key: string): number[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
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
  label, options, selected, onChange, registeredIds, daysLimits,
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
        <span className="font-bold">{selected.length > 0 ? `${selected.length} book` : 'nessuno'}</span>
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
                      <span className="text-[9px] px-1 rounded-xs bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 font-mono">reg</span>
                    )}
                    {limit != null && (
                      <span className="text-[9px] text-amber-300 font-mono" title={`Multipla: gambe entro ${limit} giorni`}>≤{limit}gg</span>
                    )}
                  </label>
                );
              })}
              {visible.length === 0 && (
                <div className="p-3 text-[11px] font-mono text-[#64748B]">Nessun bookmaker.</div>
              )}
            </div>
            <div className="p-2 border-t border-[#2D3139] flex items-center justify-between">
              <button onClick={() => onChange([])} className="text-[10px] font-mono text-[#64748B] hover:text-white uppercase">
                Azzera
              </button>
              <button onClick={() => setOpen(false)} className="text-[10px] font-mono text-[#3B82F6] hover:text-white uppercase font-bold">
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
    return new Intl.DateTimeFormat('it-IT', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
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
        <span className="px-1.5 py-0.5 rounded-xs bg-zinc-800 text-[#94A3B8] text-[10px]">FINALE</span>
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
      return <span className="px-1.5 py-0.5 rounded-xs bg-zinc-800 text-[#64748B] text-[10px]">ALTRO</span>;
  }
}

function LineStatusBadge({ lineStatus, line }: { lineStatus: LineStatus | null; line: number }) {
  if (!lineStatus) return null;
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
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'scheduled' | 'live' | 'finished'>('all');
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [ldlErrors, setLdlErrors] = useState<string[]>([]);
  // Coppia book per la ricerca /puntapunta: madre=book con Under 3.5 (sites1),
  // copertura=book con Over 3.5 (sites2PuntaPunta). Multi-selezione libera:
  // default = book registrati nel gestionale (match per nome), altrimenti
  // Lottomatica[16] -> Sisal[23] (ricerca standard OddsScasser).
  const [bookmakers, setBookmakers] = useState<LdlBookmaker[]>([]);
  const { books: registryBooks } = useBooks();
  const [madreSites, setMadreSites] = useState<number[]>(() => loadStoredSites(STORE_MADRE) ?? []);
  const [coperturaSites, setCoperturaSites] = useState<number[]>(() => loadStoredSites(STORE_COPERTURA) ?? []);
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
    if (!active.length) return set;
    for (const b of bookmakers) if (findRegistryBook(active, b.name)) set.add(b.id);
    return set;
  }, [bookmakers, registryBooks]);

  const daysLimitsByLdlId = useMemo(() => {
    const active = registryBooks.filter((b) => b.isActive);
    const map = new Map<number, number>();
    if (!active.length) return map;
    for (const b of bookmakers) {
      const limit = findRegistryBook(active, b.name)?.multiDaysLimit ?? null;
      if (limit != null && limit >= 1) map.set(b.id, limit);
    }
    return map;
  }, [bookmakers, registryBooks]);

  // Default di selezione: book registrati (pre-spuntati), fallback 16/23.
  useEffect(() => {
    if (!bookmakers.length) return;
    const registered = [...registeredLdlIds];
    setMadreSites((prev) => (prev.length ? prev : registered.length ? registered : [16]));
    setCoperturaSites((prev) => (prev.length ? prev : registered.length ? registered : [23]));
  }, [bookmakers, registeredLdlIds]);

  useEffect(() => {
    if (madreSites.length) localStorage.setItem(STORE_MADRE, JSON.stringify(madreSites));
  }, [madreSites]);
  useEffect(() => {
    if (coperturaSites.length) localStorage.setItem(STORE_COPERTURA, JSON.stringify(coperturaSites));
  }, [coperturaSites]);

  const madreKey = madreSites.join(',');
  const coperturaKey = coperturaSites.join(',');

  async function loadRows() {
    if (!madreSites.length || !coperturaSites.length) return;
    setLoading(true);
    try {
      const r = await fetchCoverFeed({
        sites1: madreSites,
        sites2PuntaPunta: coperturaSites,
        dateTo: new Date(Date.now() + CALENDAR_WINDOW_DAYS * 24 * 3600_000).toISOString(),
      });
      setRows(r.matches);
      setSource(r.source);
      setLdlErrors(r.errors);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    fetchLdlBookmakers()
      .then((list) => setBookmakers(list.length ? list : [{ id: 16, name: 'Lottomatica' }, { id: 23, name: 'Sisal' }]))
      .catch(() => setBookmakers([{ id: 16, name: 'Lottomatica' }, { id: 23, name: 'Sisal' }]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [madreKey, coperturaKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadRows();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
    // loadRows richiama madreSites/coperturaSites: senza deps aggiornate il
    // timer manterrebbe la vecchia coppia di book.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, madreKey, coperturaKey]);

  const leagues = useMemo(() => Array.from(new Set(rows.map((r) => r.league))).sort(), [rows]);

  // Errori auth LDL: la edge function marca i problemi token con prefisso "TOKEN:".
  const tokenIssue = useMemo(() => ldlErrors.find((e) => e.includes('TOKEN:')) ?? null, [ldlErrors]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (activeLeagueFilter !== 'all' && r.league !== activeLeagueFilter) return false;
      if (activeStatusFilter !== 'all' && r.status !== activeStatusFilter) return false;
      return true;
    });
  }, [rows, activeLeagueFilter, activeStatusFilter]);

  const toggleMatchSelection = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId) ? prev.filter((id) => id !== eventId) : [...prev, eventId]
    );
  };

  const deselectAll = () => setSelectedEventIds([]);

  // Finestra effettiva: min(7gg, limite giorni multipla piu' restrittivo tra
  // i book madre selezionati (dal gestionale).
  const motherWindowDays = useMemo(() => {
    let days = CALENDAR_WINDOW_DAYS;
    for (const idStr of madreKey.split(',').filter(Boolean)) {
      const limit = daysLimitsByLdlId.get(Number(idStr));
      if (limit != null) days = Math.min(days, limit);
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
        });
        let fresh = 0;
        for (const m of r.matches) {
          if (!seen.has(m.eventId)) { seen.set(m.eventId, m); fresh++; }
        }
        const candidates = [...seen.values()].filter((row) => {
          if (row.status !== 'scheduled') return false;
          const under = bestCoverSide(row, 'under');
          const over = bestCoverSide(row, 'over');
          return Boolean(under && over && under.odds >= parsedOddsMin);
        });
        // Risposta breve o nessuna riga nuova = altre pagine inutili.
        if (r.matches.length < 100 || fresh === 0 || candidates.length >= parsedTarget) break;
      }
      // seen e' gia' ordinato per rating (sort server-side del feed).
      const candidates = [...seen.values()]
        .filter((row) => {
          if (row.status !== 'scheduled') return false;
          const under = bestCoverSide(row, 'under');
          const over = bestCoverSide(row, 'over');
          return Boolean(under && over && under.odds >= parsedOddsMin);
        })
        .slice(0, parsedTarget);
      setSelectedEventIds(candidates.map((r) => r.eventId));

      let msg = `Selezionate ${candidates.length}/${parsedTarget} partite (Under ≥ ${parsedOddsMin.toFixed(2)}, finestra ${motherWindowDays}gg, ordine rating)`;
      if (candidates.length < parsedTarget) {
        msg += ' · nel calendario non ci sono altre partite idonee con questi filtri';
      }
      const times = candidates
        .map((r) => new Date(r.kickoff).getTime())
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

  const handleImportSelected = () => {
    const matchesToImport = rows.filter((r) => selectedEventIds.includes(r.eventId));
    const sorted = [...matchesToImport].sort(
      (a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()
    );

    const userMatches: UserMatch[] = [];
    sorted.forEach((row, idx) => {
      const under = bestCoverSide(row, 'under');
      const over = bestCoverSide(row, 'over');
      if (!under || !over) return;

      let outcome: 'PENDING' | 'UNDER' | 'OVER' = 'PENDING';
      if (row.lineStatus === 'over') outcome = 'OVER';
      else if (row.status === 'finished' && row.lineStatus === 'safe') outcome = 'UNDER';

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
        note: `${row.league} (U:${under.book} / O:${over.book})`,
      });
    });

    if (userMatches.length === 0) return;

    onImportToTracker(userMatches);
    setImportNotification(
      `✅ ${userMatches.length} partite importate con quote reali liberidalavoro.it! Reindirizzamento in corso...`
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
              Partite ed quote under/over 3.5 recuperate in tempo reale dal feed OddsScasser su
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
              <span>{autoLoading ? 'Ricerca…' : `Trova ${parsedTarget} Partite (${motherWindowDays}gg)`}</span>
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

      {/* Token LDL problematico: procedura di rinnovo (non e' un guasto di rete) */}
      {tokenIssue && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-4 rounded-xs text-amber-200 font-mono text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertCircle className="w-4 h-4" />
            Autenticazione LDL scaduta — la sincronizzazione quote non funziona finche' non rinnovi il refresh token
          </div>
          <p className="text-[#FDE68A]">{tokenIssue}</p>
          <div className="bg-[#0F1117] border border-amber-500/30 rounded-xs p-3 leading-relaxed">
            <div className="font-bold text-amber-300 mb-1.5 uppercase tracking-wider text-[10px]">
              Procedura di rinnovo (serve ogni ~30 giorni, dopo il login su liberidalavoro.it)
            </div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                Browser loggato su liberidalavoro.it → F12 → Application → Local Storage → copia il valore della chiave{' '}
                <span className="text-white">CognitoIdentityServiceProvider.…&lt;utente&gt;.refreshToken</span>
              </li>
              <li>
                Dashboard Supabase → Settings → API Keys → <span className="text-white">Edge Secrets</span> → aggiorna{' '}
                <span className="text-white">LDL_COGNITO_REFRESH_TOKEN</span>
              </li>
              <li>Ricarica questa pagina (verifica rapida: aggiungi ?resource=tokencheck all&apos;edge function)</li>
            </ol>
          </div>
        </div>
      )}

      {/* Mock data warning */}
      {source === 'mock' && !tokenIssue && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xs text-amber-300 font-mono text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>
            Dati mock: feed LDL non raggiungibile (edge down o token LDL scaduto —
            vedi messaggio qui sotto). I rinnovi del token Cognito sono automatici
            se LDL_COGNITO_REFRESH_TOKEN e' impostato.
          </span>
          {ldlErrors.length > 0 && <span className="text-[#FDE68A]">· {ldlErrors[0]}</span>}
        </div>
      )}

      {/* Partial-data notice (quote caricate solo per alcuni eventi) */}
      {source === 'edge' && ldlErrors.length > 0 && (
        <div className="bg-sky-950/40 border border-sky-500/40 p-3 rounded-xs text-sky-300 font-mono text-xs">
          <span>{ldlErrors.slice(0, 2).join(' · ')}{ldlErrors.length > 2 ? ` (+${ldlErrors.length - 2} altri)` : ''}</span>
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
          {leagues.map((league) => (
            <button
              key={league}
              onClick={() => setActiveLeagueFilter(league)}
              className={`px-2.5 py-1 rounded-xs transition-colors ${
                activeLeagueFilter === league
                  ? 'bg-[#3B82F6] text-white font-bold shadow-xs'
                  : 'bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139] hover:text-white'
              }`}
            >
              {league}
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
          </div>
        </div>

        {/* Bulk Selection Helpers */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
          <span className="text-[10px] text-[#64748B]">
            Usa <strong className="text-blue-300">Trova Partite</strong> in alto per la selezione automatica
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
              </div>
              <p className="text-xs text-[#94A3B8]">
                Per ogni partita viene usata la quota migliore osservata tra i bookmaker coperti.
              </p>
            </div>
          </div>

          <button
            onClick={handleImportSelected}
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
            Partite &amp; Copertura Bookmaker (Under 3.5 / Over 3.5)
          </h3>
          <span className="text-xs font-mono text-[#64748B]">
            Mostrando {filteredRows.length} partite
          </span>
        </div>

        {filteredRows.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-[#64748B]">
            {loading ? 'Caricamento partite in corso…' : 'Nessuna partita disponibile per questo filtro.'}
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
                    onClick={() => canSelect && toggleMatchSelection(row.eventId)}
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
                      <span>•</span>
                      <span>{row.league}</span>
                      {row.rating != null && (
                        <span className="ml-1 text-emerald-400 font-mono" title="Rating copertura OddsScasser">
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
                                    className={isBestUnder ? 'text-emerald-400 font-bold' : 'text-[#94A3B8]'}
                                  >
                                    U {b.under.toFixed(2)}
                                  </span>
                                )}
                                {b.over !== null && (
                                  <span
                                    className={isBestOver ? 'text-amber-400 font-bold' : 'text-[#94A3B8]'}
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
              bookmaker: più basso è l&apos;aggio, meno capitale serve per coprire un eventuale errore.
            </p>
          </div>

          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              3. Aggiornamento ogni 60s
            </div>
            <p>
              Con Auto-Refresh attivo la lista viene ricaricata dal feed OddsScasser ogni minuto, cosí
              punteggi e quote restano allineati alla realtà delle partite in corso.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
