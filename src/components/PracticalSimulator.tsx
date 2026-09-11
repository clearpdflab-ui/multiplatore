import React, { useState, useMemo } from 'react';
import {
  ModelParameters,
  calculateSteps,
  evaluateScenario,
  BOOKMAKER_MODELS,
  calculateBookmakerAggio,
} from '../utils/mathEngine';
import { CalculationModel } from '../types';
import { GeometricVisualizer } from './GeometricVisualizer';
import { SequentialRelayLadder } from './SequentialRelayLadder';
import { AsymmetricStrategyGuide } from './AsymmetricStrategyGuide';
import { Sliders, Clock, TrendingUp, AlertTriangle, CheckCircle2, RotateCcw, Scale, Sparkles } from 'lucide-react';

export const PracticalSimulator: React.FC = () => {
  const [subMode, setSubMode] = useState<'sequential_relay' | 'asymmetric_strategy' | 'stress_test'>('sequential_relay');

  // Configurable Parameters (defaulting to 8 matches as user specified)
  const [params, setParams] = useState<ModelParameters>({
    totalEvents: 8,
    baseStake: 20,
    underOdds: 1.32,
    overOdds: 3.0,
    targetProfit: 45,
    model: 'real_product',
    finalSingleOdds: 2.75,
    asymmetricMode: 'flat',
  });

  // Match outcomes for stress-test simulation
  const [matchOutcomes, setMatchOutcomes] = useState<('UNDER' | 'OVER')[]>(() =>
    Array(params.totalEvents).fill('UNDER')
  );

  // Update outcomes array when totalEvents changes
  const handleEventCountChange = (newCount: number) => {
    const clamped = Math.max(3, Math.min(30, newCount));
    setParams((prev) => ({ ...prev, totalEvents: clamped }));
    setMatchOutcomes(Array(clamped).fill('UNDER'));
  };

  // Steps calculated dynamically
  const calculatedSteps = useMemo(() => {
    return calculateSteps(params);
  }, [params]);

  // Base bet total odds
  const baseOdds = useMemo(() => {
    if (params.model === 'original_sum') {
      return Number((params.totalEvents * params.underOdds).toFixed(2));
    }
    return Number(Math.pow(params.underOdds, params.totalEvents).toFixed(3));
  }, [params.totalEvents, params.underOdds, params.model]);

  // Base ticket win
  const baseWin = Number((params.baseStake * baseOdds).toFixed(2));

  // Simulation outcome
  const scenarioResult = useMemo(() => {
    return evaluateScenario(matchOutcomes, calculatedSteps, params.baseStake, baseOdds);
  }, [matchOutcomes, calculatedSteps, params.baseStake, baseOdds]);

  // Outcome toggle
  const toggleMatch = (index: number) => {
    setMatchOutcomes((prev) => {
      const next = [...prev];
      next[index] = next[index] === 'UNDER' ? 'OVER' : 'UNDER';
      return next;
    });
  };

  // Presets
  const applyPreset = (type: 'all_under' | 'one_error' | 'two_errors' | 'three_errors') => {
    if (type === 'all_under') {
      setMatchOutcomes(Array(params.totalEvents).fill('UNDER'));
    } else if (type === 'one_error') {
      const arr: ('UNDER' | 'OVER')[] = Array(params.totalEvents).fill('UNDER');
      arr[0] = 'OVER';
      setMatchOutcomes(arr);
    } else if (type === 'two_errors') {
      const arr: ('UNDER' | 'OVER')[] = Array(params.totalEvents).fill('UNDER');
      arr[0] = 'OVER';
      arr[2] = 'OVER';
      setMatchOutcomes(arr);
    } else if (type === 'three_errors') {
      const arr: ('UNDER' | 'OVER')[] = Array(params.totalEvents).fill('UNDER');
      arr[0] = 'OVER';
      arr[1] = 'OVER';
      arr[4] = 'OVER';
      setMatchOutcomes(arr);
    }
  };

  const totalSimCost = params.baseStake + calculatedSteps.reduce((acc, s) => acc + s.stake, 0);

  return (
    <div className="space-y-6">
      {/* Top Selector: Sequential 2h Relay Mode vs Geometric Stress Test */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0F1117] border border-[#2D3139] p-3 rounded-sm">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#64748B] uppercase">Modalità Visualizzazione:</span>
        </div>
        <div className="flex bg-[#1A1D26] border border-[#2D3139] rounded-xs p-1 text-xs font-mono w-full sm:w-auto">
          <button
            onClick={() => setSubMode('sequential_relay')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              subMode === 'sequential_relay'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Relay Sequenziale a 2 Ore (Dinamico)</span>
          </button>
          <button
            onClick={() => setSubMode('asymmetric_strategy')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              subMode === 'asymmetric_strategy'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span>Sbilanciamento Iniziale &amp; Guida Schedine</span>
          </button>
          <button
            onClick={() => setSubMode('stress_test')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              subMode === 'stress_test'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Curva Geometrica &amp; Stress Test</span>
          </button>
        </div>
      </div>

      {/* Parameters Bar */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-[#2D3139]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#3B82F6]" />
            <h2 className="text-xs uppercase tracking-widest text-white font-bold font-mono">
              Parametri Quote &amp; Capitale
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#64748B] font-mono">Formula Moltiplicatore:</span>
            <div className="flex bg-[#1A1D26] border border-[#2D3139] rounded-xs p-0.5 text-xs font-mono">
              <button
                onClick={() => setParams((p) => ({ ...p, model: 'original_sum' }))}
                className={`px-2.5 py-1 rounded-xs transition-colors ${
                  params.model === 'original_sum'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 font-bold'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                Somma (Foglio CSV)
              </button>
              <button
                onClick={() => setParams((p) => ({ ...p, model: 'real_product' }))}
                className={`px-2.5 py-1 rounded-xs transition-colors ${
                  params.model === 'real_product'
                    ? 'bg-[#3B82F6] text-white font-bold'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                Prodotto Reale (Corretto)
              </button>
            </div>
          </div>
        </div>

        {/* Input sliders & fields */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 font-mono">
              Eventi Totali
            </label>
            <div className="flex items-center justify-between">
              <input
                type="number"
                min="3"
                max="30"
                value={params.totalEvents}
                onChange={(e) => handleEventCountChange(parseInt(e.target.value) || 3)}
                className="w-16 bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
              />
              <span className="text-xs font-mono text-[#64748B]">partite</span>
            </div>
          </div>

          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 font-mono">
              Quota Under 3.5
            </label>
            <input
              type="number"
              step="0.01"
              value={params.underOdds}
              onChange={(e) => setParams((p) => ({ ...p, underOdds: parseFloat(e.target.value) || 1.01 }))}
              className="w-full bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
            />
          </div>

          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 font-mono">
              Quota Over 3.5
            </label>
            <input
              type="number"
              step="0.05"
              value={params.overOdds}
              onChange={(e) => setParams((p) => ({ ...p, overOdds: parseFloat(e.target.value) || 1.1 }))}
              className="w-full bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
            />
          </div>

          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 font-mono">
              Quota Singola Finale
            </label>
            <input
              type="number"
              step="0.05"
              value={params.finalSingleOdds}
              onChange={(e) => setParams((p) => ({ ...p, finalSingleOdds: parseFloat(e.target.value) || 2.5 }))}
              className="w-full bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
            />
          </div>

          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] font-mono">
                Puntata Iniziale
              </label>
              <span className="text-[9px] font-mono text-emerald-400 font-bold">Step €0.50</span>
            </div>
            <div className="flex items-center">
              <span className="text-xs text-[#64748B] font-mono mr-1">€</span>
              <input
                type="number"
                step="0.5"
                value={params.baseStake}
                onChange={(e) => setParams((p) => ({ ...p, baseStake: parseFloat(e.target.value) || 1 }))}
                className="w-full bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
              />
            </div>
          </div>

          <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
            <label className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 font-mono">
              Target Utile Netto
            </label>
            <div className="flex items-center">
              <span className="text-xs text-[#64748B] font-mono mr-1">€</span>
              <input
                type="number"
                step="5"
                value={params.targetProfit}
                onChange={(e) => setParams((p) => ({ ...p, targetProfit: parseFloat(e.target.value) || 5 }))}
                className="w-full bg-[#0F1117] border border-[#2D3139] text-white font-mono text-base px-2 py-1 rounded-xs"
              />
            </div>
          </div>
        </div>

        {/* Bookmaker Presets: 1.32/3.00 and 1.30/3.15 */}
        <div className="mt-3 pt-3 border-t border-[#2D3139] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[#94A3B8]">Modello Aggio Book:</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    underOdds: 1.32,
                    overOdds: 3.00,
                    finalSingleOdds: 2.75,
                    bookmakerModel: '132_300',
                  }))
                }
                className={`px-2.5 py-1 rounded-xs border transition-colors ${
                  params.underOdds === 1.32 && params.overOdds === 3.0
                    ? 'bg-[#3B82F6] text-white border-[#3B82F6] font-bold'
                    : 'bg-[#1A1D26] text-[#E0E2E7] border-[#2D3139] hover:bg-[#252A36]'
                }`}
              >
                1.32 / 3.00 (Aggio 9.09%)
              </button>
              <button
                onClick={() =>
                  setParams((p) => ({
                    ...p,
                    underOdds: 1.30,
                    overOdds: 3.15,
                    finalSingleOdds: 2.85,
                    bookmakerModel: '130_315',
                  }))
                }
                className={`px-2.5 py-1 rounded-xs border transition-colors ${
                  params.underOdds === 1.30 && params.overOdds === 3.15
                    ? 'bg-[#3B82F6] text-white border-[#3B82F6] font-bold'
                    : 'bg-[#1A1D26] text-[#E0E2E7] border-[#2D3139] hover:bg-[#252A36]'
                }`}
              >
                1.30 / 3.15 (Aggio 8.67%)
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#94A3B8]">
            <span>Aggio Rilevato:</span>
            <span className="text-white font-bold px-1.5 py-0.5 bg-[#141824] border border-[#2D3139] rounded-xs text-emerald-400">
              {calculateBookmakerAggio(params.underOdds, params.overOdds).aggioPercent}%
            </span>
            <span>
              (Payout: {calculateBookmakerAggio(params.underOdds, params.overOdds).payoutPercent}%, Fair U: {calculateBookmakerAggio(params.underOdds, params.overOdds).fairUnderProb}%)
            </span>
          </div>
        </div>

        {/* Strategy Curve & Boost 1.10 Toggle Strip */}
        <div className="mt-3 pt-3 border-t border-[#2D3139] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-[#94A3B8]">Curva Utile:</span>
            <select
              value={params.asymmetricMode || 'flat'}
              onChange={(e) => setParams((p) => ({ ...p, asymmetricMode: e.target.value as any }))}
              className="bg-[#1A1D26] border border-[#2D3139] text-white px-2.5 py-1 rounded-xs font-bold"
            >
              <option value="front_loaded">Sbilanciata (Consigliata)</option>
              <option value="capital_preservation">Salva Capitale (0€ Finale)</option>
              <option value="flat">Simmetrica (Flat)</option>
            </select>
          </div>

          {/* Boost 1.10 Toggle */}
          <div className="flex items-center gap-2.5 px-2.5 py-1 bg-[#141824] border border-[#2D3139] rounded-xs">
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(params.enableBooster)}
              onClick={() => setParams((p) => ({ ...p, enableBooster: !p.enableBooster, boosterOdds: p.boosterOdds || 1.10 }))}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                params.enableBooster ? 'bg-emerald-500' : 'bg-zinc-700'
              }`}
              title={params.enableBooster ? 'Disattiva Boost 1.10' : 'Attiva Boost 1.10'}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  params.enableBooster ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>

            <div
              className="flex items-center gap-1.5 select-none cursor-pointer"
              onClick={() => setParams((p) => ({ ...p, enableBooster: !p.enableBooster, boosterOdds: p.boosterOdds || 1.10 }))}
            >
              <Sparkles className={`w-3.5 h-3.5 ${params.enableBooster ? 'text-emerald-400 animate-pulse' : 'text-[#64748B]'}`} />
              <span className="font-bold text-xs text-white">Boost 1.10:</span>
              <span
                className={`px-1.5 py-0.2 text-[10px] font-bold uppercase rounded-xs ${
                  params.enableBooster
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'bg-zinc-800 text-[#64748B] border border-zinc-700'
                }`}
              >
                {params.enableBooster ? 'SI (ATTIVO)' : 'NO (DISATTIVO)'}
              </span>
            </div>

            {params.enableBooster && (
              <div className="flex items-center gap-1 pl-2 border-l border-[#2D3139]">
                <span className="text-[10px] text-[#64748B]">Quota:</span>
                {[1.08, 1.10, 1.15].map((q) => (
                  <button
                    key={q}
                    onClick={() => setParams((p) => ({ ...p, boosterOdds: q }))}
                    className={`px-1.5 py-0.5 text-[10px] font-mono rounded-xs border transition-colors ${
                      (params.boosterOdds || 1.10) === q
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

      {/* Render Selected Mode */}
      {subMode === 'sequential_relay' ? (
        <SequentialRelayLadder params={params} onParamsChange={setParams} />
      ) : subMode === 'asymmetric_strategy' ? (
        <AsymmetricStrategyGuide params={params} onParamsChange={setParams} />
      ) : (
        <>
          {/* Main Grid: Visual Curve + Stress Test Scenario */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Visualizer Canvas */}
            <div className="lg:col-span-6 bg-[#0F1117] border border-[#2D3139] rounded-sm min-h-[380px] flex flex-col">
              <GeometricVisualizer
                steps={calculatedSteps}
                baseStake={params.baseStake}
                baseWin={baseWin}
              />
            </div>

            {/* Stress Test Simulator */}
            <div className="lg:col-span-6 bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-[#3B82F6] font-mono font-bold">
                      Simulatore Live Pre-Match
                    </span>
                    <h3 className="text-sm font-bold text-white mt-0.5">
                      Stress-Test: Testa gli esiti simultanei
                    </h3>
                  </div>

                  {/* Presets */}
                  <div className="flex gap-1.5 text-[10px] font-mono">
                    <button
                      onClick={() => applyPreset('all_under')}
                      className="px-2 py-1 bg-[#1A1D26] hover:bg-[#202430] text-emerald-400 border border-[#2D3139] rounded-xs"
                    >
                      0 Over
                    </button>
                    <button
                      onClick={() => applyPreset('one_error')}
                      className="px-2 py-1 bg-[#1A1D26] hover:bg-[#202430] text-[#3B82F6] border border-[#2D3139] rounded-xs"
                    >
                      1 Over
                    </button>
                    <button
                      onClick={() => applyPreset('two_errors')}
                      className="px-2 py-1 bg-[#1A1D26] hover:bg-[#202430] text-red-400 border border-red-500/40 rounded-xs"
                    >
                      2 Over (Crash)
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#94A3B8] mb-3">
                  Clicca sui riquadri per commutare il risultato tra <span className="text-emerald-400 font-mono">UNDER 3.5</span> e <span className="text-red-400 font-mono">OVER 3.5</span>:
                </p>

                {/* Match Grid Selector */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-4">
                  {matchOutcomes.map((outcome, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleMatch(idx)}
                      className={`p-2.5 rounded-xs border text-center transition-all font-mono ${
                        outcome === 'UNDER'
                          ? 'bg-[#1A1D26] border-[#2D3139] text-[#E0E2E7] hover:border-[#3B82F6]'
                          : 'bg-red-950/30 border-red-500 text-red-400 shadow-sm shadow-red-500/20'
                      }`}
                    >
                      <div className="text-[10px] text-[#64748B]">M #{idx + 1}</div>
                      <div className="text-xs font-bold mt-0.5">
                        {outcome === 'UNDER' ? 'Under 3.5' : 'Over 3.5'}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Real-Time Outcome Diagnosis Box */}
                <div
                  className={`p-4 border rounded-xs font-mono text-xs ${
                    scenarioResult.status === 'WIN_BASE'
                      ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-300'
                      : scenarioResult.status === 'WIN_COVERAGE'
                      ? 'bg-blue-950/20 border-[#3B82F6]/50 text-blue-300'
                      : 'bg-red-950/30 border-red-500/50 text-red-300'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1.5">
                    <span className="flex items-center gap-1.5">
                      {scenarioResult.status === 'CATASTROPHIC_LOSS' ? (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                      {scenarioResult.winningTicket}
                    </span>
                    <span
                      className={`text-sm ${
                        scenarioResult.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {scenarioResult.netProfit >= 0 ? '+' : ''}€{scenarioResult.netProfit.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-[11px] opacity-90 leading-relaxed font-sans">
                    {scenarioResult.description}
                  </p>
                </div>
              </div>

              {/* Bottom Financial Metrics for this Scenario */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#2D3139] text-center font-mono">
                <div className="p-2 bg-[#1A1D26] rounded-xs border border-[#2D3139]">
                  <div className="text-[9px] text-[#64748B] uppercase">Capitale Impegnato</div>
                  <div className="text-xs font-bold text-white">€{scenarioResult.totalCost.toFixed(2)}</div>
                </div>
                <div className="p-2 bg-[#1A1D26] rounded-xs border border-[#2D3139]">
                  <div className="text-[9px] text-[#64748B] uppercase">Incasso Lordo</div>
                  <div className="text-xs font-bold text-white">€{scenarioResult.grossWin.toFixed(2)}</div>
                </div>
                <div className="p-2 bg-[#1A1D26] rounded-xs border border-[#2D3139]">
                  <div className="text-[9px] text-[#64748B] uppercase">Bilancio Netto</div>
                  <div
                    className={`text-xs font-bold ${
                      scenarioResult.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {scenarioResult.netProfit >= 0 ? '+' : ''}€{scenarioResult.netProfit.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Generated Ladder Table */}
          <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-[#64748B] font-mono">
                  Tabella Delle Multiple a Scalare Calcolate
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Piano di Copertura Completo ({params.totalEvents - 1} Coperture + 1 Singola Finale)
                </h3>
              </div>
              <div className="text-xs font-mono text-[#3B82F6]">
                Capitale Totale: €{totalSimCost.toFixed(2)}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono border-collapse">
                <thead>
                  <tr className="border-b border-[#2D3139] text-[#64748B]">
                    <th className="py-2.5 px-3 font-normal">Schedina</th>
                    <th className="py-2.5 px-3 font-normal">Composizione</th>
                    <th className="py-2.5 px-3 font-normal">Formula Quota</th>
                    <th className="py-2.5 px-3 font-normal">Quota Totale</th>
                    <th className="py-2.5 px-3 font-normal">Puntata Calcolata</th>
                    <th className="py-2.5 px-3 font-normal">Costo Cumulato</th>
                    <th className="py-2.5 px-3 font-normal">Vincita Potenziale</th>
                    <th className="py-2.5 px-3 font-normal text-right">Utile Netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2D3139]/50">
                  <tr className="bg-[#1A1D26]/40 hover:bg-[#1A1D26]">
                    <td className="py-2.5 px-3 font-bold text-white">Multipla Base</td>
                    <td className="py-2.5 px-3 text-[#94A3B8]">{params.totalEvents} Under 3.5</td>
                    <td className="py-2.5 px-3 text-[#64748B]">
                      {params.model === 'original_sum'
                        ? `${params.totalEvents} × ${params.underOdds}`
                        : `(${params.underOdds})^${params.totalEvents} [+26.2% bonus]`}
                    </td>
                    <td className="py-2.5 px-3 text-white font-bold">{baseOdds}</td>
                    <td className="py-2.5 px-3 text-white">€{params.baseStake.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-[#94A3B8]">€{params.baseStake.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-white">€{baseWin}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                      +€{(baseWin - totalSimCost).toFixed(2)}
                    </td>
                  </tr>
                  {calculatedSteps.map((step) => (
                    <tr key={step.step} className="hover:bg-[#1A1D26] transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">{step.name}</td>
                      <td className="py-2.5 px-3 text-[#94A3B8]">{step.eventDescription}</td>
                      <td className="py-2.5 px-3 text-[#64748B] text-[11px]">
                        {step.oddsFormulaText}
                      </td>
                      <td className="py-2.5 px-3 text-white font-semibold">
                        {step.calculatedOdds.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-[#3B82F6] font-bold">€{step.stake.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-[#94A3B8]">€{step.cumulativeCost.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-white">€{step.grossWin.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-bold">
                        +€{step.netProfit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

