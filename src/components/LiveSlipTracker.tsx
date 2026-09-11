import React, { useState, useMemo, useEffect } from 'react';
import { UserMatch, AsymmetricMode, GeneratedSlip, BookmakerModelId, SavedSlip } from '../types';
import { useSavedSlips } from '../hooks/useSavedSlips';
import {
  DEFAULT_SERIE_A_MATCHES,
  REAL_SERIE_A_3_MATCHES,
  REAL_SERIE_A_4_MATCHES,
  REAL_CHAMPIONS_LEAGUE_MATCHES,
  generateCustomSlips,
  roundToFiftyCents,
  getBonusPercentage,
  BOOKMAKER_MODELS,
  calculateBookmakerAggio,
} from '../utils/mathEngine';
import {
  Layers,
  Clock,
  Plus,
  Trash2,
  Copy,
  Check,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Scale,
  Sliders,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  AlertTriangle,
  ArrowRight,
  Edit2,
  Calendar,
  Save,
  FolderOpen,
  Upload,
} from 'lucide-react';

interface LiveSlipTrackerProps {
  importedMatches?: UserMatch[] | null;
  onOpenCalendar?: () => void;
}

export const LiveSlipTracker: React.FC<LiveSlipTrackerProps> = ({
  importedMatches,
  onOpenCalendar,
}) => {
  // Matches state initialized from localStorage or defaults
  const [matches, setMatches] = useState<UserMatch[]>(() => {
    try {
      const saved = localStorage.getItem('multiscale_active_user_matches_v2026_sep');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_SERIE_A_MATCHES;
  });

  // Save matches on change
  useEffect(() => {
    try {
      localStorage.setItem('multiscale_active_user_matches_v2026_sep', JSON.stringify(matches));
    } catch (e) {
      console.error(e);
    }
  }, [matches]);

  // Sync if imported from calendar
  useEffect(() => {
    if (importedMatches && importedMatches.length > 0) {
      setMatches(importedMatches);
    }
  }, [importedMatches]);

  // Betting Strategy Parameters
  const [baseStake, setBaseStake] = useState<number>(20);
  const [targetProfit, setTargetProfit] = useState<number>(45);
  const [asymmetricMode, setAsymmetricMode] = useState<AsymmetricMode>('front_loaded');
  const [enableBooster, setEnableBooster] = useState<boolean>(true);
  const [boosterOdds, setBoosterOdds] = useState<number>(1.10);

  // Bookmaker Aggio Model State ('132_300' | '130_315' | 'custom')
  const [selectedBookmakerModel, setSelectedBookmakerModel] = useState<BookmakerModelId>('132_300');
  const [modelApplyScope, setModelApplyScope] = useState<'pending' | 'all'>('all');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter or active slip view in tickets view
  const [filterType, setFilterType] = useState<'all' | 'active_only' | 'mother'>('all');

  // F10 — libreria schedine salvate (locale-first + sync cloud)
  const {
    slips, loading: slipsLoading, error: slipsError, usingFallback: slipsLocal,
    saveSlip, overwriteSlip, deleteSlip,
  } = useSavedSlips();
  const [slipName, setSlipName] = useState('');
  const [slipMsg, setSlipMsg] = useState<string | null>(null);

  // Compute live slips whenever matches or parameters change
  const slipsResult = useMemo(() => {
    return generateCustomSlips(
      matches,
      baseStake,
      targetProfit,
      asymmetricMode,
      enableBooster,
      boosterOdds,
      4
    );
  }, [matches, baseStake, targetProfit, asymmetricMode, enableBooster, boosterOdds]);

  // Match management functions
  const handleUpdateMatch = (id: string, field: keyof UserMatch, value: any) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        return { ...m, [field]: value };
      })
    );
  };

  const handleApplyBookmakerModel = (modelId: '132_300' | '130_315') => {
    const model = BOOKMAKER_MODELS[modelId];
    setSelectedBookmakerModel(modelId);
    setMatches((prev) =>
      prev.map((m) => {
        if (modelApplyScope === 'pending' && m.outcome !== 'PENDING') {
          return m;
        }
        return {
          ...m,
          underOdds: model.underOdds,
          overOdds: model.overOdds,
        };
      })
    );
  };

  const handleAddMatch = () => {
    setMatches((prev) => {
      const nextOrder = prev.length + 1;
      const currentModel =
        selectedBookmakerModel !== 'custom'
          ? BOOKMAKER_MODELS[selectedBookmakerModel]
          : BOOKMAKER_MODELS['132_300'];
      const newMatch: UserMatch = {
        id: `m_${Date.now()}`,
        order: nextOrder,
        timeSlot: `+${(nextOrder - 1) * 2}h:00`,
        homeTeam: `Squadra Casa ${nextOrder}`,
        awayTeam: `Squadra Ospite ${nextOrder}`,
        underOdds: currentModel.underOdds,
        overOdds: currentModel.overOdds,
        outcome: 'PENDING',
        note: `Match #${nextOrder}`,
      };
      return [...prev, newMatch];
    });
  };

  const handleRemoveMatch = (id: string) => {
    setMatches((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      return filtered.map((m, idx) => ({ ...m, order: idx + 1 }));
    });
  };

  const handleMoveMatch = (index: number, direction: 'up' | 'down') => {
    setMatches((prev) => {
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((m, idx) => ({ ...m, order: idx + 1 }));
    });
  };

  const handleSetOutcome = (id: string, outcome: 'PENDING' | 'UNDER' | 'OVER') => {
    setMatches((prev) =>
      prev.map((m) => (m.id === id ? { ...m, outcome } : m))
    );
  };

  const handleResetOutcomes = () => {
    setMatches((prev) => prev.map((m) => ({ ...m, outcome: 'PENDING', resultScore: '' })));
  };

  const handleLoadPreset = (preset: 'serie_a' | 'premier' | 'custom_5') => {
    if (preset === 'serie_a') {
      setMatches(DEFAULT_SERIE_A_MATCHES);
    } else if (preset === 'premier') {
      setMatches([
        { id: 'pl1', order: 1, timeSlot: '13:30', homeTeam: 'Arsenal', awayTeam: 'Newcastle', underOdds: 1.33, overOdds: 3.05, outcome: 'PENDING' },
        { id: 'pl2', order: 2, timeSlot: '16:00', homeTeam: 'Chelsea', awayTeam: 'Everton', underOdds: 1.28, overOdds: 3.35, outcome: 'PENDING' },
        { id: 'pl3', order: 3, timeSlot: '18:30', homeTeam: 'Man City', awayTeam: 'Tottenham', underOdds: 1.40, overOdds: 2.75, outcome: 'PENDING' },
        { id: 'pl4', order: 4, timeSlot: '+1d 15:00', homeTeam: 'Liverpool', awayTeam: 'Brighton', underOdds: 1.35, overOdds: 2.90, outcome: 'PENDING' },
        { id: 'pl5', order: 5, timeSlot: '+1d 17:30', homeTeam: 'Aston Villa', awayTeam: 'Man United', underOdds: 1.31, overOdds: 3.15, outcome: 'PENDING' },
        { id: 'pl6', order: 6, timeSlot: '+2d 21:00', homeTeam: 'West Ham', awayTeam: 'Brentford', underOdds: 1.27, overOdds: 3.45, outcome: 'PENDING' },
      ]);
    } else if (preset === 'custom_5') {
      setMatches(DEFAULT_SERIE_A_MATCHES.slice(0, 5));
    }
  };

  const currentSlipParams = () => ({
    baseStake,
    targetProfit,
    asymmetricMode,
    enableBooster,
    boosterOdds,
    bookmakerModel: selectedBookmakerModel,
    modelApplyScope,
  });

  const defaultSlipName = () => {
    const d = new Date();
    return `Schedina ${matches.length} eventi — ${d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const flashSlipMsg = (m: string) => {
    setSlipMsg(m);
    setTimeout(() => setSlipMsg(null), 3500);
  };

  const handleSaveSlip = async () => {
    try {
      const s = await saveSlip({ name: slipName.trim() || defaultSlipName(), matches, params: currentSlipParams() });
      setSlipName('');
      flashSlipMsg(`💾 "${s.name}" salvata (${s.matches.length} partite)`);
    } catch (e) {
      flashSlipMsg(`⚠ ${e instanceof Error ? e.message : 'Errore salvataggio'}`);
    }
  };

  const handleOverwriteSlip = async (s: SavedSlip) => {
    try {
      await overwriteSlip(s.id, { name: s.name, matches, params: currentSlipParams() });
      flashSlipMsg(`💾 "${s.name}" sovrascritta con la configurazione attuale`);
    } catch (e) {
      flashSlipMsg(`⚠ ${e instanceof Error ? e.message : 'Errore sovrascrittura'}`);
    }
  };

  const handleLoadSlip = (s: SavedSlip) => {
    if (!s.matches.length) return;
    setMatches(s.matches.map((m, idx) => ({ ...m, order: idx + 1 })));
    const p = s.params;
    if (Number.isFinite(p.baseStake)) setBaseStake(p.baseStake);
    if (Number.isFinite(p.targetProfit)) setTargetProfit(p.targetProfit);
    if (p.asymmetricMode) setAsymmetricMode(p.asymmetricMode);
    if (typeof p.enableBooster === 'boolean') setEnableBooster(p.enableBooster);
    if (Number.isFinite(p.boosterOdds)) setBoosterOdds(p.boosterOdds);
    if (p.bookmakerModel) setSelectedBookmakerModel(p.bookmakerModel);
    if (p.modelApplyScope) setModelApplyScope(p.modelApplyScope);
    flashSlipMsg(`📂 Caricata "${s.name}" (${s.matches.length} partite)`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSlip = async (s: SavedSlip) => {
    await deleteSlip(s.id);
    flashSlipMsg(`🗑 "${s.name}" eliminata`);
  };

  const copySlipToClipboard = (slip: GeneratedSlip) => {
    const lines = [
      `📋 ${slip.title} [Codice: ${slip.code}]`,
      `🕒 Tempistica: ${slip.timing}`,
      `💰 Puntata da effettuare: €${slip.stake.toFixed(2)} (arrotondata)`,
      `📈 Quota Totale (+Bonus): ${slip.finalMultiplier.toFixed(2)} (${slip.bonusPercentage > 0 ? `+${slip.bonusPercentage}% bonus` : 'nessun bonus'})`,
      `🎯 Vincita Lorda: €${slip.potentialGrossPayout.toFixed(2)} | Utile Netto Garantito: €${slip.potentialNetProfit.toFixed(2)}`,
      `--- PRONOSTICI ---`,
      ...slip.items.map(
        (it) => `${it.homeTeam} - ${it.awayTeam} (${it.timeSlot}) -> ${it.market} @ ${it.odds.toFixed(2)}`
      ),
    ];
    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId(slip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allSlips = [slipsResult.motherSlip, ...slipsResult.coverageSlips];

  return (
    <div className="space-y-6">
      {/* Overview & Live Status Header */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#2D3139]">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/40 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xs flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Live Slip Workbench
              </span>
              <span className="text-xs text-[#94A3B8] font-mono">
                {matches.length} Partite Configurate
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Generatore Schedine &amp; Live Tracking Quote Personalizzate
            </h2>
            <p className="text-xs text-[#94A3B8] mt-1 max-w-3xl leading-relaxed">
              Inserisci le tue partite reali con le rispettive quote. Il sistema genera
              automaticamente la <strong>Schedina Madre</strong> e le <strong>Coperture fino alla Singola</strong>. Man mano che le partite si giocano, clicca sull&apos;esito e <strong>modifica a mano le quote</strong> se il bookmaker le ha cambiate: tutte le puntate a 0,50€ e i moltiplicatori si aggiornano istantaneamente.
            </p>
          </div>

          {/* Quick Presets & Reset */}
          <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-xs">
            <span className="text-[10px] text-[#64748B] uppercase">Preimposta:</span>
            <button
              onClick={() => handleLoadPreset('serie_a')}
              className="px-2.5 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#E0E2E7] border border-[#2D3139] rounded-xs"
            >
              8 Serie A
            </button>
            <button
              onClick={() => handleLoadPreset('premier')}
              className="px-2.5 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#E0E2E7] border border-[#2D3139] rounded-xs"
            >
              6 Premier League
            </button>
            <button
              onClick={handleResetOutcomes}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-[#94A3B8] hover:text-white border border-zinc-700 rounded-xs flex items-center gap-1"
              title="Azzera esiti preservando le squadre e quote"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset Esiti
            </button>
          </div>
        </div>

        {/* Live System Status Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 font-mono text-xs">
          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">Schedina Attiva</div>
            <div className="text-white font-bold text-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              {slipsResult.currentActiveSlipCode === 'S0'
                ? 'Schedina Madre (S0)'
                : `Copertura ${slipsResult.currentActiveSlipCode}`}
            </div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">
              {slipsResult.hasOverOccurred ? 'Copertura Subentrata' : 'Multipla Madre in corsa'}
            </div>
          </div>

          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">Capitale Impegnato Finora</div>
            <div className="text-[#3B82F6] font-bold text-sm">
              €{slipsResult.totalInvestedSoFar.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              Piazzato su schedine giocate/attive
            </div>
          </div>

          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">Esposizione Massima (Worst-Case)</div>
            <div className="text-orange-400 font-bold text-sm">
              €{slipsResult.maxPotentialExposure.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              Se si arriva alla singola finale
            </div>
          </div>

          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">Stato Generale</div>
            <div className="font-bold text-sm">
              {slipsResult.overallStatus === 'IN_PLAY' && (
                <span className="text-emerald-400">In Corso di Gioco</span>
              )}
              {slipsResult.overallStatus === 'WON_MOTHER' && (
                <span className="text-emerald-400 font-bold">Vinta Multipla Madre! (+€{slipsResult.netGainRealized?.toFixed(2)})</span>
              )}
              {slipsResult.overallStatus === 'WON_COVERAGE' && (
                <span className="text-emerald-400 font-bold">Vinta Copertura {slipsResult.winningSlipCode}! (+€{slipsResult.netGainRealized?.toFixed(2)})</span>
              )}
              {slipsResult.overallStatus === 'LOST_MULTIPLE_OVERS' && (
                <span className="text-red-400 font-bold">2+ Over (Sistema Saltato)</span>
              )}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              Regola: 1 solo Over tollerato
            </div>
          </div>
        </div>

        {/* Dynamic Advice Notification */}
        {slipsResult.hasOverOccurred && slipsResult.firstOverIndex !== null && (
          <div className="mt-3 p-3 bg-amber-950/30 border border-amber-500/40 rounded-xs flex items-start gap-2.5 text-xs font-mono">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[#E0E2E7]">
              <strong className="text-amber-400">Evento OVER Rilevato al Match #{slipsResult.firstOverIndex + 1}!</strong>
              <span className="ml-1 text-[#94A3B8]">
                La Schedina Madre è decaduta, ma la Copertura <strong>C{slipsResult.firstOverIndex + 1}</strong> è vincente e ripaga tutti i costi sostenuti.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Libreria Schedine Salvate (F10) */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#3B82F6]" />
            <span className="text-xs uppercase font-mono text-white font-bold tracking-wider">Schedine Salvate</span>
            <span className={`text-[10px] font-mono ${slipsLocal ? 'text-[#64748B]' : 'text-emerald-400'}`}>
              {slipsLocal ? 'solo locale (login per sync cloud)' : 'sync cloud attiva'}
            </span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              value={slipName}
              onChange={(e) => setSlipName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleSaveSlip()}
              placeholder={defaultSlipName()}
              className="flex-1 sm:w-72 bg-[#1A1D26] border border-[#2D3139] rounded-xs px-2.5 py-1.5 text-xs font-mono text-white outline-none focus:border-[#3B82F6] min-w-0"
            />
            <button
              onClick={() => void handleSaveSlip()}
              disabled={!matches.length}
              className="px-3 py-1.5 text-xs font-mono uppercase font-bold bg-[#3B82F6] hover:bg-blue-500 text-white rounded-xs flex items-center gap-1.5 disabled:opacity-40 shrink-0"
              title="Salva la configurazione attuale (partite + parametri) nella libreria"
            >
              <Save className="w-3.5 h-3.5" /> Salva ora
            </button>
          </div>
        </div>

        {slipsError && <div className="text-[11px] font-mono text-red-300">{slipsError}</div>}
        {slipMsg && <div className="text-[11px] font-mono text-emerald-300">{slipMsg}</div>}

        {slipsLoading ? (
          <div className="text-[11px] font-mono text-[#64748B]">Caricamento schedine…</div>
        ) : slips.length === 0 ? (
          <div className="text-[11px] font-mono text-[#64748B]">
            Nessuna schedina salvata: configura le partite (o importale dal Calendario) e premi <strong className="text-[#94A3B8]">Salva ora</strong>.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {slips.map((s) => (
              <div key={s.id} className="border border-[#2D3139] bg-[#141824] rounded-xs p-2.5 flex flex-col gap-2">
                <div className="min-w-0">
                  <div className="text-white text-xs font-bold truncate" title={s.name}>{s.name}</div>
                  <div className="text-[10px] font-mono text-[#64748B]">
                    {s.matches.length} partite · madre €{s.params.baseStake} · target €{s.params.targetProfit} · {new Date(s.createdAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {s.updatedAt !== s.createdAt && ' · aggiornata'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px]">
                  <button
                    onClick={() => handleLoadSlip(s)}
                    className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 rounded-xs uppercase font-bold flex items-center gap-1"
                  >
                    <Upload className="w-3 h-3" /> Carica
                  </button>
                  <button
                    onClick={() => void handleOverwriteSlip(s)}
                    title="Sostituisci questa schedina con la configurazione attuale"
                    className="px-2 py-1 bg-[#1A1D26] hover:bg-[#252A36] text-[#94A3B8] hover:text-white border border-[#2D3139] rounded-xs uppercase"
                  >
                    Sovrascrivi
                  </button>
                  <button
                    onClick={() => void handleDeleteSlip(s)}
                    className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded-xs uppercase ml-auto flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Strategy and Global Parameters Bar */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#3B82F6]" />
            <span className="text-xs uppercase font-mono text-white font-bold tracking-wider">
              Parametri di Dutching &amp; Strategia
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
            {/* Base Stake */}
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8]">Puntata Madre:</span>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="2"
                  max="500"
                  value={baseStake}
                  onChange={(e) => setBaseStake(Math.max(2, parseFloat(e.target.value) || 2))}
                  className="w-20 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white text-right rounded-xs font-bold"
                />
                <span className="absolute left-1.5 top-1 text-[#64748B]">€</span>
              </div>
            </div>

            {/* Target Profit */}
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8]">Target Utile:</span>
              <div className="relative">
                <input
                  type="number"
                  step="5"
                  min="5"
                  max="1000"
                  value={targetProfit}
                  onChange={(e) => setTargetProfit(Math.max(5, parseFloat(e.target.value) || 5))}
                  className="w-20 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-emerald-400 text-right rounded-xs font-bold"
                />
                <span className="absolute left-1.5 top-1 text-[#64748B]">€</span>
              </div>
            </div>

            {/* Asymmetric Strategy Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8]">Curva:</span>
              <select
                value={asymmetricMode}
                onChange={(e) => setAsymmetricMode(e.target.value as AsymmetricMode)}
                className="bg-[#1A1D26] border border-[#2D3139] text-white px-2 py-1 rounded-xs font-bold"
              >
                <option value="front_loaded">Sbilanciata (Consigliata)</option>
                <option value="capital_preservation">Salva Capitale (0€ Finale)</option>
                <option value="flat">Simmetrica (Flat)</option>
              </select>
            </div>

            {/* Prominent Boost 1.10 Toggle Switch */}
            <div className="flex items-center gap-2.5 px-2.5 py-1.5 bg-[#141824] border border-[#2D3139] rounded-xs">
              <button
                type="button"
                role="switch"
                aria-checked={enableBooster}
                onClick={() => setEnableBooster(!enableBooster)}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  enableBooster ? 'bg-emerald-500' : 'bg-zinc-700'
                }`}
                title={enableBooster ? 'Disattiva Boost 1.10' : 'Attiva Boost 1.10'}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    enableBooster ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>

              <div className="flex items-center gap-1.5 select-none cursor-pointer" onClick={() => setEnableBooster(!enableBooster)}>
                <Sparkles className={`w-3.5 h-3.5 ${enableBooster ? 'text-emerald-400 animate-pulse' : 'text-[#64748B]'}`} />
                <span className="font-bold text-xs text-white">Boost 1.10:</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] font-bold uppercase rounded-xs ${
                    enableBooster
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-zinc-800 text-[#64748B] border border-zinc-700'
                  }`}
                >
                  {enableBooster ? 'SI (ATTIVO)' : 'NO (DISATTIVO)'}
                </span>
              </div>

              {enableBooster && (
                <div className="flex items-center gap-1 pl-2 border-l border-[#2D3139]">
                  <span className="text-[10px] text-[#64748B]">Quota:</span>
                  {[1.08, 1.10, 1.15].map((q) => (
                    <button
                      key={q}
                      onClick={() => setBoosterOdds(q)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border transition-colors ${
                        boosterOdds === q
                          ? 'bg-[#3B82F6] text-white border-[#3B82F6] font-bold'
                          : 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139] hover:text-white'
                      }`}
                    >
                      @{q.toFixed(2)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: MATCH ENTRY & LIVE ODDS MODIFICATION TABLE */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2D3139]">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-[#3B82F6]" />
              1. Partite della Multipla &amp; Aggiornamento Quote dal Vivo
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Inserisci squadre e orario. <strong>Modifica le quote a mano</strong> in qualsiasi momento se cambiano prima della partita.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenCalendar && (
              <button
                onClick={onOpenCalendar}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 font-mono text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors"
                title="Sfoglia partite e compara le quote dei bookmaker"
              >
                <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                <span>Calendario Quote Reali</span>
              </button>
            )}

            <button
              onClick={() => {
                localStorage.removeItem('multiscale_active_user_matches_v1');
                localStorage.removeItem('multiscale_active_user_matches_v2');
                localStorage.removeItem('multiscale_active_user_matches_v3');
                localStorage.removeItem('multiscale_active_user_matches_v2026_sep');
                setMatches(REAL_SERIE_A_3_MATCHES);
              }}
              className="px-2.5 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-blue-400 hover:text-white border border-[#2D3139] font-mono text-xs rounded-xs transition-colors flex items-center gap-1"
              title="Carica le 8 partite reali della 3ª Giornata di Serie A (Oggi 06/09/2026 & Turno in corso)"
            >
              <span>🇮🇹 3ª Serie A (Oggi 06/09)</span>
            </button>

            <button
              onClick={() => {
                setMatches(REAL_SERIE_A_4_MATCHES);
              }}
              className="px-2.5 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-indigo-300 hover:text-white border border-[#2D3139] font-mono text-xs rounded-xs transition-colors flex items-center gap-1"
              title="Carica le 8 partite reali della 4ª Giornata di Serie A (11-14 Settembre 2026)"
            >
              <span>🇮🇹 4ª Serie A (11-14 Set)</span>
            </button>

            <button
              onClick={() => {
                setMatches(REAL_CHAMPIONS_LEAGUE_MATCHES);
              }}
              className="px-2.5 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-amber-300 hover:text-white border border-[#2D3139] font-mono text-xs rounded-xs transition-colors flex items-center gap-1"
              title="Carica le 8 partite reali di Champions League (1ª Giornata 15-17 Settembre 2026)"
            >
              <span>⭐ Champions League (15-17 Set)</span>
            </button>

            <button
              onClick={handleAddMatch}
              className="px-3 py-1.5 bg-[#3B82F6] hover:bg-[#2563EB] text-white font-mono text-xs font-bold rounded-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              Aggiungi ({matches.length + 1})
            </button>
          </div>
        </div>

        {/* BOOKMAKER AGGIO MODELS SELECTOR */}
        <div className="bg-[#141824] border border-[#2D3139] p-3.5 rounded-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Modelli di Aggio del Bookmaker (Under 3.5 / Over 3.5)
                </span>
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-0.5">
                Seleziona il modello rilevato dal tuo bookmaker per applicare le quote a tutte le partite con un solo click:
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Scope selector */}
              <div className="flex items-center bg-[#0F1117] border border-[#2D3139] rounded-xs p-0.5 text-[11px] font-mono">
                <button
                  onClick={() => setModelApplyScope('all')}
                  className={`px-2 py-1 rounded-xs transition-colors ${
                    modelApplyScope === 'all'
                      ? 'bg-[#2A2F3D] text-white font-bold'
                      : 'text-[#64748B] hover:text-white'
                  }`}
                  title="Applica il modello a tutte le partite della lista"
                >
                  Tutte
                </button>
                <button
                  onClick={() => setModelApplyScope('pending')}
                  className={`px-2 py-1 rounded-xs transition-colors ${
                    modelApplyScope === 'pending'
                      ? 'bg-[#2A2F3D] text-white font-bold'
                      : 'text-[#64748B] hover:text-white'
                  }`}
                  title="Applica solo alle partite non ancora concluse (Pending)"
                >
                  Solo Pending
                </button>
              </div>

              {/* Model 1: 1.32 - 3.00 */}
              <button
                onClick={() => handleApplyBookmakerModel('132_300')}
                className={`px-3 py-1.5 rounded-xs border font-mono text-xs transition-all flex items-center gap-2 ${
                  selectedBookmakerModel === '132_300'
                    ? 'bg-[#3B82F6] text-white border-[#3B82F6] font-bold shadow-xs'
                    : 'bg-[#1A1D26] text-[#E0E2E7] border-[#2D3139] hover:bg-[#252A36]'
                }`}
              >
                <span>1.32 — 3.00</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/40 text-amber-300 rounded-xs font-bold">
                  Aggio 9.09%
                </span>
              </button>

              {/* Model 2: 1.30 - 3.15 */}
              <button
                onClick={() => handleApplyBookmakerModel('130_315')}
                className={`px-3 py-1.5 rounded-xs border font-mono text-xs transition-all flex items-center gap-2 ${
                  selectedBookmakerModel === '130_315'
                    ? 'bg-[#3B82F6] text-white border-[#3B82F6] font-bold shadow-xs'
                    : 'bg-[#1A1D26] text-[#E0E2E7] border-[#2D3139] hover:bg-[#252A36]'
                }`}
              >
                <span>1.30 — 3.15</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/40 text-emerald-300 rounded-xs font-bold">
                  Aggio 8.67%
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Matches Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2D3139] text-[#64748B] text-[10px] uppercase bg-[#141824]">
                <th className="p-2.5 w-12 text-center">#</th>
                <th className="p-2.5 w-24">Orario / Data</th>
                <th className="p-2.5 min-w-[200px]">Squadra Casa - Squadra Ospite</th>
                <th className="p-2.5 w-28 text-center text-emerald-400">Quota UNDER 3.5</th>
                <th className="p-2.5 w-28 text-center text-amber-400">Quota OVER 3.5</th>
                <th className="p-2.5 w-24 text-center text-[#94A3B8]">Aggio Book</th>
                <th className="p-2.5 w-44 text-center">Esito Partita (Live)</th>
                <th className="p-2.5 w-20 text-center">Ordina</th>
                <th className="p-2.5 w-14 text-center">Elimina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#20242C]">
              {matches.map((match, index) => {
                const isUnder = match.outcome === 'UNDER';
                const isOver = match.outcome === 'OVER';
                const isPending = match.outcome === 'PENDING';
                const aggio = calculateBookmakerAggio(match.underOdds, match.overOdds);

                return (
                  <tr
                    key={match.id}
                    className={`hover:bg-[#1A1D26]/40 transition-colors ${
                      isOver
                        ? 'bg-amber-950/20'
                        : isUnder
                        ? 'bg-emerald-950/10'
                        : ''
                    }`}
                  >
                    {/* Order Number */}
                    <td className="p-2.5 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        isOver
                          ? 'bg-amber-500 text-black'
                          : isUnder
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-[#2A2F3D] text-white'
                      }`}>
                        {match.order}
                      </span>
                    </td>

                    {/* Time Slot */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={match.timeSlot}
                        onChange={(e) => handleUpdateMatch(match.id, 'timeSlot', e.target.value)}
                        placeholder="15:00"
                        className="w-full bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white rounded-xs text-xs font-mono"
                      />
                    </td>

                    {/* Teams */}
                    <td className="p-2.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={match.homeTeam}
                          onChange={(e) => handleUpdateMatch(match.id, 'homeTeam', e.target.value)}
                          placeholder="Squadra Casa"
                          className="w-1/2 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white rounded-xs text-xs font-sans font-medium"
                        />
                        <span className="text-[#64748B] font-bold">-</span>
                        <input
                          type="text"
                          value={match.awayTeam}
                          onChange={(e) => handleUpdateMatch(match.id, 'awayTeam', e.target.value)}
                          placeholder="Squadra Ospite"
                          className="w-1/2 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white rounded-xs text-xs font-sans font-medium"
                        />
                      </div>
                    </td>

                    {/* Under 3.5 Odds (Directly Editable) */}
                    <td className="p-2.5 text-center">
                      <div className="inline-flex items-center relative">
                        <input
                          type="number"
                          step="0.01"
                          min="1.05"
                          max="10.0"
                          value={match.underOdds}
                          onChange={(e) => handleUpdateMatch(match.id, 'underOdds', parseFloat(e.target.value) || 1.30)}
                          className="w-20 text-center bg-[#1A1D26] border border-emerald-500/40 text-emerald-400 font-bold py-1 px-1.5 rounded-xs focus:border-emerald-400 focus:outline-hidden"
                        />
                      </div>
                    </td>

                    {/* Over 3.5 Odds (Directly Editable) */}
                    <td className="p-2.5 text-center">
                      <div className="inline-flex items-center relative">
                        <input
                          type="number"
                          step="0.05"
                          min="1.10"
                          max="25.0"
                          value={match.overOdds}
                          onChange={(e) => handleUpdateMatch(match.id, 'overOdds', parseFloat(e.target.value) || 3.0)}
                          className="w-20 text-center bg-[#1A1D26] border border-amber-500/40 text-amber-300 font-bold py-1 px-1.5 rounded-xs focus:border-amber-400 focus:outline-hidden"
                        />
                      </div>
                    </td>

                    {/* Aggio Bookmaker Calculation Column */}
                    <td className="p-2.5 text-center">
                      <div className="flex flex-col items-center">
                        <span
                          className={`px-1.5 py-0.5 rounded-xs text-[10px] font-mono font-bold ${
                            aggio.aggioPercent <= 8.8
                              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/30'
                              : aggio.aggioPercent <= 9.3
                              ? 'bg-blue-950/40 text-blue-300 border border-blue-500/30'
                              : 'bg-amber-950/40 text-amber-300 border border-amber-500/30'
                          }`}
                          title={`Overround: ${(aggio.overround * 100).toFixed(1)}% | Payout Bookmaker: ${aggio.payoutPercent}% | Fair Under: ${aggio.fairUnderProb}% | Fair Over: ${aggio.fairOverProb}%`}
                        >
                          {aggio.aggioPercent}%
                        </span>
                        <span className="text-[9px] text-[#64748B] font-mono mt-0.5">
                          {aggio.fairUnderProb}% U
                        </span>
                      </div>
                    </td>

                    {/* Live Outcome Selector */}
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1 bg-[#141824] border border-[#2D3139] p-0.5 rounded-xs">
                        <button
                          onClick={() => handleSetOutcome(match.id, 'UNDER')}
                          className={`px-2 py-1 rounded-xs text-[10px] font-bold transition-colors ${
                            isUnder
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                          title="Partita terminata con 0, 1, 2 o 3 gol"
                        >
                          UNDER
                        </button>
                        <button
                          onClick={() => handleSetOutcome(match.id, 'OVER')}
                          className={`px-2 py-1 rounded-xs text-[10px] font-bold transition-colors ${
                            isOver
                              ? 'bg-amber-500 text-black shadow-xs'
                              : 'text-[#94A3B8] hover:text-white'
                          }`}
                          title="Partita terminata con 4 o più gol"
                        >
                          OVER
                        </button>
                        <button
                          onClick={() => handleSetOutcome(match.id, 'PENDING')}
                          className={`px-1.5 py-1 rounded-xs text-[10px] transition-colors ${
                            isPending
                              ? 'bg-[#2A2F3D] text-white'
                              : 'text-[#64748B] hover:text-white'
                          }`}
                          title="In attesa di iniziare"
                        >
                          ⏳
                        </button>
                      </div>
                    </td>

                    {/* Move Up / Down */}
                    <td className="p-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          disabled={index === 0}
                          onClick={() => handleMoveMatch(index, 'up')}
                          className="p-1 text-[#64748B] hover:text-white disabled:opacity-20 transition-colors"
                          title="Sposta prima"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          disabled={index === matches.length - 1}
                          onClick={() => handleMoveMatch(index, 'down')}
                          className="p-1 text-[#64748B] hover:text-white disabled:opacity-20 transition-colors"
                          title="Sposta dopo"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {/* Delete */}
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() => handleRemoveMatch(match.id)}
                        className="p-1 text-[#64748B] hover:text-red-400 transition-colors"
                        title="Rimuovi partita"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: GENERATED BETTING SLIPS DISPLAY */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              2. Schedine Generate (Schedina Madre + Coperture a Scalare)
            </h3>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Piazzamento sequenziale: gioca ogni copertura solo 15 minuti prima del rispettivo match.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex bg-[#1A1D26] border border-[#2D3139] rounded-xs p-1 text-xs font-mono">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-xs transition-colors ${
                filterType === 'all'
                  ? 'bg-[#3B82F6] text-white font-bold'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Tutte ({allSlips.length})
            </button>
            <button
              onClick={() => setFilterType('active_only')}
              className={`px-3 py-1 rounded-xs transition-colors ${
                filterType === 'active_only'
                  ? 'bg-[#3B82F6] text-white font-bold'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              In Corso / Attiva
            </button>
            <button
              onClick={() => setFilterType('mother')}
              className={`px-3 py-1 rounded-xs transition-colors ${
                filterType === 'mother'
                  ? 'bg-[#3B82F6] text-white font-bold'
                  : 'text-[#94A3B8] hover:text-white'
              }`}
            >
              Solo Madre (S0)
            </button>
          </div>
        </div>

        {/* Slips Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {allSlips
            .filter((slip) => {
              if (filterType === 'mother') return slip.type === 'MOTHER';
              if (filterType === 'active_only') return slip.status === 'ACTIVE' || slip.status === 'WON';
              return true;
            })
            .map((slip) => {
              const isMother = slip.type === 'MOTHER';
              const isFinal = slip.type === 'FINAL_SINGLE';
              const isWon = slip.status === 'WON';
              const isLost = slip.status === 'LOST';
              const isActive = slip.status === 'ACTIVE';

              return (
                <div
                  key={slip.id}
                  className={`border rounded-sm p-4 transition-all ${
                    isWon
                      ? 'bg-emerald-950/20 border-emerald-500 shadow-sm shadow-emerald-500/10'
                      : isActive
                      ? 'bg-[#141824] border-[#3B82F6] ring-1 ring-[#3B82F6]/50'
                      : isLost
                      ? 'bg-[#0F1117] border-[#20242C] opacity-60'
                      : isMother
                      ? 'bg-[#11141E] border-[#3B82F6]/40'
                      : 'bg-[#0F1117] border-[#2D3139]'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2 mb-3 pb-2.5 border-b border-[#2D3139]">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-xs font-mono font-bold text-xs uppercase ${
                        isWon
                          ? 'bg-emerald-500 text-black'
                          : isActive
                          ? 'bg-[#3B82F6] text-white animate-pulse'
                          : isLost
                          ? 'bg-zinc-800 text-[#64748B]'
                          : isMother
                          ? 'bg-purple-900/60 text-purple-200 border border-purple-500/40'
                          : isFinal
                          ? 'bg-amber-900/60 text-amber-200 border border-amber-500/40'
                          : 'bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139]'
                      }`}>
                        {slip.code}
                      </span>
                      <div>
                        <h4 className="text-white font-bold text-xs font-mono">
                          {slip.title}
                        </h4>
                        <div className="text-[10px] text-[#64748B] font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#64748B]" />
                          {slip.timing}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-bold uppercase ${
                        isWon
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                          : isActive
                          ? 'bg-blue-950 text-blue-300 border border-blue-500/40'
                          : isLost
                          ? 'bg-zinc-900 text-zinc-500'
                          : 'bg-[#1A1D26] text-[#64748B]'
                      }`}>
                        {isWon ? 'VINTA' : isActive ? 'DA PIAZZARE' : isLost ? 'SUPERATA' : 'IN ATTESA'}
                      </span>

                      <button
                        onClick={() => copySlipToClipboard(slip)}
                        className="p-1.5 bg-[#1A1D26] hover:bg-[#2A2F3D] text-[#94A3B8] hover:text-white border border-[#2D3139] rounded-xs transition-colors"
                        title="Copia pronostici e dati della schedina"
                      >
                        {copiedId === slip.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Bets List in this Slip */}
                  <div className="space-y-1.5 mb-3.5">
                    <div className="text-[10px] uppercase font-mono text-[#64748B] flex justify-between px-1">
                      <span>Evento / Selezione</span>
                      <span>Quota</span>
                    </div>
                    {slip.items.map((item, idx) => (
                      <div
                        key={`${item.matchId}-${idx}`}
                        className={`p-1.5 rounded-xs flex items-center justify-between text-xs font-mono ${
                          item.market === 'OVER 3.5'
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                            : item.market === 'BOOSTER 1X/12'
                            ? 'bg-blue-500/10 border border-blue-500/30 text-blue-200'
                            : 'bg-[#141824] border border-[#20242C] text-[#E0E2E7]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[10px] text-[#64748B]">#{item.matchOrder}</span>
                          <span className="font-medium truncate">
                            {item.homeTeam} - {item.awayTeam}
                          </span>
                          <span className={`text-[10px] px-1 py-0.2 rounded-xs font-bold ${
                            item.market === 'OVER 3.5'
                              ? 'bg-amber-500/20 text-amber-300'
                              : item.market === 'BOOSTER 1X/12'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {item.market}
                          </span>
                        </div>
                        <span className="font-bold shrink-0 ml-2">
                          {item.odds.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Financial Metrics Strip */}
                  <div className="bg-[#141824] border border-[#20242C] p-2.5 rounded-xs grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">Quota Finale</span>
                      <span className="text-white font-bold">
                        {slip.finalMultiplier.toFixed(2)}
                      </span>
                      {slip.bonusPercentage > 0 && (
                        <span className="text-[9px] text-emerald-400 block">
                          +{slip.bonusPercentage}% bonus
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">Puntata (€0.50)</span>
                      <span className="text-[#3B82F6] font-bold text-sm">
                        €{slip.stake.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">Vincita Lorda</span>
                      <span className="text-white font-bold">
                        €{slip.potentialGrossPayout.toFixed(2)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">Utile Netto</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        +€{slip.potentialNetProfit.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
