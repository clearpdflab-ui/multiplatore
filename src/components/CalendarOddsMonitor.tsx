import React, { useState, useMemo, useEffect } from 'react';
import { UserMatch } from '../types';
import { bestCoverSide, type CoverOddsRow, type LdlMatchStatus, type LineStatus } from '../engine/coverOddsFeed';
import { fetchCoverOdds } from '../services/ldlOddsApi';
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
} from 'lucide-react';

interface CalendarOddsMonitorProps {
  onImportToTracker: (matches: UserMatch[]) => void;
  onNavigateToTracker: () => void;
}

const REFRESH_INTERVAL_MS = 60000;

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

  async function loadRows() {
    setLoading(true);
    try {
      const r = await fetchCoverOdds();
      setRows(r.matches);
      setSource(r.source);
      setLdlErrors(r.source === 'edge' ? r.errors : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadRows();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const leagues = useMemo(() => Array.from(new Set(rows.map((r) => r.league))).sort(), [rows]);

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

  const selectFirst8Matches = () => {
    const ids = filteredRows
      .filter((r) => bestCoverSide(r, 'under') && bestCoverSide(r, 'over'))
      .slice(0, 8)
      .map((r) => r.eventId);
    setSelectedEventIds(ids);
  };

  const deselectAll = () => setSelectedEventIds([]);

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
              Partite ed quote under/over 3.5 recuperate in tempo reale dal feed OddsScasser, con
              copertura dinamica per bookmaker (nessuna quota inventata). Seleziona le partite per
              generare la <strong className="text-emerald-400">Schedina Madre</strong>.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
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

      {/* Mock data warning */}
      {source === 'mock' && (
        <div className="bg-amber-950/40 border border-amber-500/40 p-3 rounded-xs text-amber-300 font-mono text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <span>Dati mock: Edge Function non raggiungibile o LDL_BEARER_TOKEN non impostato/scaduto.</span>
        </div>
      )}

      {/* Partial-data notice (quote caricate solo per alcuni eventi) */}
      {source === 'edge' && ldlErrors.length > 0 && (
        <div className="bg-sky-950/40 border border-sky-500/40 p-3 rounded-xs text-sky-300 font-mono text-xs">
          <span>{ldlErrors.slice(0, 2).join(' · ')}{ldlErrors.length > 2 ? ` (+${ldlErrors.length - 2} altri)` : ''}</span>
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
          <button
            onClick={selectFirst8Matches}
            className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xs flex items-center gap-1.5 transition-colors font-bold"
            title="Seleziona le prime 8 partite con copertura completa per la Schedina Madre"
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
            <span>Seleziona 8 con Copertura</span>
          </button>

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
