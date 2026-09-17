import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  UserMatch,
  AsymmetricMode,
  FinalHedgeMode,
  GeneratedSlip,
  BookmakerModelId,
  SavedSlip,
} from '../types';
import { useSavedSlips } from '../hooks/useSavedSlips';
import {
  DEFAULT_SERIE_A_MATCHES,
  REAL_SERIE_A_3_MATCHES,
  REAL_SERIE_A_4_MATCHES,
  REAL_CHAMPIONS_LEAGUE_MATCHES,
  generateCustomSlips,
  getSlipBook,
  roundToFiftyCents,
  getBonusPercentage,
  BOOKMAKER_MODELS,
  calculateBookmakerAggio,
} from '../utils/mathEngine';
import { proposeTarget } from '../engine/matrix';
import { requoteGate } from '../engine/requote';
import { useOperation } from '../store/useOperation';
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
  onOpenPlace?: () => void;
}

export const LiveSlipTracker: React.FC<LiveSlipTrackerProps> = ({
  importedMatches,
  onOpenCalendar,
  onOpenPlace,
}) => {
  // Matches state initialized from localStorage or defaults
  const [matches, setMatches] = useState<UserMatch[]>(() => {
    try {
      const saved = localStorage.getItem('multiscale_active_user_matches_v2026_sep');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    // F11: niente piu' demo di default — stato vuoto con CTA dedicata.
    return [];
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
      // F26: la linea del feed diventa la linea della schedina.
      const importedLine = importedMatches[0]?.line;
      if (typeof importedLine === 'number' && importedLine > 0) {
        setSlipLine(importedLine);
      }
    }
  }, [importedMatches]);

  // Betting Strategy Parameters
  const [baseStake, setBaseStake] = useState<number>(20);
  const [targetProfit, setTargetProfit] = useState<number>(45);
  // F26 — linea Totals della schedina (1.5/2.5/3.5/4.5), uniforme su tutte
  // le gambe. All'import dal Calendario si sincronizza con la linea del feed.
  const [slipLine, setSlipLine] = useState<number>(3.5);
  const [asymmetricMode, setAsymmetricMode] = useState<AsymmetricMode>('front_loaded');
  const [enableBooster, setEnableBooster] = useState<boolean>(true);
  const [boosterOdds, setBoosterOdds] = useState<number>(1.1);

  // F13 — finale in banca: LAY Under 3.5 su exchange (Betfair) con green-up
  const [finalHedgeMode, setFinalHedgeMode] = useState<FinalHedgeMode>('lay_exchange');
  const [layOdds, setLayOdds] = useState<number | null>(null); // null = auto (Under ultimo match)
  const [layCommissionPct, setLayCommissionPct] = useState<number>(4.5);
  const [layStake, setLayStake] = useState<number | null>(null); // null = sizing green-up automatico
  // F15 — regola mai-perdita: sizing armonizzato (dutching a payout comune)
  const [harmonized, setHarmonized] = useState<boolean>(true);
  // F27 — modo ROI (target = r% del capitale, verifica stretta) + tetto S0.
  const [targetMode, setTargetMode] = useState<'fixed' | 'roi'>('fixed');
  const [roiPct, setRoiPct] = useState<number>(4);
  const [baseCap, setBaseCap] = useState<number>(10);
  const [gateVerdict, setGateVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  // F23 — budget totale ipotetico I_tot (null = sizing dutch): OGNI copertura
  // paga budget+target. Messaggio proposta target dal motore.
  const [budgetTot, setBudgetTot] = useState<number | null>(null);
  const [targetProposal, setTargetProposal] = useState<string | null>(null);

  // Bookmaker Aggio Model State ('132_300' | '130_315' | 'custom')
  const [selectedBookmakerModel, setSelectedBookmakerModel] = useState<BookmakerModelId>('132_300');
  const [modelApplyScope, setModelApplyScope] = useState<'pending' | 'all'>('all');

  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter or active slip view in tickets view
  const [filterType, setFilterType] = useState<'all' | 'active_only' | 'mother'>('all');

  // F10 — libreria schedine salvate (locale-first + sync cloud)
  const {
    slips,
    loading: slipsLoading,
    error: slipsError,
    usingFallback: slipsLocal,
    saveSlip,
    overwriteSlip,
    deleteSlip,
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
      4,
      finalHedgeMode,
      {
        layOdds: layOdds ?? undefined,
        layCommissionPct,
        layStake: layStake ?? undefined,
        harmonized,
        budget: budgetTot ?? undefined,
        targetMode,
        roiPct,
        baseCap,
      },
      slipLine,
    );
  }, [
    matches,
    baseStake,
    targetProfit,
    asymmetricMode,
    enableBooster,
    boosterOdds,
    finalHedgeMode,
    layOdds,
    layCommissionPct,
    layStake,
    harmonized,
    budgetTot,
    targetMode,
    roiPct,
    baseCap,
    slipLine,
  ]);

  // Match management functions
  const handleUpdateMatch = (id: string, field: keyof UserMatch, value: any) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== id) {
          return m;
        }
        return { ...m, [field]: value };
      }),
    );
  };

  // F31 prenotate: cambia il book vincolato di un lato (la quota segue il book).
  const handleChangeMatchBook = (id: string, side: 'under' | 'over', book: string) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== id) {
          return m;
        }
        const opt = (m.feedBooks ?? []).find((b) => b.book === book);
        const odds = opt ? opt[side] : null;
        return {
          ...m,
          [side === 'under' ? 'underBook' : 'overBook']: book || undefined,
          ...(odds !== null && odds !== undefined && Number.isFinite(odds)
            ? { [side === 'under' ? 'underOdds' : 'overOdds']: odds as number }
            : {}),
        };
      }),
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
      }),
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
        line: slipLine,
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
      if (targetIdx < 0 || targetIdx >= prev.length) {
        return prev;
      }
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy.map((m, idx) => ({ ...m, order: idx + 1 }));
    });
  };

  const handleSetOutcome = (id: string, outcome: 'PENDING' | 'UNDER' | 'OVER') => {
    setMatches((prev) => prev.map((m) => (m.id === id ? { ...m, outcome } : m)));
  };

  const handleResetOutcomes = () => {
    setMatches((prev) => prev.map((m) => ({ ...m, outcome: 'PENDING', resultScore: '' })));
  };

  const handleLoadPreset = (preset: 'serie_a' | 'premier' | 'custom_5') => {
    if (preset === 'serie_a') {
      setMatches(DEFAULT_SERIE_A_MATCHES);
    } else if (preset === 'premier') {
      setMatches([
        {
          id: 'pl1',
          order: 1,
          timeSlot: '13:30',
          homeTeam: 'Arsenal',
          awayTeam: 'Newcastle',
          underOdds: 1.33,
          overOdds: 3.05,
          outcome: 'PENDING',
        },
        {
          id: 'pl2',
          order: 2,
          timeSlot: '16:00',
          homeTeam: 'Chelsea',
          awayTeam: 'Everton',
          underOdds: 1.28,
          overOdds: 3.35,
          outcome: 'PENDING',
        },
        {
          id: 'pl3',
          order: 3,
          timeSlot: '18:30',
          homeTeam: 'Man City',
          awayTeam: 'Tottenham',
          underOdds: 1.4,
          overOdds: 2.75,
          outcome: 'PENDING',
        },
        {
          id: 'pl4',
          order: 4,
          timeSlot: '+1d 15:00',
          homeTeam: 'Liverpool',
          awayTeam: 'Brighton',
          underOdds: 1.35,
          overOdds: 2.9,
          outcome: 'PENDING',
        },
        {
          id: 'pl5',
          order: 5,
          timeSlot: '+1d 17:30',
          homeTeam: 'Aston Villa',
          awayTeam: 'Man United',
          underOdds: 1.31,
          overOdds: 3.15,
          outcome: 'PENDING',
        },
        {
          id: 'pl6',
          order: 6,
          timeSlot: '+2d 21:00',
          homeTeam: 'West Ham',
          awayTeam: 'Brentford',
          underOdds: 1.27,
          overOdds: 3.45,
          outcome: 'PENDING',
        },
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
    finalHedgeMode,
    layOdds: layOdds ?? undefined,
    layCommissionPct,
    layStake: layStake ?? undefined,
    harmonized,
    budget: budgetTot ?? undefined,
    line: slipLine,
    targetMode,
    roiPct,
    baseCap,
  });

  const defaultSlipName = () => {
    const d = new Date();
    return `Schedina ${matches.length} eventi — ${d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // U1 — tiene aggiornata l'operazione condivisa con Piazza (salta il primo
  // render per non cancellare un'operazione esistente all'avvio).
  const { setOperation } = useOperation();
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    setOperation(matches, {
      baseStake,
      targetProfit,
      targetMode,
      roiPct,
      baseCap,
      asymmetricMode,
      enableBooster,
      boosterOdds,
      finalHedgeMode,
      layOdds: layOdds ?? undefined,
      layCommissionPct,
      layStake: layStake ?? undefined,
      harmonized,
      budget: budgetTot ?? undefined,
      line: slipLine,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matches,
    baseStake,
    targetProfit,
    targetMode,
    roiPct,
    baseCap,
    asymmetricMode,
    enableBooster,
    boosterOdds,
    finalHedgeMode,
    layOdds,
    layCommissionPct,
    layStake,
    harmonized,
    budgetTot,
    slipLine,
  ]);

  const flashSlipMsg = (m: string) => {
    setSlipMsg(m);
    setTimeout(() => setSlipMsg(null), 3500);
  };

  const handleSaveSlip = async () => {
    try {
      const s = await saveSlip({
        name: slipName.trim() || defaultSlipName(),
        matches,
        params: currentSlipParams(),
      });
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
    if (!s.matches.length) {
      return;
    }
    setMatches(s.matches.map((m, idx) => ({ ...m, order: idx + 1 })));
    const p = s.params;
    if (Number.isFinite(p.baseStake)) {
      setBaseStake(p.baseStake);
    }
    if (Number.isFinite(p.targetProfit)) {
      setTargetProfit(p.targetProfit);
    }
    if (p.asymmetricMode) {
      setAsymmetricMode(p.asymmetricMode);
    }
    if (typeof p.enableBooster === 'boolean') {
      setEnableBooster(p.enableBooster);
    }
    if (Number.isFinite(p.boosterOdds)) {
      setBoosterOdds(p.boosterOdds);
    }
    if (p.finalHedgeMode) {
      setFinalHedgeMode(p.finalHedgeMode);
    }
    setLayOdds(Number.isFinite(p.layOdds) ? (p.layOdds as number) : null);
    if (Number.isFinite(p.layCommissionPct)) {
      setLayCommissionPct(p.layCommissionPct as number);
    }
    setLayStake(Number.isFinite(p.layStake) ? (p.layStake as number) : null);
    if (typeof p.harmonized === 'boolean') {
      setHarmonized(p.harmonized);
    }
    setBudgetTot(Number.isFinite(p.budget) && (p.budget as number) > 0 ? (p.budget as number) : null);
    // F27: modo ROI + tetto S0 (vecchi salvataggi = fixed, nessun cap).
    if (p.targetMode === 'roi') {
      setTargetMode('roi');
    } else {
      setTargetMode('fixed');
    }
    if (Number.isFinite(p.roiPct) && (p.roiPct as number) > 0) {
      setRoiPct(p.roiPct as number);
    }
    if (Number.isFinite(p.baseCap) && (p.baseCap as number) > 0) {
      setBaseCap(p.baseCap as number);
    }
    setGateVerdict(null);
    // F26: linea salvata (vecchi salvataggi = 3.5; fallback dalla prima gamba).
    if (typeof p.line === 'number' && p.line > 0) {
      setSlipLine(p.line);
    } else {
      const firstLine = s.matches[0]?.line;
      setSlipLine(typeof firstLine === 'number' && firstLine > 0 ? firstLine : 3.5);
    }
    setTargetProposal(null);
    if (p.bookmakerModel) {
      setSelectedBookmakerModel(p.bookmakerModel);
    }
    if (p.modelApplyScope) {
      setModelApplyScope(p.modelApplyScope);
    }
    flashSlipMsg(`📂 Caricata "${s.name}" (${s.matches.length} partite)`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSlip = async (s: SavedSlip) => {
    await deleteSlip(s.id);
    flashSlipMsg(`🗑 "${s.name}" eliminata`);
  };

  // F23 — chiede al motore la quota obiettivo congrua (max t verificato
  // 5..60 col budget impostato) e la applica al target.
  const handleProposeTarget = () => {
    if (budgetTot === null || matches.length < 2) {
      setTargetProposal('Imposta prima un budget > 0 (e almeno 2 partite).');
      setTimeout(() => setTargetProposal(null), 5000);
      return;
    }
    const prop = proposeTarget({
      matches,
      baseStake,
      layCommissionPct,
      layQuote: layOdds ?? undefined,
      finaleModes: [finalHedgeMode === 'lay_exchange' ? 'lay' : 'book'],
      budget: budgetTot,
    });
    if (prop.tStar === null) {
      setTargetProposal(
        `Nessun target 5–60 verifica col budget €${budgetTot}: alza il budget o accorcia.`,
      );
    } else {
      setTargetProfit(prop.tStar);
      setTargetProposal(
        `Motore: target congruo +€${prop.tStar} applicato (verificato su ogni ramo).`,
      );
    }
    setTimeout(() => setTargetProposal(null), 6000);
  };

  // F27 — gate pre-piazzamento: riverifica la scala con le quote COME SONO ORA
  // nella tabella (osservate) + vincoli exchange sulla banca. VIA LIBERA solo
  // se ogni ramo verifica, altrimenti STOP col motivo. Rieseguire dopo ogni
  // modifica alle quote.
  const handleGateCheck = () => {
    if (matches.length < 2) {
      setGateVerdict({ ok: false, text: 'STOP: servono almeno 2 partite.' });
      return;
    }
    const v = requoteGate({
      matches,
      baseStake,
      targetProfit,
      targetMode,
      roiPct,
      baseCap,
      layCommissionPct,
      layQuoteObserved: layOdds ?? undefined,
      finaleModes: [finalHedgeMode === 'lay_exchange' ? 'lay' : 'book'],
    });
    if (v.ok) {
      setGateVerdict({ ok: true, text: v.note });
    } else {
      setGateVerdict({ ok: false, text: v.detail });
    }
  };

  const copySlipToClipboard = (slip: GeneratedSlip) => {
    const isLay = slip.type === 'FINAL_LAY';
    const lines = [
      `📋 ${slip.title} [Codice: ${slip.code}]`,
      `🕒 Tempistica: ${slip.timing}`,
      isLay
        ? `🏦 BANCA su Betfair: stake puntatore €${slip.stake.toFixed(2)} | responsabilità €${(slip.liability ?? 0).toFixed(2)} | quota lay ${slip.finalMultiplier.toFixed(2)} | commissioni ${(slip.commissionPct ?? 0).toFixed(1)}%`
        : `💰 Puntata da effettuare: €${slip.stake.toFixed(2)} (arrotondata)`,
      `📈 Quota Totale (+Bonus): ${slip.finalMultiplier.toFixed(2)} (${slip.bonusPercentage > 0 ? `+${slip.bonusPercentage}% bonus` : 'nessun bonus'})`,
      isLay
        ? `🎯 Utile se esce Over (netto commissioni): €${slip.potentialGrossPayout.toFixed(2)} | Netto finale se vince la banca: €${slip.realizedNetIfWon.toFixed(2)}`
        : `🎯 Vincita Lorda: €${slip.potentialGrossPayout.toFixed(2)} | Netto finale se vince (incl. coperture successive perse): €${slip.realizedNetIfWon.toFixed(2)}`,
      `--- PRONOSTICI ---`,
      ...slip.items.map(
        (it) =>
          `${it.homeTeam} - ${it.awayTeam} (${it.timeSlot}) -> ${it.market} @ ${it.odds.toFixed(2)}${it.book ? ` [${it.book}]` : ''}`,
      ),
    ];
    const bi = getSlipBook(slip);
    if (bi.books.length > 0) {
      lines.splice(
        3,
        0,
        bi.mixed
          ? `⚠ MISTO su più book (${bi.books.join(', ')}): un ticket = un solo book — verifica`
          : `🏦 Da piazzare su: ${bi.single}`,
      );
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId(slip.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const allSlips = [slipsResult.motherSlip, ...slipsResult.coverageSlips];

  const fmtGain = (v: number | null): string =>
    v === null ? '—' : `${v >= 0 ? '+' : '-'}€${Math.abs(v).toFixed(2)}`;
  const netGain = slipsResult.netGainRealized;

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
              automaticamente la <strong>Schedina Madre</strong> e le{' '}
              <strong>Coperture fino alla Singola</strong>. Man mano che le partite si giocano,
              clicca sull&apos;esito e <strong>modifica a mano le quote</strong> se il bookmaker le
              ha cambiate: tutte le puntate a 0,50€ e i moltiplicatori si aggiornano
              istantaneamente.
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
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">
              Capitale Impegnato Finora
            </div>
            <div className="text-[#3B82F6] font-bold text-sm">
              €{slipsResult.totalInvestedSoFar.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              {finalHedgeMode === 'lay_exchange'
                ? 'Puntate book + responsabilità banca a rischio'
                : 'Piazzato su schedine giocate/attive'}
            </div>
          </div>

          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">
              Esposizione Massima (Worst-Case)
            </div>
            <div className="text-orange-400 font-bold text-sm">
              €{slipsResult.maxPotentialExposure.toFixed(2)}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              {finalHedgeMode === 'lay_exchange'
                ? 'Puntate book + responsabilità banca'
                : 'Se si arriva alla singola finale'}
            </div>
          </div>

          <div className="bg-[#1A1D26] border border-[#2D3139] p-3 rounded-xs">
            <div className="text-[10px] text-[#64748B] uppercase mb-0.5">Stato Generale</div>
            <div className="font-bold text-sm">
              {slipsResult.overallStatus === 'IN_PLAY' && (
                <span className="text-emerald-400">In Corso di Gioco</span>
              )}
              {slipsResult.overallStatus === 'WON_MOTHER' && (
                <span
                  className={`font-bold ${
                    (netGain ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  Vinta Multipla Madre! ({fmtGain(netGain)})
                </span>
              )}
              {slipsResult.overallStatus === 'WON_COVERAGE' && (
                <span
                  className={`font-bold ${
                    (netGain ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {slipsResult.winningSlipCode === `C${matches.length}` &&
                  finalHedgeMode === 'lay_exchange'
                    ? 'Vinta Banca Finale!'
                    : `Vinta Copertura ${slipsResult.winningSlipCode}!`}{' '}
                  ({fmtGain(netGain)})
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5">
              Relay a scalare: vince sempre la copertura dell'ultimo Over
            </div>
          </div>
        </div>

        {/* Dynamic Advice Notification */}
        {slipsResult.hasOverOccurred && slipsResult.firstOverIndex !== null && (
          <div className="mt-3 p-3 bg-amber-950/30 border border-amber-500/40 rounded-xs flex items-start gap-2.5 text-xs font-mono">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-[#E0E2E7]">
              <strong className="text-amber-400">
                Evento OVER Rilevato al Match #{slipsResult.firstOverIndex + 1}!
              </strong>
              <span className="ml-1 text-[#94A3B8]">
                {slipsResult.overallStatus === 'WON_COVERAGE' ? (
                  <>
                    La Schedina Madre è decaduta, la Copertura{' '}
                    <strong>{slipsResult.winningSlipCode}</strong> è vincente: netto finale{' '}
                    <strong>{fmtGain(netGain)}</strong> (payout meno tutte le puntate piazzate,
                    incluse le coperture successive perse).
                  </>
                ) : (
                  <>
                    La Schedina Madre è decaduta: la Copertura di quel match diventa la nuova madre
                    e continua a essere protetta round dopo round.
                  </>
                )}
               </span>
             </div>
           </div>
         )}

        {/* F15 — verdetto armonizzazione regola mai-perdita */}
        {slipsResult.harmonization?.requested && (
          <div
            className={`mt-3 p-3 rounded-xs flex items-start gap-2.5 text-xs font-mono border ${
              slipsResult.harmonization.feasible
                ? 'bg-emerald-950/30 border-emerald-500/40'
                : 'bg-red-950/30 border-red-500/40'
            }`}
          >
            {slipsResult.harmonization.feasible ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            )}
            <div className="text-[#E0E2E7]">
              {slipsResult.harmonization.feasible ? (
                slipsResult.harmonization.finaleMode === 'lay' ? (
                  <>
                    <strong className="text-emerald-400">Scala ARMONIZZATA — regola mai-perdita:</strong>{' '}
                    OGNI esito finale (madre, qualsiasi copertura, banca se esce Over) chiude ≥{' '}
                    <strong>{fmtGain(slipsResult.harmonization.equalizedNet)}</strong>. Puntate book €
                    {slipsResult.maxPotentialExposure !== undefined
                      ? (
                          slipsResult.maxPotentialExposure -
                          (slipsResult.coverageSlips[slipsResult.coverageSlips.length - 1]?.liability ??
                            0)
                        ).toFixed(2)
                      : '—'}{' '}
                    + responsabilità banca €
                    {(
                      slipsResult.coverageSlips[slipsResult.coverageSlips.length - 1]?.liability ?? 0
                    ).toFixed(2)}{' '}
                    (lay @{slipsResult.harmonization.layQuoteUsed.toFixed(2)}, fattore k×
                    {slipsResult.harmonization.kFactor.toFixed(2)}).
                    {slipsResult.harmonization.baseUsed > baseStake + 1e-9 && (
                      <>
                        {' '}S0 adeguato a{' '}
                        <strong>€{slipsResult.harmonization.baseUsed.toFixed(2)}</strong> (minimo €
                        {slipsResult.harmonization.baseMinRequired.toFixed(2)} per chiudere anche
                        il ramo madre).
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <strong className="text-emerald-400">
                      Scala ARMONIZZATA (punta/punta) — regola mai-perdita:
                    </strong>{' '}
                    OGNI esito finale (madre, qualsiasi copertura, singola finale) chiude ≥{' '}
                    <strong>{fmtGain(slipsResult.harmonization.equalizedNet)}</strong>. Capitale book €
                    {slipsResult.maxPotentialExposure.toFixed(2)} a payout comune (Σ(1/quota) ={' '}
                    {slipsResult.harmonization.sumInverseMultipliers.toFixed(3)} &lt; 1, nessun
                    haircut exchange).
                    {slipsResult.harmonization.baseUsed > baseStake + 1e-9 && (
                      <>
                        {' '}S0 adeguato a{' '}
                        <strong>€{slipsResult.harmonization.baseUsed.toFixed(2)}</strong> (minimo €
                        {slipsResult.harmonization.baseMinRequired.toFixed(2)} per chiudere anche
                        il ramo madre).
                      </>
                    )}
                  </>
                )
              ) : slipsResult.harmonization.finaleMode === 'lay' ? (
                slipsResult.harmonization.reason === 'mother' ? (
                  <>
                    <strong className="text-red-400">
                      ARMONIZZAZIONE IMPOSSIBILE: ramo MADRE fuori portata
                    </strong>{' '}
                    — neanche alzando S0 il payout madre coprirebbe il costo della scala
                    (moltiplicatore madre troppo basso per il target): aggiungi Under alti alla
                    madre, allunga la scala o abbassa il target.
                  </>
                ) : slipsResult.harmonization.reason === 'quota' ? (
                  <>
                    <strong className="text-red-400">
                      ARMONIZZAZIONE IMPOSSIBILE: quota sotto 1.25
                    </strong>{' '}
                    — la regola impone mai sotto quota 1.25 su OGNI selezione: una o più
                    gambe della scala sono sotto soglia. Correggi le quote (workbench) o
                    cambia le partite (Calendario).
                  </>
                ) : slipsResult.harmonization.reason === 'budget' ? (
                  <>
                    <strong className="text-red-400">
                      BUDGET INSUFFICIENTE: la scala non verifica
                    </strong>{' '}
                    — col budget €{(budgetTot ?? 0).toFixed(2)} il ramo peggiore chiude a{' '}
                    {fmtGain(
                      Math.min(
                        slipsResult.motherSlip.realizedNetIfWon,
                        ...slipsResult.coverageSlips.map((s) => s.realizedNetIfWon),
                      ),
                    )}{' '}
                    contro target +€{targetProfit.toFixed(2)} (spesa €
                    {slipsResult.maxPotentialExposure.toFixed(2)}). Alza il budget, usa
                    "Proponi target", o accorcia la scala.
                  </>
                ) : slipsResult.harmonization.reason === 'cap' ? (
                  <>
                    <strong className="text-red-400">
                      TETTO S0: servirebbero €{slipsResult.harmonization.baseMinRequired.toFixed(2)}
                    </strong>{' '}
                    — oltre il tetto operativo: la scala non si arma senza superare il
                    tetto di puntata. Accorcia la scala o cerca quote madre più alte.
                  </>
                ) : slipsResult.harmonization.reason === 'terms' ? (
                  <>
                    <strong className="text-red-400">
                      TETTO VINCITA: giocata vietata
                    </strong>{' '}
                    —{' '}
                    {slipsResult.harmonization.termsDetail ??
                      'un payout supera il tetto (max €50.000 su tutti i book)'}
                    : oltre non si incassa per intero da nessuna parte. Accorcia la scala o
                    abbassa gli stake.
                  </>
                ) : (
                  <>
                    <strong className="text-red-400">
                      ARMONIZZAZIONE IMPOSSIBILE a lay @{slipsResult.harmonization.layQuoteUsed.toFixed(2)}
                    </strong>{' '}
                    — il dutching non chiude (k×Σ(1/quota coperture) ={' '}
                    {(slipsResult.harmonization.kFactor * slipsResult.harmonization.sumInverseMultipliers).toFixed(2)}{' '}
                    ≥ 1). Con queste quote serve una quota lay ≤{' '}
                    <strong>@{slipsResult.harmonization.maxLayQuote.toFixed(2)}</strong>: in pratica,
                    bancare IN-PLAY quando l&apos;Under dell&apos;ultimo match scende. Fintanto che la
                    quota e&apos; questa, la scala standard mostrata ha rami negativi (evidenziati
                    onesti in rosso).
                  </>
                )
              ) : slipsResult.harmonization.reason === 'mother' ? (
                <>
                  <strong className="text-red-400">
                    ARMONIZZAZIONE IMPOSSIBILE: ramo MADRE fuori portata
                  </strong>{' '}
                  — neanche alzando S0 il payout madre coprirebbe il costo della scala in
                  dutching puro: aggiungi Under alti alla madre o abbassa il target.
                </>
              ) : slipsResult.harmonization.reason === 'quota' ? (
                <>
                  <strong className="text-red-400">
                    ARMONIZZAZIONE IMPOSSIBILE: quota sotto 1.25
                  </strong>{' '}
                  — la regola impone mai sotto quota 1.25 su OGNI selezione: una o più
                  gambe della scala sono sotto soglia. Correggi le quote (workbench) o
                  cambia le partite (Calendario).
                </>
              ) : slipsResult.harmonization.reason === 'budget' ? (
                <>
                  <strong className="text-red-400">
                    BUDGET INSUFFICIENTE: la scala non verifica
                  </strong>{' '}
                  — col budget €{(budgetTot ?? 0).toFixed(2)} il ramo peggiore chiude a{' '}
                  {fmtGain(
                    Math.min(
                      slipsResult.motherSlip.realizedNetIfWon,
                      ...slipsResult.coverageSlips.map((s) => s.realizedNetIfWon),
                    ),
                  )}{' '}
                  contro target +€{targetProfit.toFixed(2)} (spesa €
                  {slipsResult.maxPotentialExposure.toFixed(2)}). Alza il budget, usa
                  "Proponi target", o accorcia la scala.
                </>
              ) : slipsResult.harmonization.reason === 'cap' ? (
                <>
                  <strong className="text-red-400">
                    TETTO S0: servirebbero €{slipsResult.harmonization.baseMinRequired.toFixed(2)}
                  </strong>{' '}
                  — oltre il tetto operativo: la scala non si arma senza superare il
                  tetto di puntata. Accorcia la scala o cerca quote madre più alte.
                </>
              ) : slipsResult.harmonization.reason === 'terms' ? (
                <>
                  <strong className="text-red-400">
                    TETTO PAYOUT BOOK: garanzia ineseguibile
                  </strong>{' '}
                  — un payout della scala supera il max payout del book: il ramo
                  madre/copertura verrebbe tagliato. Cambia book o accorcia la scala.
                </>
              ) : (
                <>
                  <strong className="text-red-400">
                    ARMONIZZAZIONE IMPOSSIBILE in punta/punta
                  </strong>{' '}
                  — il dutching puro non chiude (Σ(1/quota) ={' '}
                  {slipsResult.harmonization.sumInverseMultipliers.toFixed(2)} ≥ 1): prova la
                  finale in banca exchange, oppure accorcia la scala / cerca quote migliori.
                  La scala standard mostrata ha rami negativi (evidenziati onesti in rosso).
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Libreria Schedine Salvate (F10) */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#3B82F6]" />
            <span className="text-xs uppercase font-mono text-white font-bold tracking-wider">
              Schedine Salvate
            </span>
            <span
              className={`text-[10px] font-mono ${slipsLocal ? 'text-[#64748B]' : 'text-emerald-400'}`}
            >
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
            Nessuna schedina salvata: configura le partite (o importale dal Calendario) e premi{' '}
            <strong className="text-[#94A3B8]">Salva ora</strong>.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {slips.map((s) => (
              <div
                key={s.id}
                className="border border-[#2D3139] bg-[#141824] rounded-xs p-2.5 flex flex-col gap-2"
              >
                <div className="min-w-0">
                  <div className="text-white text-xs font-bold truncate" title={s.name}>
                    {s.name}
                  </div>
                  <div className="text-[10px] font-mono text-[#64748B]">
                    {s.matches.length} partite · madre €{s.params.baseStake} ·{' '}
                    {s.params.targetMode === 'roi'
                      ? `ROI ${s.params.roiPct ?? 4}% (cap €${s.params.baseCap ?? '—'})`
                      : `target €${s.params.targetProfit}`}{' '}
                    {new Date(s.createdAt).toLocaleString('it-IT', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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

            {/* Target Profit: fisso € oppure ROI % del capitale (F27) */}
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8]">Target:</span>
              <div className="flex rounded-xs overflow-hidden border border-[#2D3139]">
                <button
                  type="button"
                  onClick={() => setTargetMode('fixed')}
                  title="Utile fisso in euro su ogni esito"
                  className={`px-2 py-1 text-xs font-bold ${targetMode === 'fixed' ? 'bg-emerald-500/25 text-emerald-300' : 'bg-[#1A1D26] text-[#64748B]'}`}
                >
                  € fisso
                </button>
                <button
                  type="button"
                  onClick={() => setTargetMode('roi')}
                  title="Utile = % del capitale esposto, verifica stretta a tolleranza zero (richiede Armonizza)"
                  className={`px-2 py-1 text-xs font-bold ${targetMode === 'roi' ? 'bg-emerald-500/25 text-emerald-300' : 'bg-[#1A1D26] text-[#64748B]'}`}
                >
                  ROI %
                </button>
              </div>
              {targetMode === 'fixed' ? (
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
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="50"
                      value={roiPct}
                      onChange={(e) =>
                        setRoiPct(Math.min(50, Math.max(0.5, parseFloat(e.target.value) || 4)))
                      }
                      title="Percentuale del capitale esposto garantita su ogni esito"
                      className="w-16 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-emerald-400 text-right rounded-xs font-bold"
                    />
                    <span className="absolute left-1.5 top-1 text-[#64748B]">%</span>
                  </div>
                  <span className="text-[#94A3B8] text-xs" title="Tetto operativo S0: la base non lo supera mai">
                    Cap €:
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="500"
                    value={baseCap}
                    onChange={(e) =>
                      setBaseCap(Math.min(500, Math.max(1, parseFloat(e.target.value) || 10)))
                    }
                    title="Tetto S0: oltre, la scala è scartata (mai bump oltre il tetto)"
                    className="w-16 bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white text-right rounded-xs font-bold"
                  />
                </div>
              )}
            </div>
            {/* F27 — readout target certificato in modo ROI */}
            {targetMode === 'roi' && slipsResult.harmonization?.feasible && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/40 rounded-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-200">
                  Target certificato <strong>€{slipsResult.harmonization.targetUsed.toFixed(2)}</strong>{' '}
                  ({roiPct}% di €{slipsResult.maxPotentialExposure.toFixed(2)} esposti) — ogni esito ≥{' '}
                  {fmtGain(slipsResult.harmonization.equalizedNet)}
                </span>
              </div>
            )}

            {/* F26 — Linea Totals (uniforme su tutta la schedina) */}
            <div className="flex items-center gap-2">
              <span className="text-[#94A3B8]">Linea:</span>
              <select
                value={slipLine}
                onChange={(e) => setSlipLine(parseFloat(e.target.value))}
                title="Linea Totals di tutte le gambe (Under/Over). All'import dal Calendario segue la linea del feed."
                className="bg-[#1A1D26] border border-[#2D3139] text-white px-2 py-1 rounded-xs font-bold"
              >
                <option value="1.5">Under/Over 1.5</option>
                <option value="2.5">Under/Over 2.5</option>
                <option value="3.5">Under/Over 3.5</option>
                <option value="4.5">Under/Over 4.5</option>
              </select>
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
                <option value="back_loaded">Recupero in Finale (leggere iniziali)</option>
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

              <div
                className="flex items-center gap-1.5 select-none cursor-pointer"
                onClick={() => setEnableBooster(!enableBooster)}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${enableBooster ? 'text-emerald-400 animate-pulse' : 'text-[#64748B]'}`}
                />
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
                  {[1.08, 1.1, 1.15].map((q) => (
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

            {/* F13 — Finale in Banca: LAY Under 3.5 su exchange (Betfair) */}
            <div className="flex flex-wrap items-center gap-2.5 px-2.5 py-1.5 bg-[#141824] border border-[#2D3139] rounded-xs">
              <button
                type="button"
                role="switch"
                aria-checked={finalHedgeMode === 'lay_exchange'}
                onClick={() =>
                  setFinalHedgeMode(finalHedgeMode === 'lay_exchange' ? 'book_single' : 'lay_exchange')
                }
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  finalHedgeMode === 'lay_exchange' ? 'bg-violet-500' : 'bg-zinc-700'
                }`}
                title={
                  finalHedgeMode === 'lay_exchange'
                    ? 'Torna alla singola Over in bookmaker'
                    : 'Chiudi in banca: LAY Under 3.5 su Betfair'
                }
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    finalHedgeMode === 'lay_exchange' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>

              <div
                className="flex items-center gap-1.5 select-none cursor-pointer"
                onClick={() =>
                  setFinalHedgeMode(
                    finalHedgeMode === 'lay_exchange' ? 'book_single' : 'lay_exchange',
                  )
                }
              >
                <span className="font-bold text-xs text-white">Finale in Banca (Betfair):</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] font-bold uppercase rounded-xs ${
                    finalHedgeMode === 'lay_exchange'
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                      : 'bg-zinc-800 text-[#64748B] border border-zinc-700'
                  }`}
                >
                  {finalHedgeMode === 'lay_exchange' ? 'LAY UNDER' : 'SINGOLA BOOK'}
                </span>
              </div>

              {finalHedgeMode === 'lay_exchange' && (
                <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#2D3139]">
                  <span className="text-[10px] text-[#64748B]">Quota Lay:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="1.01"
                    max="10"
                    value={layOdds ?? ''}
                    placeholder={
                      matches.length
                        ? `auto @${(Number(matches[matches.length - 1].underOdds) || 1.3).toFixed(2)}`
                        : 'auto'
                    }
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLayOdds(Number.isFinite(v) && v > 1 ? v : null);
                    }}
                    className="w-20 bg-[#1A1D26] border border-[#2D3139] px-2 py-0.5 text-violet-300 text-right rounded-xs font-bold font-mono text-xs"
                  />
                  <span className="text-[10px] text-[#64748B]">Stake:</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={layStake ?? ''}
                    placeholder={`auto €${(slipsResult.coverageSlips[slipsResult.coverageSlips.length - 1]?.stake ?? 0).toFixed(2)}`}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setLayStake(Number.isFinite(v) && v > 0 ? v : null);
                    }}
                    className="w-20 bg-[#1A1D26] border border-[#2D3139] px-2 py-0.5 text-violet-300 text-right rounded-xs font-bold font-mono text-xs"
                    title="Lascia vuoto per il sizing green-up automatico, oppure fissa tu lo stake della banca"
                  />
                  <span className="text-[10px] text-[#64748B]">Comm.%:</span>
                  {[2, 5].map((cVal) => (
                    <button
                      key={cVal}
                      onClick={() => setLayCommissionPct(cVal)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border transition-colors ${
                        layCommissionPct === cVal
                          ? 'bg-violet-500 text-white border-violet-500 font-bold'
                          : 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139] hover:text-white'
                      }`}
                    >
                      {cVal}%
                    </button>
                  ))}
                  <span className="text-[10px] text-[#64748B]">
                    {layStake
                      ? 'stake manuale: netti dei due rami per come sono'
                      : 'sizing green-up: entrambi i rami finali pari'}
                  </span>
                </div>
              )}

              {/* F15/F20 — toggle armonizzazione regola mai-perdita (banca o punta/punta) */}
              <div
                className="flex items-center gap-1.5 select-none cursor-pointer pl-2 border-l border-[#2D3139]"
                onClick={() => setHarmonized(!harmonized)}
                title={
                  finalHedgeMode === 'lay_exchange'
                    ? "Dutching a payout comune + banca sul ramo peggiore: OGNI esito finale (madre, qualsiasi copertura, banca) chiude >= 0. Chiude solo se la quota lay e' abbastanza bassa: altrimenti l'app lo dichiara."
                    : "Dutching puro a payout comune (singola finale inclusa): OGNI esito finale chiude >= 0. Chiude solo se SOMMA(1/quota) < 1: altrimenti l'app lo dichiara."
                }
              >
                  <ShieldCheck
                    className={`w-3.5 h-3.5 ${harmonized ? 'text-emerald-400' : 'text-[#64748B]'}`}
                  />
                  <span className="font-bold text-xs text-white">Armonizza (mai perdita):</span>
                  <span
                    className={`px-1.5 py-0.2 text-[10px] font-bold uppercase rounded-xs ${
                      harmonized
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-zinc-800 text-[#64748B] border border-zinc-700'
                    }`}
                  >
                    {harmonized ? 'OBBLIGO ATTIVO' : 'OFF'}
                  </span>
                </div>

              {/* F23 — budget totale ipotetico + proposta target congruo */}
              {harmonized && (
                <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#2D3139]">
                  <span className="text-[10px] text-[#64748B]">Budget €:</span>
                  <input
                    type="number"
                    step="10"
                    min="0"
                    value={budgetTot ?? ''}
                    placeholder="dutch"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setBudgetTot(Number.isFinite(v) && v > 0 ? v : null);
                      setTargetProposal(null);
                    }}
                    className="w-20 bg-[#1A1D26] border border-[#2D3139] px-2 py-0.5 text-amber-300 text-right rounded-xs font-bold font-mono text-xs"
                    title="Costo totale ipotetico I_tot (vuoto = sizing dutch classico): OGNI copertura paga budget+target"
                  />
                  <button
                    onClick={handleProposeTarget}
                    disabled={budgetTot === null || matches.length < 2}
                    className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-xs border transition-colors bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 disabled:opacity-50"
                    title="Il motore prova target +5..+60 e applica il massimo verificato (ogni ramo >= target, spesa entro budget)"
                  >
                    Proponi target
                  </button>
                  {targetProposal && (
                    <span className="text-[10px] font-mono text-amber-200">{targetProposal}</span>
                  )}
                </div>
              )}

              {/* F27 — gate pre-piazzamento: semaforo con le quote come sono ora */}
              <div className="flex flex-wrap items-center gap-2 pl-2 border-l border-[#2D3139]">
                <button
                  onClick={handleGateCheck}
                  disabled={matches.length < 2}
                  className="px-2 py-1 text-[11px] font-mono font-bold rounded-xs border transition-colors bg-sky-500/10 hover:bg-sky-500/25 text-sky-300 border-sky-500/40 disabled:opacity-50"
                  title="Riverifica la scala con le quote attuali della tabella + vincoli exchange sulla banca. VIA LIBERA solo se ogni ramo verifica: rieseguire dopo ogni modifica quote, prima di piazzare."
                >
                  🛂 Verifica pre-piazzamento
                </button>
                {gateVerdict && (
                  <span
                    className={`text-[11px] font-mono max-w-xl ${gateVerdict.ok ? 'text-emerald-300' : 'text-red-300'}`}
                  >
                    {gateVerdict.text}
                  </span>
                )}
                {onOpenPlace && (
                  <button
                    onClick={onOpenPlace}
                    disabled={matches.length < 2}
                    className="px-2 py-1 text-[11px] font-mono font-bold rounded-xs border transition-colors bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40 disabled:opacity-50"
                    title="Vai al passo 3: schede di piazzamento un ticket alla volta"
                  >
                    Vai a Piazza →
                  </button>
                )}
              </div>
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
              Inserisci squadre e orario. <strong>Modifica le quote a mano</strong> in qualsiasi
              momento se cambiano prima della partita.
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
                Seleziona il modello rilevato dal tuo bookmaker per applicare le quote a tutte le
                partite con un solo click:
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

        {/* Empty state: guida al flusso reale (F11) */}
        {matches.length === 0 && (
          <div className="p-8 border border-dashed border-[#2D3139] rounded-sm bg-[#0F1117]/60 text-center space-y-4">
            <Calendar className="w-8 h-8 text-[#3B82F6] mx-auto" />
            <div>
              <div className="text-white font-bold text-sm font-mono">
                Nessuna partita in schedina
              </div>
              <p className="text-xs text-[#94A3B8] font-mono max-w-lg mx-auto mt-1.5 leading-relaxed">
                Apri il Calendario e usa <strong className="text-blue-300">Trova Partite</strong>{' '}
                per importare eventi reali con copertura Under/Over 3.5 sopra la soglia, oppure
                carica una schedina dal pannello{' '}
                <strong className="text-blue-300">Schedine Salvate</strong> o aggiungile a mano qui
                sotto.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 font-mono text-xs flex-wrap">
              {onOpenCalendar && (
                <button
                  onClick={onOpenCalendar}
                  className="px-3 py-1.5 bg-[#3B82F6] hover:bg-blue-500 text-white rounded-xs font-bold uppercase flex items-center gap-1.5"
                >
                  <Calendar className="w-3.5 h-3.5" /> Apri Calendario
                </button>
              )}
              <button
                onClick={() => handleLoadPreset('serie_a')}
                className="px-3 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#E0E2E7] border border-[#2D3139] rounded-xs"
                title="Carica 8 partite di esempio Serie A"
              >
                Esempio: 8 Serie A
              </button>
              <button
                onClick={() => handleLoadPreset('premier')}
                className="px-3 py-1.5 bg-[#1A1D26] hover:bg-[#252A36] text-[#E0E2E7] border border-[#2D3139] rounded-xs"
                title="Carica 6 partite di esempio Premier League"
              >
                Esempio: 6 Premier
              </button>
            </div>
          </div>
        )}

        {/* Matches Table */}
        <div className={`overflow-x-auto ${matches.length === 0 ? 'hidden' : ''}`}>
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#2D3139] text-[#64748B] text-[10px] uppercase bg-[#141824]">
                <th className="p-2.5 w-12 text-center">#</th>
                <th className="p-2.5 w-36">Data - Ora</th>
                <th className="p-2.5 min-w-[200px]">Squadra Casa - Squadra Ospite</th>
                <th className="p-2.5 w-28 text-center text-emerald-400">Quota UNDER 3.5</th>
                <th className="p-2.5 w-28 text-center text-amber-400">Quota OVER 3.5</th>
                <th className="p-2.5 w-16 text-center text-violet-300">Solo 1T</th>
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
                      isOver ? 'bg-amber-950/20' : isUnder ? 'bg-emerald-950/10' : ''
                    }`}
                  >
                    {/* Order Number */}
                    <td className="p-2.5 text-center">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          isOver
                            ? 'bg-amber-500 text-black'
                            : isUnder
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-[#2A2F3D] text-white'
                        }`}
                      >
                        {match.order}
                      </span>
                    </td>

                    {/* Time Slot */}
                    <td className="p-2.5">
                      <input
                        type="text"
                        value={match.timeSlot}
                        onChange={(e) => handleUpdateMatch(match.id, 'timeSlot', e.target.value)}
                        placeholder="12-09 - 12:30"
                        title="Data e ora del kickoff: formato gg-mm - hh:mm (es. 12-09 - 12:30)"
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
                      <div className="inline-flex flex-col items-center gap-1 relative">
                        <input
                          type="number"
                          step="0.01"
                          min="1.05"
                          max="10.0"
                          value={match.underOdds}
                          onChange={(e) =>
                            handleUpdateMatch(
                              match.id,
                              'underOdds',
                              parseFloat(e.target.value) || 1.3,
                            )
                          }
                          className="w-20 text-center bg-[#1A1D26] border border-emerald-500/40 text-emerald-400 font-bold py-1 px-1.5 rounded-xs focus:border-emerald-400 focus:outline-hidden"
                        />
                        {/* F31 prenotate: book vincolato lato Under */}
                        {(match.feedBooks?.length ?? 0) > 0 || match.underBook ? (
                          <select
                            value={match.underBook ?? ''}
                            onChange={(e) => handleChangeMatchBook(match.id, 'under', e.target.value)}
                            title="Bookmaker dove piazzare l'Under (la quota segue il book)"
                            className="w-20 bg-[#1A1D26] border border-[#2D3139] text-[#94A3B8] text-[10px] font-mono rounded-xs px-1 py-0.5"
                          >
                            {!match.underBook && <option value="">book…</option>}
                            {match.underBook &&
                              !(match.feedBooks ?? []).some((b) => b.book === match.underBook) && (
                                <option value={match.underBook}>{match.underBook}</option>
                              )}
                            {(match.feedBooks ?? [])
                              .filter((b) => b.under !== null)
                              .sort((a, b) => (b.under ?? 0) - (a.under ?? 0))
                              .map((b) => (
                                <option key={b.book} value={b.book}>
                                  {b.book} @{b.under?.toFixed(2)}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </div>
                    </td>

                    {/* Over 3.5 Odds (Directly Editable) */}
                    <td className="p-2.5 text-center">
                      <div className="inline-flex flex-col items-center gap-1 relative">
                        <input
                          type="number"
                          step="0.05"
                          min="1.10"
                          max="25.0"
                          value={match.overOdds}
                          onChange={(e) =>
                            handleUpdateMatch(
                              match.id,
                              'overOdds',
                              parseFloat(e.target.value) || 3.0,
                            )
                          }
                          className="w-20 text-center bg-[#1A1D26] border border-amber-500/40 text-amber-300 font-bold py-1 px-1.5 rounded-xs focus:border-amber-400 focus:outline-hidden"
                        />
                        {/* F31 prenotate: book vincolato lato Over */}
                        {(match.feedBooks?.length ?? 0) > 0 || match.overBook ? (
                          <select
                            value={match.overBook ?? ''}
                            onChange={(e) => handleChangeMatchBook(match.id, 'over', e.target.value)}
                            title="Bookmaker dove piazzare l'Over (la quota segue il book)"
                            className="w-20 bg-[#1A1D26] border border-[#2D3139] text-[#94A3B8] text-[10px] font-mono rounded-xs px-1 py-0.5"
                          >
                            {!match.overBook && <option value="">book…</option>}
                            {match.overBook &&
                              !(match.feedBooks ?? []).some((b) => b.book === match.overBook) && (
                                <option value={match.overBook}>{match.overBook}</option>
                              )}
                            {(match.feedBooks ?? [])
                              .filter((b) => b.over !== null)
                              .sort((a, b) => (b.over ?? 0) - (a.over ?? 0))
                              .map((b) => (
                                <option key={b.book} value={b.book}>
                                  {b.book} @{b.over?.toFixed(2)}
                                </option>
                              ))}
                          </select>
                        ) : null}
                      </div>
                    </td>

                    {/* F17 — Solo Primo Tempo toggle */}
                    <td className="p-2.5 text-center">
                      <button
                        onClick={() =>
                          handleUpdateMatch(match.id, 'firstHalfOnly', !match.firstHalfOnly)
                        }
                        className={`px-1.5 py-1 rounded-xs border font-bold text-[10px] font-mono transition-colors ${
                          match.firstHalfOnly
                            ? 'bg-violet-500/20 text-violet-300 border-violet-500/50'
                            : 'bg-[#1A1D26] text-[#64748B] border-[#2D3139] hover:text-white'
                        }`}
                        title={
                          match.firstHalfOnly
                            ? 'Questa partita entra SOLO sul mercato del primo tempo: le sue gambe usano le quote 1T che inserisci nei campi Under/Over. Click per tornare al mercato integrale.'
                            : 'Inserisci questa partita SOLO sul primo tempo (Under/Over 3.5 1T): poi aggiorna a mano le quote nei campi Under/Over con quelle del 1T.'
                        }
                      >
                        {match.firstHalfOnly ? '1T ✓' : '1T'}
                      </button>
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
              Piazzamento sequenziale: gioca ogni copertura solo 15 minuti prima del rispettivo
              match.
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
              if (filterType === 'mother') {
                return slip.type === 'MOTHER';
              }
              if (filterType === 'active_only') {
                return slip.status === 'ACTIVE' || slip.status === 'WON';
              }
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
                      <span
                        className={`px-2 py-0.5 rounded-xs font-mono font-bold text-xs uppercase ${
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
                        }`}
                      >
                        {slip.code}
                      </span>
                      <div>
                        <h4 className="text-white font-bold text-xs font-mono">{slip.title}</h4>
                        <div className="text-[10px] text-[#64748B] font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#64748B]" />
                          {slip.timing}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-bold uppercase ${
                          isWon
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : isActive
                              ? 'bg-blue-950 text-blue-300 border border-blue-500/40'
                              : isLost
                                ? 'bg-zinc-900 text-zinc-500'
                                : 'bg-[#1A1D26] text-[#64748B]'
                        }`}
                      >
                        {isWon
                          ? 'VINTA'
                          : isActive
                            ? 'DA PIAZZARE'
                            : isLost
                              ? 'SUPERATA'
                              : 'IN ATTESA'}
                      </span>

                      {/* F31 prenotate: dove piazzare il ticket */}
                      {(() => {
                        const bi = getSlipBook(slip);
                        if (bi.books.length === 0) {
                          return null;
                        }
                        return (
                          <span
                            title={
                              bi.mixed
                                ? `Gambe su più book (${bi.books.join(', ')}): la regola vuole un ticket = un solo book — verifica prima di piazzare`
                                : `Ticket prenotato su ${bi.single}`
                            }
                            className={`text-[10px] font-mono px-2 py-0.5 rounded-xs font-bold uppercase border ${
                              bi.mixed
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                            }`}
                          >
                            {bi.mixed ? `MISTO: ${bi.books.join('+')}` : `Su ${bi.single}`}
                          </span>
                        );
                      })()}

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
                          item.market.startsWith('OVER')
                            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                            : item.market.startsWith('BOOSTER')
                              ? 'bg-blue-500/10 border border-blue-500/30 text-blue-200'
                              : item.market.startsWith('LAY')
                                ? 'bg-violet-500/10 border border-violet-500/30 text-violet-200'
                                : 'bg-[#141824] border border-[#20242C] text-[#E0E2E7]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[10px] text-[#64748B]">#{item.matchOrder}</span>
                          <span className="font-medium truncate">
                            {item.homeTeam} - {item.awayTeam}
                          </span>
                          <span
                            className={`text-[10px] px-1 py-0.2 rounded-xs font-bold ${
                              item.market.startsWith('OVER')
                                ? 'bg-amber-500/20 text-amber-300'
                                : item.market.startsWith('BOOSTER')
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : item.market.startsWith('LAY')
                                    ? 'bg-violet-500/20 text-violet-300'
                                    : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {item.market}
                          </span>
                          {item.timeSlot && (
                            <span className="text-[9px] text-[#64748B] shrink-0 font-mono">
                              {item.timeSlot}
                            </span>
                          )}
                          {item.book && (
                            <span
                              className="text-[9px] px-1 py-0.2 rounded-xs font-bold shrink-0 bg-sky-500/15 text-sky-300 border border-sky-500/30"
                              title={`Prenotata su ${item.book}`}
                            >
                              {item.book}
                            </span>
                          )}
                        </div>
                        <span className="font-bold shrink-0 ml-2">{item.odds.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Financial Metrics Strip */}
                  <div className="bg-[#141824] border border-[#20242C] p-2.5 rounded-xs grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">
                        Quota Finale
                      </span>
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
                      <span className="text-[9px] text-[#64748B] uppercase block">
                        {slip.type === 'FINAL_LAY' ? 'Banca (Stake Puntatore)' : 'Puntata (€0.50)'}
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          slip.type === 'FINAL_LAY' ? 'text-violet-300' : 'text-[#3B82F6]'
                        }`}
                      >
                        €{slip.stake.toFixed(2)}
                      </span>
                      {slip.type === 'FINAL_LAY' && (
                        <span className="text-[9px] text-orange-400 block">
                          responsabilità €{(slip.liability ?? 0).toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">
                        {slip.type === 'FINAL_LAY' ? 'Utile se Over (netto comm.)' : 'Vincita Lorda'}
                      </span>
                      <span className="text-white font-bold">
                        €{slip.potentialGrossPayout.toFixed(2)}
                      </span>
                      {slip.type === 'FINAL_LAY' && (
                        <span className="text-[9px] text-[#64748B] block">
                          commissioni {(slip.commissionPct ?? 0).toFixed(1)}% già detratte
                        </span>
                      )}
                    </div>

                    <div>
                      <span className="text-[9px] text-[#64748B] uppercase block">
                        Netto Finale se Vince
                      </span>
                      <span
                        className={`font-bold text-sm ${
                          slip.realizedNetIfWon >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {slip.realizedNetIfWon >= 0 ? '+' : '-'}€
                        {Math.abs(slip.realizedNetIfWon).toFixed(2)}
                      </span>
                      <span className="text-[9px] text-[#64748B] block">
                        incl. tutte le puntate (target {fmtGain(slip.targetProfit)})
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
