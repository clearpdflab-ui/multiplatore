import React, { useState, useMemo, useEffect } from 'react';
import { FixtureMatch, BookmakerId, UserMatch } from '../types';
import {
  BOOKMAKERS_LIST,
  loadStoredFixtures,
  saveStoredFixtures,
  convertFixturesToUserMatches,
  buildBookmakerQuotes,
  generateRealOfficialFixtures,
} from '../services/fixturesService';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Scale,
  RefreshCw,
  Plus,
  ArrowRight,
  Filter,
  Layers,
  Sparkles,
  Award,
  Sliders,
  CheckSquare,
  Square,
  Flame,
  Edit2,
  X,
  Save,
  RotateCcw,
} from 'lucide-react';

interface CalendarOddsMonitorProps {
  onImportToTracker: (matches: UserMatch[]) => void;
  onNavigateToTracker: () => void;
}

export const CalendarOddsMonitor: React.FC<CalendarOddsMonitorProps> = ({
  onImportToTracker,
  onNavigateToTracker,
}) => {
  const [fixtures, setFixtures] = useState<FixtureMatch[]>(() => loadStoredFixtures());
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([
    'fix_sa3_4',
    'fix_sa3_5',
    'fix_sa3_6',
    'fix_sa3_7',
    'fix_sa3_8',
    'fix_sa3_9',
    'fix_sa4_1',
    'fix_sa4_3',
  ]);
  const [activeLeagueFilter, setActiveLeagueFilter] = useState<string>('all');
  const [activeStatusFilter, setActiveStatusFilter] = useState<'all' | 'live' | 'scheduled' | 'finished'>('all');
  const [selectedBookmakerForImport, setSelectedBookmakerForImport] = useState<BookmakerId>('snai');
  const [importNotification, setImportNotification] = useState<string | null>(null);
  const [isAutoLiveActive, setIsAutoLiveActive] = useState<boolean>(true);
  const [editingMatch, setEditingMatch] = useState<FixtureMatch | null>(null);

  const handleResetToRealDates = () => {
    const fresh = generateRealOfficialFixtures();
    setFixtures(fresh);
    saveStoredFixtures(fresh);
    setSelectedMatchIds([
      'fix_sa3_4',
      'fix_sa3_5',
      'fix_sa3_6',
      'fix_sa3_7',
      'fix_sa3_8',
      'fix_sa3_9',
      'fix_sa4_1',
      'fix_sa4_3',
    ]);
    setImportNotification('📅 Tutte le 26 partite reali (Serie A 3ª/4ª Giornata & Champions League Settembre 2026) ripristinate con successo!');
    setTimeout(() => setImportNotification(null), 3500);
  };

  const handleSelectRound3 = () => {
    setActiveLeagueFilter('serie_a_3');
    const scheduled3 = fixtures.filter((f) => f.round === '3ª Giornata' && f.status === 'SCHEDULED').map((f) => f.id);
    const round4 = fixtures.filter((f) => f.round === '4ª Giornata').map((f) => f.id);
    const combined = [...scheduled3, ...round4].slice(0, 8);
    setSelectedMatchIds(combined);
    setImportNotification('🇮🇹 Selezionate 8 partite a partire da Oggi (Dom 06/09/2026) per la Schedina Madre!');
    setTimeout(() => setImportNotification(null), 3000);
  };

  const handleSelectRound4 = () => {
    setActiveLeagueFilter('serie_a_4');
    const ids = fixtures.filter((f) => f.round === '4ª Giornata').slice(0, 8).map((f) => f.id);
    setSelectedMatchIds(ids);
    setImportNotification('🇮🇹 Selezionate le 8 partite reali di Serie A (4ª Giornata - 11-14 Settembre 2026)!');
    setTimeout(() => setImportNotification(null), 3000);
  };

  const handleSelectUCL = () => {
    setActiveLeagueFilter('champions_league');
    const ids = fixtures.filter((f) => f.leagueId === 'champions_league').slice(0, 8).map((f) => f.id);
    setSelectedMatchIds(ids);
    setImportNotification('⭐ Selezionate le 8 partite reali di UEFA Champions League (1ª Giornata 15-17 Settembre 2026)!');
    setTimeout(() => setImportNotification(null), 3000);
  };

  const handleSaveEditedMatch = (updated: FixtureMatch) => {
    const recalculatedQuotes = buildBookmakerQuotes(updated.defaultUnder35, updated.defaultOver35);
    const completeUpdated: FixtureMatch = {
      ...updated,
      quotes: recalculatedQuotes,
    };

    setFixtures((prev) => prev.map((f) => (f.id === completeUpdated.id ? completeUpdated : f)));
    setEditingMatch(null);
    setImportNotification(`✅ Partita ${completeUpdated.homeTeam} - ${completeUpdated.awayTeam} salvata con successo!`);
    setTimeout(() => setImportNotification(null), 3000);
  };

  const handleAddCustomMatch = () => {
    const newFix: FixtureMatch = {
      id: `fix_custom_${Date.now()}`,
      leagueId: 'serie_a',
      leagueName: 'Serie A Enilive',
      round: 'Partita Aggiunta',
      homeTeam: 'Nuova Squadra Casa',
      awayTeam: 'Nuova Squadra Ospite',
      startTime: '2025-03-09T15:00:00',
      formattedDate: 'Dom 09 Mar',
      formattedTime: '15:00',
      status: 'SCHEDULED',
      quotes: buildBookmakerQuotes(1.30, 3.15),
      defaultUnder35: 1.30,
      defaultOver35: 3.15,
      suggestedBookmaker: 'bet365',
    };
    setFixtures((prev) => [newFix, ...prev]);
    setSelectedMatchIds((prev) => [newFix.id, ...prev]);
    setEditingMatch(newFix);
  };

  // Salva le fixtures modificate
  useEffect(() => {
    saveStoredFixtures(fixtures);
  }, [fixtures]);

  // Simulazione tick live real-time
  useEffect(() => {
    if (!isAutoLiveActive) return;
    const interval = setInterval(() => {
      setFixtures((prev) =>
        prev.map((fix) => {
          if (fix.status !== 'LIVE') return fix;
          const nextMinute = (fix.liveMinute || 1) + 1;
          if (nextMinute > 90) {
            return {
              ...fix,
              status: 'FINISHED',
              liveMinute: 90,
            };
          }
          return {
            ...fix,
            liveMinute: nextMinute,
          };
        })
      );
    }, 12000); // Avanza ogni 12s

    return () => clearInterval(interval);
  }, [isAutoLiveActive]);

  // Filtro partite
  const filteredFixtures = useMemo(() => {
    return fixtures.filter((f) => {
      if (activeLeagueFilter === 'serie_a_3' || activeLeagueFilter === 'serie_a_28') {
        if (f.round !== '3ª Giornata' && f.round !== '28ª Giornata') return false;
      } else if (activeLeagueFilter === 'serie_a_4' || activeLeagueFilter === 'serie_a_29') {
        if (f.round !== '4ª Giornata' && f.round !== '29ª Giornata') return false;
      } else if (activeLeagueFilter === 'champions_league') {
        if (f.leagueId !== 'champions_league') return false;
      } else if (activeLeagueFilter === 'all_serie_a') {
        if (f.leagueId !== 'serie_a') return false;
      }

      if (activeStatusFilter === 'live' && f.status !== 'LIVE') return false;
      if (activeStatusFilter === 'scheduled' && f.status !== 'SCHEDULED') return false;
      if (activeStatusFilter === 'finished' && f.status !== 'FINISHED') return false;
      return true;
    });
  }, [fixtures, activeLeagueFilter, activeStatusFilter]);

  // Seleziona/deseleziona singola partita
  const toggleMatchSelection = (id: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Seleziona le prime 8 partite (ideali per la Schedina Madre)
  const selectFirst8Matches = () => {
    const ids = filteredFixtures.slice(0, 8).map((f) => f.id);
    setSelectedMatchIds(ids);
  };

  // Deseleziona tutto
  const deselectAll = () => {
    setSelectedMatchIds([]);
  };

  // Simulazione eventi live: Aggiungi Gol Casa / Ospite
  const handleScoreGoal = (fixId: string, team: 'home' | 'away') => {
    setFixtures((prev) =>
      prev.map((f) => {
        if (f.id !== fixId) return f;
        const newHome = team === 'home' ? (f.homeScore || 0) + 1 : f.homeScore || 0;
        const newAway = team === 'away' ? (f.awayScore || 0) + 1 : f.awayScore || 0;
        const total = newHome + newAway;
        let underOverStatus: 'SAFE' | 'WARNING_3_GOALS' | 'OVER_BUSTED' = 'SAFE';
        if (total >= 4) underOverStatus = 'OVER_BUSTED';
        else if (total === 3) underOverStatus = 'WARNING_3_GOALS';

        return {
          ...f,
          status: 'LIVE',
          homeScore: newHome,
          awayScore: newAway,
          totalGoals: total,
          under35Status: underOverStatus,
          liveMinute: f.liveMinute || 1,
        };
      })
    );
  };

  // Termina partita simulata
  const handleFinishMatch = (fixId: string) => {
    setFixtures((prev) =>
      prev.map((f) => {
        if (f.id !== fixId) return f;
        return {
          ...f,
          status: 'FINISHED',
          liveMinute: 90,
        };
      })
    );
  };

  // Reset al calendario predefinito
  const handleResetToDefault = () => {
    localStorage.removeItem('multiscale_fixtures_7days_v1');
    window.location.reload();
  };

  // Importa nella Schedina Madre
  const handleImportSelected = () => {
    const matchesToImport = fixtures.filter((f) => selectedMatchIds.includes(f.id));
    if (matchesToImport.length === 0) return;

    const userMatches = convertFixturesToUserMatches(matchesToImport, selectedBookmakerForImport);
    onImportToTracker(userMatches);
    setImportNotification(
      `✅ ${userMatches.length} partite importate con quote ${selectedBookmakerForImport.toUpperCase()}! Reindirizzamento in corso...`
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
                Prossimi 7 Giorni • Cadenza 2 Ore
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight flex items-center gap-2">
              Calendario Partite &amp; Monitoraggio Bookmaker Live
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 max-w-3xl leading-relaxed">
              Esplora i match in programma nei prossimi 7 giorni, compara in tempo reale l&apos;aggio applicato dai principali bookmaker (<strong className="text-white">SNAI 1.32-3.00, Bet365 1.30-3.15, Eurobet, GoldBet, Sisal</strong>) e seleziona le partite per generare all&apos;istante la <strong className="text-emerald-400">Schedina Madre</strong> e l&apos;albero di coperture.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setIsAutoLiveActive(!isAutoLiveActive)}
              className={`px-3 py-1.5 text-xs font-mono rounded-xs border transition-colors flex items-center gap-1.5 ${
                isAutoLiveActive
                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                  : 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139]'
              }`}
              title="Aggiornamento automatico dei minuti e quote in tempo reale"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAutoLiveActive ? 'animate-spin' : ''}`} />
              <span>{isAutoLiveActive ? 'Auto-Live Attivo' : 'Auto-Live Pausa'}</span>
            </button>

            <button
              onClick={handleResetToDefault}
              className="px-2.5 py-1.5 text-xs font-mono text-[#94A3B8] hover:text-white bg-[#1A1D26] border border-[#2D3139] rounded-xs"
              title="Ripristina calendario originale Serie A, Premier e La Liga"
            >
              Ripristina Default
            </button>
          </div>
        </div>
      </div>

      {/* Bookmaker Radar: Comparison Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {BOOKMAKERS_LIST.map((b) => {
          const isSelected = selectedBookmakerForImport === b.id;
          return (
            <div
              key={b.id}
              onClick={() => setSelectedBookmakerForImport(b.id)}
              className={`p-3 rounded-xs border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-[#141824] border-[#3B82F6] ring-1 ring-[#3B82F6]/50 shadow-xs'
                  : 'bg-[#0F1117] border-[#2D3139] hover:bg-[#151821]'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="font-bold text-xs text-white flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: b.badgeColor }}
                  />
                  {b.name}
                </span>
                {b.id === 'snai' && (
                  <span className="text-[9px] font-mono px-1 py-0.2 bg-orange-950/60 text-orange-300 rounded-xs">
                    Mod. 1
                  </span>
                )}
                {b.id === 'bet365' && (
                  <span className="text-[9px] font-mono px-1 py-0.2 bg-emerald-950/60 text-emerald-300 rounded-xs">
                    Mod. 2
                  </span>
                )}
                {b.id === 'sisal' && (
                  <span className="text-[9px] font-mono px-1 py-0.2 bg-blue-950/60 text-blue-300 rounded-xs">
                    Min Aggio
                  </span>
                )}
              </div>

              <div className="text-[11px] font-mono text-[#94A3B8] space-y-0.5">
                <div className="flex justify-between">
                  <span>Aggio Medio:</span>
                  <span className="font-bold text-white">{b.defaultAggio}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Payout Stimato:</span>
                  <span className="text-emerald-400">{(100 - b.defaultAggio).toFixed(2)}%</span>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-[#2D3139] flex items-center justify-between text-[10px] font-mono">
                <span className={isSelected ? 'text-[#3B82F6] font-bold' : 'text-[#64748B]'}>
                  {isSelected ? '✓ Selezionato per Import' : 'Clicca per usare'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Notification toast if imported */}
      {importNotification && (
        <div className="bg-emerald-950/70 border border-emerald-500/50 p-3 rounded-xs text-emerald-300 font-mono text-xs flex items-center gap-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{importNotification}</span>
        </div>
      )}

      {/* Selection Control Bar & Filter Tabs */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* League & Horizon Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="flex items-center gap-1 mr-2 text-[#64748B]">
            <Filter className="w-3.5 h-3.5" />
            <span>Filtro Reale:</span>
          </div>
          {[
            { id: 'all', label: 'Tutte le Partite Reali (26)' },
            { id: 'serie_a_3', label: '🇮🇹 Serie A 3ª (Oggi 06/09)' },
            { id: 'serie_a_4', label: '🇮🇹 Serie A 4ª (11-14 Set)' },
            { id: 'champions_league', label: '⭐ Champions League (15-17 Set)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveLeagueFilter(tab.id)}
              className={`px-2.5 py-1 rounded-xs transition-colors ${
                activeLeagueFilter === tab.id
                  ? 'bg-[#3B82F6] text-white font-bold shadow-xs'
                  : 'bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139] hover:text-white'
              }`}
            >
              {tab.label}
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
          </div>
        </div>

        {/* Bulk Selection Helpers & Sync Actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono shrink-0">
          <button
            onClick={handleSelectRound3}
            className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xs flex items-center gap-1.5 transition-colors font-bold"
            title="Seleziona 8 partite a partire da Oggi 06/09/2026 per la Schedina Madre"
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
            <span>8 Match da Oggi (06/09)</span>
          </button>

          <button
            onClick={handleSelectRound4}
            className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xs flex items-center gap-1.5 transition-colors font-bold"
            title="Seleziona le 8 partite reali di Serie A per la Schedina Madre (4ª Giornata 11-14 Settembre 2026)"
          >
            <CheckSquare className="w-3.5 h-3.5 text-indigo-400" />
            <span>8 Match 4ª Serie A</span>
          </button>

          <button
            onClick={handleSelectUCL}
            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xs flex items-center gap-1.5 transition-colors font-bold"
            title="Seleziona le 8 partite reali di Champions League per la Schedina Madre (15-17 Settembre 2026)"
          >
            <CheckSquare className="w-3.5 h-3.5 text-amber-400" />
            <span>8 Match Champions</span>
          </button>

          <button
            onClick={handleResetToRealDates}
            className="px-2.5 py-1 bg-[#1A1D26] hover:bg-[#252A36] text-[#94A3B8] hover:text-white border border-[#2D3139] rounded-xs flex items-center gap-1 transition-colors"
            title="Ripristina tutte le 26 partite al calendario ufficiale 100% reale"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Reset Reale</span>
          </button>

          <button
            onClick={deselectAll}
            className="px-2 py-1 text-[#64748B] hover:text-white"
          >
            Deseleziona
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bar for Import */}
      {selectedMatchIds.length > 0 && (
        <div className="sticky top-2 z-20 bg-[#141824] border-2 border-[#3B82F6] p-4 rounded-sm shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xs bg-[#3B82F6] flex items-center justify-center text-white font-bold font-mono text-sm shadow-sm shadow-[#3B82F6]/40">
              {selectedMatchIds.length}
            </div>
            <div>
              <div className="text-white font-bold text-sm font-mono flex items-center gap-2">
                <span>{selectedMatchIds.length} Partite Selezionate per la Multipla Madre</span>
                {selectedMatchIds.length >= 8 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-xs">
                    Bonus +26.2% Sbloccato!
                  </span>
                )}
                {selectedMatchIds.length >= 5 && selectedMatchIds.length < 8 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xs">
                    Bonus +{6 + (selectedMatchIds.length - 5) * 6}% Attivo
                  </span>
                )}
              </div>
              <p className="text-xs text-[#94A3B8]">
                Quote importate dal bookmaker:{' '}
                <strong className="text-white uppercase">
                  {BOOKMAKERS_LIST.find((b) => b.id === selectedBookmakerForImport)?.name}
                </strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-[#94A3B8] hidden md:inline">Bookmaker:</span>
              <select
                value={selectedBookmakerForImport}
                onChange={(e) => setSelectedBookmakerForImport(e.target.value as BookmakerId)}
                className="bg-[#0F1117] border border-[#2D3139] text-white px-2 py-1.5 rounded-xs font-bold font-mono text-xs"
              >
                {BOOKMAKERS_LIST.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} (Aggio {b.defaultAggio}%)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleImportSelected}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              <span>Genera Schedine S0 &amp; Coperture</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Fixtures Table with Multi-Bookmaker Odds Grid */}
      <div className="bg-[#0F1117] border border-[#2D3139] rounded-sm overflow-hidden">
        <div className="p-4 border-b border-[#2D3139] flex items-center justify-between">
          <h3 className="text-xs uppercase font-mono text-white font-bold tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#3B82F6]" />
            Tabella Partite &amp; Matrice Quote Bookmaker (Under 3.5 / Over 3.5)
          </h3>
          <span className="text-xs font-mono text-[#64748B]">
            Mostrando {filteredFixtures.length} partite in programma
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="bg-[#141824] text-[#94A3B8] border-b border-[#2D3139]">
                <th className="p-3 w-12 text-center">Seleziona</th>
                <th className="p-3 min-w-[130px]">Orario &amp; Competizione</th>
                <th className="p-3 min-w-[210px]">Partita &amp; Esito Live</th>
                <th className="p-2.5 text-center min-w-[100px] text-orange-400">
                  SNAI
                  <span className="block text-[9px] text-[#64748B] font-normal">Mod. 1 (1.32/3.00)</span>
                </th>
                <th className="p-2.5 text-center min-w-[100px] text-emerald-400">
                  Bet365
                  <span className="block text-[9px] text-[#64748B] font-normal">Mod. 2 (1.30/3.15)</span>
                </th>
                <th className="p-2.5 text-center min-w-[100px] text-blue-400">
                  Eurobet
                  <span className="block text-[9px] text-[#64748B] font-normal">Under 1.33</span>
                </th>
                <th className="p-2.5 text-center min-w-[100px] text-amber-400">
                  GoldBet
                  <span className="block text-[9px] text-[#64748B] font-normal">1.31 / 3.10</span>
                </th>
                <th className="p-2.5 text-center min-w-[100px] text-emerald-300">
                  Sisal
                  <span className="block text-[9px] text-[#64748B] font-normal">Min. Aggio (8.17%)</span>
                </th>
                <th className="p-3 text-center min-w-[110px]">Azioni Live</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20242C]">
              {filteredFixtures.map((fix) => {
                const isSelected = selectedMatchIds.includes(fix.id);
                const isLive = fix.status === 'LIVE';
                const isFinished = fix.status === 'FINISHED';
                const totalGoals = (fix.homeScore || 0) + (fix.awayScore || 0);

                return (
                  <tr
                    key={fix.id}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-[#141824]/80'
                        : isLive
                        ? 'bg-red-950/10 hover:bg-[#141824]/40'
                        : 'hover:bg-[#141824]/40'
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => toggleMatchSelection(fix.id)}
                        className="cursor-pointer text-[#3B82F6] hover:text-white"
                        title={isSelected ? 'Deseleziona' : 'Seleziona per la multipla'}
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#3B82F6]" />
                        ) : (
                          <Square className="w-4 h-4 text-[#64748B]" />
                        )}
                      </button>
                    </td>

                    {/* Date & League */}
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-white font-bold flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#3B82F6]" />
                          {fix.formattedDate} • {fix.formattedTime}
                        </span>
                        <span className="text-[10px] text-[#64748B]">
                          {fix.leagueName} ({fix.round})
                        </span>
                      </div>
                    </td>

                    {/* Match & Live State */}
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="text-white font-bold text-sm">
                          {fix.homeTeam} <span className="text-[#64748B]">vs</span> {fix.awayTeam}
                        </span>

                        {/* Status details */}
                        <div className="mt-1 flex items-center gap-2">
                          {isLive ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="px-1.5 py-0.2 rounded-xs bg-red-600 text-white font-bold animate-pulse text-[10px]">
                                LIVE {fix.liveMinute}&apos;
                              </span>
                              <span className="text-white font-bold px-1.5 py-0.2 bg-[#1A1D26] border border-red-500/40 rounded-xs">
                                {fix.homeScore} - {fix.awayScore}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-xs font-bold ${
                                  totalGoals >= 4
                                    ? 'bg-amber-950/60 text-amber-300 border border-amber-500/40'
                                    : totalGoals === 3
                                    ? 'bg-orange-950/60 text-orange-300 border border-orange-500/40'
                                    : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'
                                }`}
                              >
                                {totalGoals >= 4
                                  ? 'OVER 3.5 ATTIVO'
                                  : totalGoals === 3
                                  ? 'A RISCHIO (3 Gol)'
                                  : 'UNDER 3.5 SICURO'}
                              </span>
                            </div>
                          ) : isFinished ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="px-1.5 py-0.2 bg-zinc-800 text-[#94A3B8] rounded-xs text-[10px]">
                                FINALE
                              </span>
                              <span className="text-white font-bold">
                                {fix.homeScore} - {fix.awayScore}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded-xs font-bold ${
                                  totalGoals >= 4
                                    ? 'bg-amber-950 text-amber-300'
                                    : 'bg-emerald-950 text-emerald-400'
                                }`}
                              >
                                {totalGoals >= 4 ? 'Esito OVER' : 'Esito UNDER'}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-[#64748B]">
                              Programmata per Sab/Dom
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* SNAI Odds */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center bg-[#0F1117] p-1.5 rounded-xs border border-[#20242C]">
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">U:</span>
                          <span className="font-bold text-emerald-400">
                            {fix.quotes.snai.under35.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">O:</span>
                          <span className="font-bold text-amber-400">
                            {fix.quotes.snai.over35.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[9px] text-[#64748B] mt-0.5">
                          Aggio: {fix.quotes.snai.aggioPercent}%
                        </span>
                      </div>
                    </td>

                    {/* Bet365 Odds */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center bg-[#0F1117] p-1.5 rounded-xs border border-emerald-500/30">
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">U:</span>
                          <span className="font-bold text-emerald-400">
                            {fix.quotes.bet365.under35.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">O:</span>
                          <span className="font-bold text-amber-400">
                            {fix.quotes.bet365.over35.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[9px] text-emerald-400/80 mt-0.5 font-bold">
                          Aggio: {fix.quotes.bet365.aggioPercent}%
                        </span>
                      </div>
                    </td>

                    {/* Eurobet Odds */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center bg-[#0F1117] p-1.5 rounded-xs border border-[#20242C]">
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">U:</span>
                          <span className="font-bold text-emerald-400">
                            {fix.quotes.eurobet.under35.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">O:</span>
                          <span className="font-bold text-amber-400">
                            {fix.quotes.eurobet.over35.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[9px] text-[#64748B] mt-0.5">
                          Aggio: {fix.quotes.eurobet.aggioPercent}%
                        </span>
                      </div>
                    </td>

                    {/* GoldBet Odds */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center bg-[#0F1117] p-1.5 rounded-xs border border-[#20242C]">
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">U:</span>
                          <span className="font-bold text-emerald-400">
                            {fix.quotes.goldbet.under35.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">O:</span>
                          <span className="font-bold text-amber-400">
                            {fix.quotes.goldbet.over35.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[9px] text-[#64748B] mt-0.5">
                          Aggio: {fix.quotes.goldbet.aggioPercent}%
                        </span>
                      </div>
                    </td>

                    {/* Sisal Odds */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center bg-[#0F1117] p-1.5 rounded-xs border border-blue-500/30">
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">U:</span>
                          <span className="font-bold text-emerald-400">
                            {fix.quotes.sisal.under35.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full text-[11px]">
                          <span className="text-[#64748B]">O:</span>
                          <span className="font-bold text-amber-400">
                            {fix.quotes.sisal.over35.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[9px] text-blue-400/80 mt-0.5 font-bold">
                          Aggio: {fix.quotes.sisal.aggioPercent}%
                        </span>
                      </div>
                    </td>

                    {/* Live Simulation & Edit Controls */}
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <button
                          onClick={() => setEditingMatch(fix)}
                          className="px-2 py-0.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#3B82F6] hover:text-white border border-[#2D3139] rounded-xs text-[10px] flex items-center gap-1"
                          title="Modifica squadre, data, orario o quote base di questo match"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                          <span>Modifica</span>
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleScoreGoal(fix.id, 'home')}
                            className="px-1.5 py-0.5 bg-[#1A1D26] hover:bg-[#252A36] text-white rounded-xs text-[10px]"
                            title="Simula gol squadra casa"
                          >
                            +1 C
                          </button>
                          <button
                            onClick={() => handleScoreGoal(fix.id, 'away')}
                            className="px-1.5 py-0.5 bg-[#1A1D26] hover:bg-[#252A36] text-white rounded-xs text-[10px]"
                            title="Simula gol squadra ospite"
                          >
                            +1 O
                          </button>
                        </div>
                        {isLive && (
                          <button
                            onClick={() => handleFinishMatch(fix.id)}
                            className="px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-[#94A3B8] hover:text-white rounded-xs text-[9px]"
                            title="Imposta partita come conclusa"
                          >
                            Termina 90&apos;
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALE MODIFICA PARTITA */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-[#141824] border border-[#3B82F6] rounded-sm max-w-lg w-full p-5 shadow-2xl font-mono">
            <div className="flex items-center justify-between border-b border-[#2D3139] pb-3 mb-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#3B82F6]" />
                Modifica Partita &amp; Parametri Quote
              </h3>
              <button
                onClick={() => setEditingMatch(null)}
                className="text-[#64748B] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#94A3B8] mb-1">Squadra Casa</label>
                  <input
                    type="text"
                    value={editingMatch.homeTeam}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, homeTeam: e.target.value })
                    }
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">Squadra Ospite</label>
                  <input
                    type="text"
                    value={editingMatch.awayTeam}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, awayTeam: e.target.value })
                    }
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#94A3B8] mb-1">Data Partita</label>
                  <input
                    type="text"
                    value={editingMatch.formattedDate}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, formattedDate: e.target.value })
                    }
                    placeholder="es. Oggi Sab 08 Mar"
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">Orario Calcio d&apos;Inizio</label>
                  <input
                    type="text"
                    value={editingMatch.formattedTime}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, formattedTime: e.target.value })
                    }
                    placeholder="es. 15:00 o 20:45"
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#94A3B8] mb-1">Competizione / Lega</label>
                  <input
                    type="text"
                    value={editingMatch.leagueName}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, leagueName: e.target.value })
                    }
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#94A3B8] mb-1">Giornata / Turno</label>
                  <input
                    type="text"
                    value={editingMatch.round}
                    onChange={(e) =>
                      setEditingMatch({ ...editingMatch, round: e.target.value })
                    }
                    className="w-full bg-[#0F1117] border border-[#2D3139] text-white px-2.5 py-1.5 rounded-xs"
                  />
                </div>
              </div>

              <div className="bg-[#0F1117] p-3 rounded-xs border border-[#2D3139] space-y-2">
                <span className="text-[11px] font-bold text-amber-400 block">
                  Quote di Riferimento Under 3.5 / Over 3.5
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#94A3B8] text-[11px]">Quota Base Under 3.5</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.05"
                      max="2.50"
                      value={editingMatch.defaultUnder35}
                      onChange={(e) =>
                        setEditingMatch({
                          ...editingMatch,
                          defaultUnder35: parseFloat(e.target.value) || 1.30,
                        })
                      }
                      className="w-full bg-[#141824] border border-[#2D3139] text-emerald-400 font-bold px-2 py-1 rounded-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[#94A3B8] text-[11px]">Quota Base Over 3.5</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1.50"
                      max="10.0"
                      value={editingMatch.defaultOver35}
                      onChange={(e) =>
                        setEditingMatch({
                          ...editingMatch,
                          defaultOver35: parseFloat(e.target.value) || 3.15,
                        })
                      }
                      className="w-full bg-[#141824] border border-[#2D3139] text-amber-400 font-bold px-2 py-1 rounded-xs"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-[#64748B]">
                  Le quote comparative per SNAI, Bet365, Eurobet, GoldBet e Sisal e i relativi aggi verranno ricalcolati automaticamente al salvataggio.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-[#2D3139] flex items-center justify-between">
              <button
                onClick={() => {
                  setFixtures((prev) => prev.filter((f) => f.id !== editingMatch.id));
                  setSelectedMatchIds((prev) => prev.filter((id) => id !== editingMatch.id));
                  setEditingMatch(null);
                }}
                className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-500/30 rounded-xs text-xs"
              >
                Elimina Partita
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingMatch(null)}
                  className="px-3 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#94A3B8] rounded-xs text-xs"
                >
                  Annulla
                </button>
                <button
                  onClick={() => handleSaveEditedMatch(editingMatch)}
                  className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-bold rounded-xs text-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salva Partita</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Educational Box: Why Bookmaker Aggio & Cadence matter */}
      <div className="bg-[#141824] border border-[#2D3139] p-5 rounded-sm">
        <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2 mb-2">
          <Scale className="w-4 h-4 text-amber-400" />
          Perché l&apos;Aggio del Bookmaker e la Cadenza di 2 Ore Fanno la Differenza
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-[#94A3B8] leading-relaxed">
          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              1. Modello Snai (1.32 / 3.00)
            </div>
            <p>
              Under 3.5 a quota <strong>1.32</strong> spinge forte la moltiplicazione della Schedina Madre ($1.32^8 \approx 9.22$). Utile per massimizzare la vincita netta se tutti gli 8 match terminano Under.
            </p>
          </div>

          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-blue-400" />
              2. Modello Bet365 (1.30 / 3.15)
            </div>
            <p>
              Over 3.5 a <strong>3.15</strong> offre una quota di copertura più alta con aggio inferiore (8.67%). Richiede <strong>meno capitale di stake</strong> per coprire il recupero quando si verifica il primo errore.
            </p>
          </div>

          <div className="p-3 bg-[#0F1117] border border-[#2D3139] rounded-xs">
            <div className="text-white font-bold mb-1 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-purple-400" />
              3. Cadenza di 2 Ore tra le Partite
            </div>
            <p>
              I match sono schedulati a intervalli di 2 ore (12:30, 15:00, 18:00, 20:45) affinché <strong className="text-white">non si giochi mai al buio</strong>: la copertura $C_k$ viene piazzata solo se il match $k$ fallisce.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
