import React, { useState } from 'react';
import { ORIGINAL_BASE_BET, ORIGINAL_CSV_STEPS, WEAK_POINTS, IMPROVEMENTS } from '../data/originalData';
import { calculateBinomialRisk } from '../utils/mathEngine';
import { AlertTriangle, TrendingDown, CheckCircle2, ChevronRight, Calculator, Flame } from 'lucide-react';

export const MathematicalAnalysis: React.FC = () => {
  const [selectedWeakPoint, setSelectedWeakPoint] = useState<string>(WEAK_POINTS[0].id);

  const risk = calculateBinomialRisk(9, 1.32, 3.0);

  return (
    <div className="space-y-6">
      {/* Top Banner: Immediate Math Finding */}
      <div className="bg-[#1A1D26] border border-[#2D3139] p-5 rounded-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-mono font-semibold uppercase tracking-wider rounded-xs">
                Audit Matematico Risultato
              </span>
              <span className="text-xs text-[#94A3B8] font-mono">Formula Analysis Report</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
              Discrepanza Fondamentale: Formula Lineare vs Esponenziale
            </h2>
            <p className="text-xs sm:text-sm text-[#94A3B8] mt-1 max-w-3xl leading-relaxed">
              Nel foglio CSV inviato, la quota complessiva delle multiple di copertura è stata calcolata <strong className="text-red-400">sommando le quote</strong> (Q_over + N × Q_under) anziché <strong className="text-[#3B82F6]">moltiplicandole</strong> (Q_over × Q_under^N). Questo altera l'intera architettura del capitale necessario e l'efficienza delle coperture.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-[#0F1117] border border-[#2D3139] px-4 py-2.5 rounded-xs text-center">
              <div className="text-[10px] text-[#64748B] uppercase font-mono">Quota CSV Cop. 1</div>
              <div className="text-base sm:text-lg font-mono font-bold text-orange-400">13.56</div>
              <div className="text-[9px] text-[#64748B] font-mono">3.00 + (8 × 1.32)</div>
            </div>
            <div className="text-[#3B82F6] font-mono text-xl font-bold">≠</div>
            <div className="bg-[#0F1117] border border-[#3B82F6]/40 px-4 py-2.5 rounded-xs text-center">
              <div className="text-[10px] text-[#3B82F6] uppercase font-mono">Quota Reale Cop. 1</div>
              <div className="text-base sm:text-lg font-mono font-bold text-emerald-400">27.34</div>
              <div className="text-[9px] text-[#3B82F6] font-mono">3.00 × (1.32)⁸</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid Section: Probability Risk & Formula Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Probability Risk Box */}
        <div className="lg:col-span-5 bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#64748B] font-mono">
                Distribuzione Statistica (8 Eventi)
              </span>
              <span className="text-xs font-mono text-red-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5" /> Rischio Sistemico
              </span>
            </div>
            <h3 className="text-sm font-bold text-white mb-2">
              Perché il modello pre-match perde nel 73% dei casi
            </h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed mb-4">
              Se giocate in blocco prima dell&apos;inizio, le coperture coprono <em>soltanto</em> il caso di <strong className="text-white">esattamente 1 solo Over</strong>. Se ne escono 2 o più, <strong>tutte le schedine perdono</strong>. La soluzione è il <strong className="text-[#3B82F6]">Relay Sequenziale ogni 2 ore</strong>.
            </p>

            <div className="space-y-3 font-mono">
              <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#94A3B8]">0 Over (Vince Multipla Base)</div>
                  <div className="text-xs text-[#64748B]">Tutti gli 8 match Under 3.5</div>
                </div>
                <div className="text-base font-bold text-emerald-400">{risk.pZeroErrors}%</div>
              </div>

              <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#94A3B8]">Esattamente 1 Over (Vince 1 Copertura)</div>
                  <div className="text-xs text-[#64748B]">7 Under e 1 solo Over</div>
                </div>
                <div className="text-base font-bold text-[#3B82F6]">{risk.pOneError}%</div>
              </div>

              <div className="p-3 bg-[#1A1D26] border border-red-500/40 rounded-xs flex items-center justify-between bg-red-950/20">
                <div>
                  <div className="text-[11px] text-red-300 font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    ≥ 2 Over (Criticità nel Pre-Match)
                  </div>
                  <div className="text-xs text-red-400/80">Risolto dal relay progressivo a sostituzione</div>
                </div>
                <div className="text-lg font-bold text-red-400">{risk.pMultipleErrors}%</div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#2D3139] text-[11px] text-[#64748B] flex justify-between font-mono">
            <span>Aggio Bookmaker per Match: ~{risk.bookmakerMargin}%</span>
            <span>Over 3.5 @ 3.00 // Under @ 1.32</span>
          </div>
        </div>

        {/* User Rules In-Depth Breakdown Box */}
        <div className="lg:col-span-7 bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-[#3B82F6] font-mono font-bold">
                Le 3 Regole Fondamentali della Strategia
              </span>
              <span className="text-xs font-mono text-emerald-400">Architettura Operativa</span>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
                <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-[#3B82F6] text-white rounded-full flex items-center justify-center text-[10px]">1</span>
                  Cadenza Sequenziale di 2 Ore
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Le partite sono distanziate di 2 ore. La multipla di copertura successiva parte <strong>solo dopo aver conosciuto l&apos;esito della precedente</strong>. Il capitale non viene bloccato tutto all&apos;inizio, ma investito a tappe.
                </p>
              </div>

              <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
                <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-[#3B82F6] text-white rounded-full flex items-center justify-center text-[10px]">2</span>
                  Relay a Sostituzione &amp; Singola Finale
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Se una partita termina Over, la copertura ha preso l&apos;Over e ha come gambe rimanenti tutti Under: <strong>prende il posto della multipla madre</strong> e continua ad essere protetta partita per partita fino alla <strong className="text-white">singola finale</strong> (Over 3.5 sull&apos;ultimo match) che chiude matematicamente tutte le coperture.
                </p>
              </div>

              <div className="p-3 bg-[#1A1D26] border border-[#2D3139] rounded-xs">
                <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 bg-amber-500 text-black rounded-full flex items-center justify-center text-[10px]">3</span>
                  Soglia Bonus Multipla (Minimo 5 Eventi)
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Il bonus scatta a partire da 5 eventi (es. 8 eventi = +26.2%, 7 = +18%, 6 = +12%, 5 = +6%). Sotto i 5 eventi (Match 5, 6, 7 e Singola finale) il bonus è pari a <strong>0%</strong>. Per compensare il crollo delle quote, la formula adatta la puntata per garantire il recupero.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#2D3139] text-[11px] text-[#64748B] font-mono flex items-center justify-between">
            <span>Formula Dutching: Stake = (Costi + Target) / (Quota - 1) &bull; <strong className="text-emerald-400 font-normal">Arrotondato a step di 0,50€</strong></span>
          </div>
        </div>
      </div>

      {/* Weak Points Diagnosis (Geometric Balance Style with colored left borders) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-widest text-orange-400 font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            4 Punti Deboli Rilevati nel Modello
          </h2>
          <span className="text-xs text-[#64748B] font-mono">Clicca su ciascuna anomalia per dettagli</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {WEAK_POINTS.map((wp) => {
            const isSelected = selectedWeakPoint === wp.id;
            const borderCol =
              wp.severity === 'critical'
                ? 'border-red-500'
                : wp.severity === 'high'
                ? 'border-orange-500'
                : 'border-yellow-500';

            return (
              <div
                key={wp.id}
                onClick={() => setSelectedWeakPoint(wp.id)}
                className={`p-4 border-l-3 ${borderCol} bg-[#1A1D26] rounded-xs cursor-pointer transition-all border-y border-r border-[#2D3139] ${
                  isSelected ? 'ring-1 ring-[#3B82F6]' : 'hover:bg-[#202430]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 bg-[#0F1117] text-[#94A3B8] rounded-xs">
                    {wp.tag}
                  </span>
                  <span
                    className={`text-[10px] uppercase font-mono font-bold ${
                      wp.severity === 'critical' ? 'text-red-400' : 'text-orange-400'
                    }`}
                  >
                    {wp.severity === 'critical' ? 'Criticità Massima' : 'Alta Criticità'}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-2">{wp.title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed mb-3">{wp.description}</p>
                <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs font-mono text-[11px] text-[#3B82F6] mb-2">
                  <span className="text-[#64748B] block text-[9px] uppercase">Dimostrazione:</span>
                  {wp.mathProof}
                </div>
                <div className="text-[11px] text-emerald-400/90 leading-snug flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span><strong>Soluzione:</strong> {wp.suggestedFix}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Suggested Improvements & New Formulas */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-6 rounded-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-[#3B82F6] font-mono font-bold">
              Modello Matematico Ottimizzato
            </span>
            <h2 className="text-base font-bold text-white mt-1">
              Come Riformulare e Migliorare il Modello a Scalare
            </h2>
          </div>
          <Calculator className="w-5 h-5 text-[#3B82F6]" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {IMPROVEMENTS.map((imp) => (
            <div
              key={imp.id}
              className="p-4 bg-[#1A1D26] border border-[#2D3139] rounded-xs flex flex-col justify-between"
            >
              <div>
                <span className="text-[9px] uppercase tracking-wider font-mono text-[#3B82F6] block mb-1">
                  {imp.tag}
                </span>
                <h3 className="text-xs font-bold text-white mb-2">{imp.title}</h3>
                <p className="text-xs text-[#94A3B8] leading-relaxed mb-3">{imp.description}</p>
              </div>

              <div>
                <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs font-mono text-[11px] text-white mb-2 overflow-x-auto">
                  {imp.formula}
                </div>
                <div className="text-[11px] text-emerald-400 font-mono">✓ {imp.advantage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
