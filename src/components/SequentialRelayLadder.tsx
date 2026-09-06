import React, { useState, useMemo } from 'react';
import { ModelParameters, buildSequentialTimeline, getBonusPercentage } from '../utils/mathEngine';
import { Clock, ArrowRight, CheckCircle2, RotateCcw, Play, AlertCircle, Shield, Award, Sparkles } from 'lucide-react';

interface SequentialRelayLadderProps {
  params: ModelParameters;
  onParamsChange?: (newParams: ModelParameters) => void;
}

export const SequentialRelayLadder: React.FC<SequentialRelayLadderProps> = ({ params, onParamsChange }) => {
  // Outcomes array for sequential matches
  const [matchOutcomes, setMatchOutcomes] = useState<('UNDER' | 'OVER' | 'PENDING')[]>(() =>
    Array(params.totalEvents).fill('PENDING')
  );

  // Active step in interactive manual walk-through
  const currentActiveIndex = matchOutcomes.findIndex((o) => o === 'PENDING');
  const allFinished = currentActiveIndex === -1;

  // Build timeline based on current state
  const simulation = useMemo(() => {
    return buildSequentialTimeline(params, matchOutcomes);
  }, [params, matchOutcomes]);

  const setStepOutcome = (index: number, outcome: 'UNDER' | 'OVER') => {
    setMatchOutcomes((prev) => {
      const next = [...prev];
      next[index] = outcome;
      return next;
    });
  };

  const resetSimulation = () => {
    setMatchOutcomes(Array(params.totalEvents).fill('PENDING'));
  };

  const applyPresetScenario = (scenario: 'clean_all_under' | 'over_match_1' | 'over_match_4' | 'final_single_over') => {
    const arr: ('UNDER' | 'OVER' | 'PENDING')[] = Array(params.totalEvents).fill('UNDER');
    if (scenario === 'clean_all_under') {
      // all under
    } else if (scenario === 'over_match_1') {
      arr[0] = 'OVER';
    } else if (scenario === 'over_match_4') {
      if (arr.length >= 4) arr[3] = 'OVER';
    } else if (scenario === 'final_single_over') {
      arr[params.totalEvents - 1] = 'OVER';
    }
    setMatchOutcomes(arr);
  };

  return (
    <div className="space-y-6">
      {/* Informational Header on User Specifications */}
      <div className="bg-[#1A1D26] border border-[#2D3139] p-5 rounded-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/40 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xs">
                Architettura a Scalare Sequenziale
              </span>
              <span className="text-xs text-[#94A3B8] font-mono">Cadenza: 2 Ore tra le Partite</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Relay Dinamico a Sostituzione & Singola Finale
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 max-w-3xl leading-relaxed">
              Le coperture <strong className="text-white">non vengono piazzate tutte insieme</strong>, ma una alla volta ogni 2 ore, solo dopo aver conosciuto l&apos;esito del match precedente. Se un match termina Over, la copertura subentra come nuova schedina madre attiva e continua a essere protetta fino alla <strong className="text-emerald-400">singola finale</strong>.
            </p>
          </div>

          {/* Bonus Rule Pill (Point 3 from user) */}
          <div className="bg-[#0F1117] border border-[#2D3139] p-3 rounded-xs text-left shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 mb-1">
              <Award className="w-4 h-4" />
              <span>Regola Bonus Multipla</span>
            </div>
            <div className="text-[11px] font-mono text-[#94A3B8] space-y-0.5">
              <div>≥ 8 Eventi: <span className="text-emerald-400 font-bold">+26.2%</span></div>
              <div>5, 6, 7 Eventi: <span className="text-[#3B82F6] font-bold">+6% / +12% / +18%</span></div>
              <div>&lt; 5 Eventi: <span className="text-red-400 font-bold">0% Bonus (Nessun Bonus)</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Control & Status Bar */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-4 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#3B82F6]" />
          <span className="text-xs font-mono text-white font-bold">
            Stato Attuale Schedina Madre:
          </span>
          <span className="text-xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-xs">
            {simulation.currentActiveTicketDesc}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
          <span className="text-[11px] text-[#64748B]">Scenari Rapidi:</span>
          <button
            onClick={() => applyPresetScenario('clean_all_under')}
            className="px-2.5 py-1 bg-[#1A1D26] hover:bg-[#252A36] text-[#E0E2E7] border border-[#2D3139] rounded-xs"
          >
            Tutti Under (Base)
          </button>
          <button
            onClick={() => applyPresetScenario('over_match_1')}
            className="px-2.5 py-1 bg-[#1A1D26] hover:bg-[#252A36] text-[#3B82F6] border border-[#2D3139] rounded-xs"
          >
            Over Match 1 (Subentro)
          </button>
          <button
            onClick={() => applyPresetScenario('final_single_over')}
            className="px-2.5 py-1 bg-[#1A1D26] hover:bg-[#252A36] text-amber-400 border border-[#2D3139] rounded-xs"
          >
            Vince Singola Finale
          </button>
          <button
            onClick={resetSimulation}
            className="px-2.5 py-1 bg-red-950/30 hover:bg-red-900/40 text-red-400 border border-red-500/40 rounded-xs flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      </div>

      {/* User Optimization: Booster Quota 1.10 Interactive Module */}
      <div className="bg-[#141824] border border-[#3B82F6]/40 p-4 rounded-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-[#3B82F6] text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-xs">
                Ottimizzazione Strategica
              </span>
              <span className="text-xs font-mono font-bold text-white">
                Booster Quota Bassa (es. 1.10) per Abbassare lo Stake &amp; Sbloccare il Bonus
              </span>
            </div>
            <p className="text-xs text-[#94A3B8] leading-relaxed max-w-2xl">
              Aggiungendo un evento a quota minima (es. 1.10 tipo 1X o Over 0.5) quando gli eventi calano, la quota finale sale, <strong className="text-emerald-400">abbattendo lo stake richiesto</strong> e permettendo a 4 eventi di diventare 5 per <strong className="text-[#3B82F6]">riattivare il bonus multipla (+6%)</strong>!
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Toggle Booster Switch */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(params.enableBooster)}
                onClick={() => {
                  if (onParamsChange) {
                    onParamsChange({
                      ...params,
                      enableBooster: !params.enableBooster,
                      boosterOdds: params.boosterOdds || 1.10,
                    });
                  }
                }}
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
                onClick={() => {
                  if (onParamsChange) {
                    onParamsChange({
                      ...params,
                      enableBooster: !params.enableBooster,
                      boosterOdds: params.boosterOdds || 1.10,
                    });
                  }
                }}
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
                  {params.enableBooster ? 'ATTIVO' : 'DISATTIVO'}
                </span>
              </div>
            </div>

            {/* Config Booster Odds */}
            {params.enableBooster && (
              <div className="flex items-center gap-1.5 bg-[#0F1117] border border-[#2D3139] p-1.5 rounded-xs text-xs font-mono">
                <span className="text-[11px] text-[#64748B] pl-1">Quota:</span>
                {[1.08, 1.10, 1.15].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      if (onParamsChange) {
                        onParamsChange({
                          ...params,
                          boosterOdds: q,
                        });
                      }
                    }}
                    className={`px-2 py-0.5 rounded-xs transition-colors ${
                      (params.boosterOdds || 1.10) === q
                        ? 'bg-[#3B82F6] text-white font-bold'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {q.toFixed(2)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Impact Preview */}
        {params.enableBooster && (
          <div className="mt-3 pt-3 border-t border-[#2D3139] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
              <div className="text-[10px] text-[#64748B] uppercase">Vantaggio 1: Singola Finale</div>
              <div className="text-white font-bold mt-0.5">
                Quota sale da {params.finalSingleOdds?.toFixed(2) || '2.75'} a{' '}
                <span className="text-emerald-400 font-bold">
                  {((params.finalSingleOdds || 2.75) * (params.boosterOdds || 1.10)).toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-emerald-400/90 mt-0.5">
                Stake finale ridotto del ~15% - 20%
              </div>
            </div>

            <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
              <div className="text-[10px] text-[#64748B] uppercase">Vantaggio 2: Recupero Bonus Multipla</div>
              <div className="text-white font-bold mt-0.5">
                Step 5 (4 ev.) + 1 Booster = <span className="text-[#3B82F6]">5 Eventi (+6% Bonus)</span>
              </div>
              <div className="text-[11px] text-[#94A3B8] mt-0.5">
                Elimina il salto a 0% bonus sullo Step 5
              </div>
            </div>

            <div className="p-2.5 bg-red-950/20 border border-red-500/30 rounded-xs">
              <div className="text-[10px] text-red-400 uppercase font-semibold">⚠️ Controindicazione Matematica</div>
              <div className="text-red-300 font-bold mt-0.5">
                Rischio Fallimento Booster: ~9.1%
              </div>
              <div className="text-[11px] text-red-400/80 mt-0.5">
                Se l&apos;evento a 1.10 salta, perdi l&apos;intera copertura!
              </div>
            </div>
          </div>
        )}
      </div>

      {/* The 2-Hour Timeline Ladder */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-widest text-[#94A3B8] font-mono font-bold flex items-center gap-2">
            <span>Sequenza Oraria Partite (+2 Ore ad ogni Step)</span>
          </h3>
          <span className="text-xs font-mono text-[#64748B]">
            Capitale Progressivo Attualmente Impegnato: <strong className="text-white">€{simulation.totalSpentSoFar.toFixed(2)}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {simulation.timeline.map((step, idx) => {
            const isCurrentPending = !allFinished && idx === currentActiveIndex;
            const isPast = step.matchOutcome !== 'PENDING';
            const isSingleFinal = step.step === params.totalEvents;

            return (
              <div
                key={step.step}
                className={`border rounded-xs p-4 transition-all ${
                  isCurrentPending
                    ? 'bg-[#141824] border-[#3B82F6] shadow-sm shadow-[#3B82F6]/10'
                    : isPast
                    ? 'bg-[#0F1117] border-[#2D3139]'
                    : 'bg-[#0A0B10] border-[#20242C] opacity-75'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Left Column: Time & Event Info */}
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-center justify-center w-14 h-14 bg-[#1A1D26] border border-[#2D3139] rounded-xs text-center font-mono">
                      <span className="text-[10px] text-[#64748B]">ORE</span>
                      <span className="text-xs font-bold text-white">{step.timeSlot}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white font-mono">
                          Step {step.step} &bull; {step.matchLabel}
                        </span>
                        {isSingleFinal ? (
                          <span className="text-[10px] font-mono px-2 py-0.2 bg-purple-950/40 text-purple-300 border border-purple-500/40 rounded-xs font-bold">
                            SINGOLA FINALE DI CHIUSURA
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#1A1D26] text-[#94A3B8] border border-[#2D3139] rounded-xs">
                            {step.eventsInCoverage} Eventi
                          </span>
                        )}

                        {/* Booster Badge */}
                        {step.hasBooster && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/40 rounded-xs font-bold">
                            + Booster {(params.boosterOdds || 1.10).toFixed(2)}
                          </span>
                        )}

                        {/* Bonus Tag */}
                        {step.bonusPercentage > 0 ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-emerald-950/40 text-emerald-400 border border-emerald-500/30 rounded-xs flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> +{step.bonusPercentage}% Bonus
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded-xs">
                            0% Bonus (&lt; 5 eventi)
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#94A3B8] font-mono mb-1">
                        <strong className="text-[#E0E2E7]">Copertura:</strong> {step.coverageTicketDesc}
                      </p>

                      <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#64748B]">
                        <span>Quota Reale: <strong className="text-white">{step.rawOdds.toFixed(2)}</strong></span>
                        <span>Quota Finale + Bonus: <strong className="text-emerald-400">{step.finalOddsWithBonus.toFixed(2)}</strong></span>
                        <span>Target Utile: <strong className="text-amber-400">€{(step.stepTargetProfit ?? params.targetProfit).toFixed(2)}</strong></span>
                        <span>Puntata Calcolata: <strong className="text-[#3B82F6]">€{step.stake.toFixed(2)}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Active State or Result */}
                  <div className="flex items-center gap-3 self-end lg:self-center">
                    {step.matchOutcome === 'PENDING' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[#64748B] hidden sm:inline">
                          Imposta Risultato:
                        </span>
                        <button
                          onClick={() => setStepOutcome(idx, 'UNDER')}
                          className="px-3 py-1.5 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold rounded-xs transition-colors"
                        >
                          Under 3.5 (Continua Madre)
                        </button>
                        <button
                          onClick={() => setStepOutcome(idx, 'OVER')}
                          className="px-3 py-1.5 bg-red-950/30 hover:bg-red-900/50 text-red-400 border border-red-500/40 text-xs font-mono font-bold rounded-xs transition-colors"
                        >
                          Over 3.5 (Subentra Copertura)
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div
                          className={`px-3 py-1.5 rounded-xs border text-xs font-mono font-bold flex items-center gap-1.5 ${
                            step.matchOutcome === 'UNDER'
                              ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-400'
                              : 'bg-blue-950/30 border-[#3B82F6]/50 text-blue-400'
                          }`}
                        >
                          {step.matchOutcome === 'UNDER' ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Esito: UNDER 3.5 &rarr; Multipla Madre Procede</span>
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4 text-[#3B82F6]" />
                              <span>
                                Esito: OVER 3.5 &rarr; {isSingleFinal ? 'Vince Singola Finale!' : 'Copertura Diventa Schedina Madre!'}
                              </span>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setMatchOutcomes((prev) => {
                              const next = [...prev];
                              next[idx] = 'PENDING';
                              return next;
                            });
                          }}
                          className="text-[10px] font-mono text-[#64748B] hover:text-white underline"
                        >
                          Modifica
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Final Financial Summary when Complete */}
      {allFinished && (
        <div className="bg-[#0F1117] border border-emerald-500/40 p-5 rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-xs uppercase mb-1">
                <CheckCircle2 className="w-4 h-4" />
                Sequenza a Scalare Conclusa con Successo
              </div>
              <h3 className="text-base font-bold text-white">
                Tutte le coperture si sono alternate fino all&apos;evento finale
              </h3>
              <p className="text-xs text-[#94A3B8] mt-1 font-mono">
                Incasso Lordo: <span className="text-white font-bold">€{simulation.finalPayout.toFixed(2)}</span> &bull; Spesa Totale Cumulata: <span className="text-white font-bold">€{simulation.totalSpentSoFar.toFixed(2)}</span>
              </p>
            </div>

            <div className="text-right shrink-0 bg-[#1A1D26] border border-[#2D3139] px-4 py-2.5 rounded-xs font-mono">
              <div className="text-[10px] text-[#64748B] uppercase">Utile Netto Finale</div>
              <div
                className={`text-xl font-bold ${
                  simulation.finalNet >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {simulation.finalNet >= 0 ? '+' : ''}€{simulation.finalNet.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Critical Mathematical Insight on the 2-Hour Relay */}
      <div className="p-4 bg-[#141824] border border-[#3B82F6]/30 rounded-xs font-mono text-xs text-[#94A3B8] space-y-2">
        <div className="text-white font-bold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#3B82F6]" />
          Analisi dell&apos;Efficienza Finanziaria tra le 2 Ore:
        </div>
        <p className="leading-relaxed">
          1. <strong>Vantaggio del Relay Sequenziale (2 ore):</strong> Non si investono tutti i soldi subito. Se le prime partite escono Under, la spesa rimane bassa e si impegna capitale solo se e quando necessario.
        </p>
        <p className="leading-relaxed">
          2. <strong>Il Punto Debole Finale (La Perdita del Bonus):</strong> Quando si scende sotto i 5 eventi (Match 5, 6, 7 e la Singola Finale), il moltiplicatore perde il bonus (passa a 0%). Contemporaneamente la quota complessiva crolla (da ~26.0 a ~3.00). Per recuperare le puntate precedenti e garantire utile, la puntata sulla singola finale sale sensibilmente.
        </p>
      </div>
    </div>
  );
};
