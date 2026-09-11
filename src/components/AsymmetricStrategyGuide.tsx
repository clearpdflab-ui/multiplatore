import React, { useState, useMemo } from 'react';
import {
  ModelParameters,
  calculateSteps,
  roundToFiftyCents,
  getStepTargetProfit,
} from '../utils/mathEngine';
import { AsymmetricMode } from '../types';
import {
  Scale,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  Coins,
  FileSpreadsheet,
} from 'lucide-react';

interface AsymmetricStrategyGuideProps {
  params: ModelParameters;
  onParamsChange: (updater: (prev: ModelParameters) => ModelParameters) => void;
}

export const AsymmetricStrategyGuide: React.FC<AsymmetricStrategyGuideProps> = ({
  params,
  onParamsChange,
}) => {
  const [activeTab, setActiveTab] = useState<
    'how_to_build' | 'asymmetric_advantage' | 'interactive_matrix'
  >('how_to_build');

  // Compute 3 parallel models for live comparison:
  // 1. Flat Target (Classical Symmetric)
  // 2. Front-Loaded Surplus (Asymmetric High early, Minimal late)
  // 3. Capital Preservation (Break-Even 0€ on final steps)
  const comparisonData = useMemo(() => {
    const flatSteps = calculateSteps({ ...params, asymmetricMode: 'flat' });
    const frontLoadedSteps = calculateSteps({ ...params, asymmetricMode: 'front_loaded' });
    const capitalPreservSteps = calculateSteps({
      ...params,
      asymmetricMode: 'capital_preservation',
    });

    const flatFinalStake = flatSteps[flatSteps.length - 1]?.stake || 0;
    const frontFinalStake = frontLoadedSteps[frontLoadedSteps.length - 1]?.stake || 0;
    const preservFinalStake = capitalPreservSteps[capitalPreservSteps.length - 1]?.stake || 0;

    const flatTotalCost = flatSteps.reduce((acc, s) => acc + s.stake, params.baseStake);
    const frontTotalCost = frontLoadedSteps.reduce((acc, s) => acc + s.stake, params.baseStake);
    const preservTotalCost = capitalPreservSteps.reduce(
      (acc, s) => acc + s.stake,
      params.baseStake,
    );

    return {
      flatSteps,
      frontLoadedSteps,
      capitalPreservSteps,
      flatFinalStake,
      frontFinalStake,
      preservFinalStake,
      flatTotalCost,
      frontTotalCost,
      preservTotalCost,
      stakeSavedOnFinal: Number((flatFinalStake - frontFinalStake).toFixed(2)),
      stakeSavedPreservation: Number((flatFinalStake - preservFinalStake).toFixed(2)),
    };
  }, [params]);

  const currentMode = params.asymmetricMode || 'flat';

  return (
    <div className="space-y-6">
      {/* Sub Navigation Bar */}
      <div className="bg-[#0F1117] border border-[#2D3139] p-3 rounded-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#3B82F6]" />
          <span className="text-xs font-mono uppercase text-white font-bold tracking-wider">
            Manuale Operativo &amp; Ingegneria dello Sbilanciamento
          </span>
        </div>

        <div className="flex bg-[#1A1D26] border border-[#2D3139] rounded-xs p-0.5 text-xs font-mono w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('how_to_build')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'how_to_build'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>1. Come Creare le Schedine</span>
          </button>

          <button
            onClick={() => setActiveTab('asymmetric_advantage')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'asymmetric_advantage'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>2. Vantaggio di Sbilanciamento</span>
          </button>

          <button
            onClick={() => setActiveTab('interactive_matrix')}
            className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xs transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === 'interactive_matrix'
                ? 'bg-[#3B82F6] text-white font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. Confronto Puntate Step-by-Step</span>
          </button>
        </div>
      </div>

      {/* Mode Selector Pill if on interactive tabs */}
      <div className="bg-[#141824] border border-[#3B82F6]/30 p-4 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-[#3B82F6]/20 text-[#3B82F6] border border-[#3B82F6]/40 rounded-xs font-bold">
              Impostazione Strategia Attiva nel Simulatore
            </span>
            <span className="text-xs text-[#94A3B8] font-mono">Curva di Dutching Selezionata</span>
          </div>
          <p className="text-xs text-[#E0E2E7]">
            {currentMode === 'flat' &&
              'Modello Simmetrico: Cerca lo stesso utile (+45€) ovunque, provocando picchi di puntata su step finali.'}
            {currentMode === 'front_loaded' &&
              "Sbilanciamento Iniziale: Utile maggiorato all'inizio (+80€) e minimo alla fine (+5€) per abbattere lo stake della singola finale."}
            {currentMode === 'capital_preservation' &&
              "Preservazione Capitale: Utile moderato all'inizio e rigoroso Break-Even (0.00€) sugli ultimi 2 match per eliminare il rischio di capitale."}
          </p>
        </div>

        <div className="flex bg-[#0F1117] border border-[#2D3139] rounded-xs p-1 gap-1 shrink-0 font-mono text-xs">
          <button
            onClick={() => onParamsChange((p) => ({ ...p, asymmetricMode: 'flat' }))}
            className={`px-3 py-1.5 rounded-xs transition-colors ${
              currentMode === 'flat'
                ? 'bg-[#2A2F3D] text-white font-bold border border-[#3B82F6]/40'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            Simmetrico (Flat)
          </button>
          <button
            onClick={() => onParamsChange((p) => ({ ...p, asymmetricMode: 'front_loaded' }))}
            className={`px-3 py-1.5 rounded-xs transition-colors flex items-center gap-1 ${
              currentMode === 'front_loaded'
                ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            Sbilanciato (Consigliato)
          </button>
          <button
            onClick={() =>
              onParamsChange((p) => ({ ...p, asymmetricMode: 'capital_preservation' }))
            }
            className={`px-3 py-1.5 rounded-xs transition-colors flex items-center gap-1 ${
              currentMode === 'capital_preservation'
                ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40'
                : 'text-[#64748B] hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Salva Capitale
          </button>
        </div>
      </div>

      {/* TAB 1: HOW TO BUILD BETTING SLIPS STEP BY STEP */}
      {activeTab === 'how_to_build' && (
        <div className="space-y-6">
          <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#3B82F6]" />
              Prontuario: Come Creare e Giocare le Schedine al Terminale
            </h3>
            <p className="text-xs text-[#94A3B8] leading-relaxed mb-4">
              La strategia{' '}
              <strong>NON richiede di piazzare tutte le multiple prima delle partite</strong>. Si
              gioca con la logica <strong>"Live Relay a Scalare"</strong> distanziata di 2 ore: il
              capitale viene immesso solo quando serve.
            </p>

            {/* Visual Workflow Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {/* Step A */}
              <div className="bg-[#1A1D26] border border-[#2D3139] p-4 rounded-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 rounded-full bg-[#3B82F6] text-white flex items-center justify-center font-bold text-xs">
                    1
                  </span>
                  <span className="text-[10px] text-[#64748B]">T - 30 MIN AL MATCH 1</span>
                </div>
                <h4 className="text-white font-bold mb-1">Schedina Madre (S₀)</h4>
                <div className="p-2 bg-[#0F1117] border border-[#2D3139] rounded-xs mb-2 text-[11px] text-emerald-400">
                  {params.totalEvents} Eventi: Tutti UNDER 3.5
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Piazza la schedina principale con quota moltiplicata (~12x con bonus). Stake
                  iniziale (es. <strong>€{params.baseStake.toFixed(2)}</strong>).
                </p>
              </div>

              {/* Step B */}
              <div className="bg-[#1A1D26] border border-[#2D3139] p-4 rounded-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 rounded-full bg-amber-500 text-black flex items-center justify-center font-bold text-xs">
                    2
                  </span>
                  <span className="text-[10px] text-[#64748B]">PRIMA DI OGNI MATCH</span>
                </div>
                <h4 className="text-white font-bold mb-1">Copertura Singola Attiva (Cₖ)</h4>
                <div className="p-2 bg-[#0F1117] border border-[#2D3139] rounded-xs mb-2 text-[11px] text-amber-300">
                  Match Corrente: OVER 3.5 + Restanti UNDER 3.5
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Piazza la schedina di copertura <strong>solo per il match in partenza</strong>. Lo
                  stake è calcolato per coprire i costi passati + utile prefissato.
                </p>
              </div>

              {/* Step C */}
              <div className="bg-[#1A1D26] border border-[#2D3139] p-4 rounded-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="w-6 h-6 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-xs">
                    3
                  </span>
                  <span className="text-[10px] text-[#64748B]">ALL'ULTIMO MATCH</span>
                </div>
                <h4 className="text-white font-bold mb-1">Singola Finale di Chiusura</h4>
                <div className="p-2 bg-[#0F1117] border border-[#2D3139] rounded-xs mb-2 text-[11px] text-purple-300">
                  Singola OVER 3.5 (Match Finale) [+ Booster 1.10]
                </div>
                <p className="text-[11px] text-[#94A3B8] font-sans leading-relaxed">
                  Non ci sono più eventi rimanenti. Si piazza una singola Over 3.5 (o con booster)
                  che chiude matematicamente tutte le linee.
                </p>
              </div>
            </div>
          </div>

          {/* The Relay Rule in Detail */}
          <div className="bg-[#1A1D26] border border-[#2D3139] p-5 rounded-sm font-mono text-xs">
            <h4 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-emerald-400" />
              La Regola del &quot;Relay&quot; (Passaggio del Testimone): Cosa Fare ad Ogni Risultato
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-[#0F1117] border border-emerald-500/30 rounded-xs">
                <div className="flex items-center gap-2 text-emerald-400 font-bold mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  CASO 1: La partita termina UNDER 3.5
                </div>
                <ul className="space-y-1.5 text-[11px] text-[#94A3B8] font-sans list-disc list-inside leading-relaxed">
                  <li>
                    La copertura del match corrente è persa (costo minimo, es. 2.50€ o 3.50€).
                  </li>
                  <li>
                    <strong>La Schedina Madre è ancora VIVA al 100%!</strong>
                  </li>
                  <li>
                    Non devi recuperare nulla subito: attendi l&apos;orario della partita successiva
                    e prepari la Copertura successiva.
                  </li>
                </ul>
              </div>

              <div className="p-4 bg-[#0F1117] border border-amber-500/30 rounded-xs">
                <div className="flex items-center gap-2 text-amber-300 font-bold mb-2">
                  <AlertCircle className="w-4 h-4" />
                  CASO 2: La partita termina OVER 3.5
                </div>
                <ul className="space-y-1.5 text-[11px] text-[#94A3B8] font-sans list-disc list-inside leading-relaxed">
                  <li>
                    La Schedina Madre muore, <strong>MA la Copertura corrente è VINTA!</strong>
                  </li>
                  <li>
                    Poiché la copertura conteneva l&apos;Over appena uscito e tutti i restanti
                    Under, <strong>diventa la NUOVA SCHEDINA MADRE</strong>.
                  </li>
                  <li>
                    Non hai perso il sistema: continui a proteggere questa nuova madre partita per
                    partita.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ASYMMETRIC ADVANTAGE (SBILANCIAMENTO INIZIALE) */}
      {activeTab === 'asymmetric_advantage' && (
        <div className="space-y-6">
          <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] uppercase tracking-widest text-amber-400 font-mono font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Teorema dello Sbilanciamento Iniziale
              </span>
              <span className="text-xs text-[#64748B] font-mono">
                Ottimizzazione del Capitale &amp; Margine
              </span>
            </div>

            <h3 className="text-base sm:text-lg font-bold text-white mb-2">
              Perché il Dutching Simmetrico (Flat 45€) è un Errore e Come Creare &quot;Spazio di
              Cassa&quot;
            </h3>
            <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed max-w-4xl mb-6">
              Nel dutching tradizionale, chi gioca imposta lo <strong>stesso utile identico</strong>{' '}
              su tutte le schedine (es. +45€). Ma all&apos;inizio le quote sono{' '}
              <strong>altissime (27x - 20x)</strong> e alla fine sono{' '}
              <strong>bassissime (2.75x)</strong>. Pretendere 45€ sulla singola finale ti costringe
              a puntare oltre <strong>111,50€</strong>, prosciugando la cassa.
            </p>

            {/* Comparison Cards: Flat vs Asymmetric */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 font-mono text-xs">
              {/* Option 1: Flat */}
              <div
                className={`p-4 rounded-xs border transition-all ${
                  currentMode === 'flat'
                    ? 'bg-[#1A1D26] border-[#3B82F6]'
                    : 'bg-[#0F1117] border-[#2D3139]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-[#64748B] uppercase">Modello 1</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-300 rounded-xs">
                    Simmetrico
                  </span>
                </div>
                <h4 className="text-white font-bold mb-1">Target Fisso Costante</h4>
                <p className="text-[11px] text-[#94A3B8] font-sans mb-3">
                  Utile netto costante di <strong>+€{params.targetProfit.toFixed(2)}</strong> su
                  tutti gli step, dal primo all&apos;ultimo.
                </p>
                <div className="space-y-1.5 border-t border-[#2D3139] pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Step 1:</span>
                    <span className="text-white font-bold">
                      €{comparisonData.flatSteps[0]?.stake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Singola Finale:</span>
                    <span className="text-red-400 font-bold">
                      €{comparisonData.flatFinalStake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Costo Totale Potenziale:</span>
                    <span className="text-orange-400 font-bold">
                      €{comparisonData.flatTotalCost.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Option 2: Front Loaded (Recommended) */}
              <div
                className={`p-4 rounded-xs border transition-all ${
                  currentMode === 'front_loaded'
                    ? 'bg-[#1A1D26] border-amber-500 shadow-sm shadow-amber-500/10'
                    : 'bg-[#0F1117] border-[#2D3139]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-amber-400 uppercase font-bold">
                    Modello 2 (Consigliato)
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-950/50 text-amber-300 border border-amber-500/40 rounded-xs">
                    Sbilanciato
                  </span>
                </div>
                <h4 className="text-white font-bold mb-1">Sbilanciamento Iniziale</h4>
                <p className="text-[11px] text-[#94A3B8] font-sans mb-3">
                  Punti a <strong>+€80€</strong> all&apos;inizio (quando la quota è 27x e costa solo
                  1.50€ in più!), e scendi a <strong>+€5€</strong> alla fine.
                </p>
                <div className="space-y-1.5 border-t border-[#2D3139] pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Step 1:</span>
                    <span className="text-emerald-400 font-bold">
                      €{comparisonData.frontLoadedSteps[0]?.stake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Singola Finale:</span>
                    <span className="text-emerald-400 font-bold">
                      €{comparisonData.frontFinalStake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[#2D3139] pt-1">
                    <span className="text-amber-400 font-bold">Risparmio Singola Finale:</span>
                    <span className="text-amber-300 font-bold">
                      -€{comparisonData.stakeSavedOnFinal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Option 3: Capital Preservation */}
              <div
                className={`p-4 rounded-xs border transition-all ${
                  currentMode === 'capital_preservation'
                    ? 'bg-[#1A1D26] border-emerald-500'
                    : 'bg-[#0F1117] border-[#2D3139]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-emerald-400 uppercase">Modello 3</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950/50 text-emerald-300 border border-emerald-500/40 rounded-xs">
                    Salva Capitale
                  </span>
                </div>
                <h4 className="text-white font-bold mb-1">Preservazione di Cassa</h4>
                <p className="text-[11px] text-[#94A3B8] font-sans mb-3">
                  Utile moderato all&apos;inizio e <strong>Break-Even puro (€0.00 di utile)</strong>{' '}
                  sulla finale: recupera solo le spese pregresse.
                </p>
                <div className="space-y-1.5 border-t border-[#2D3139] pt-3 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Step 1:</span>
                    <span className="text-white font-bold">
                      €{comparisonData.capitalPreservSteps[0]?.stake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#64748B]">Puntata Singola Finale:</span>
                    <span className="text-emerald-400 font-bold">
                      €{comparisonData.preservFinalStake.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-[#2D3139] pt-1">
                    <span className="text-emerald-400 font-bold">Risparmio Massimale:</span>
                    <span className="text-emerald-300 font-bold">
                      -€{comparisonData.stakeSavedPreservation.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Practical Advice on Staggering */}
            <div className="mt-6 p-4 bg-[#1A1D26] border border-[#2D3139] rounded-xs font-mono text-xs">
              <h4 className="text-amber-400 font-bold mb-2 flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                Le 3 Regole d&apos;Oro per Creare il Massimo Vantaggio di Cassa:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-[#94A3B8] font-sans">
                <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
                  <strong className="text-white block mb-1">1. Partite Blindate per Prime</strong>
                  Metti nei primi 2-3 slot orari le partite con la quota Under più bassa (es. 1.25 o
                  1.28). Se passano, hai azzerato il rischio senza spendere nulla.
                </div>
                <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
                  <strong className="text-white block mb-1">2. Accetta il Break-Even Finale</strong>
                  All&apos;ultimo match non cercare il colpo grosso: l&apos;obiettivo unico deve
                  essere <strong>recuperare il capitale speso</strong>.
                </div>
                <div className="p-2.5 bg-[#0F1117] border border-[#2D3139] rounded-xs">
                  <strong className="text-white block mb-1">3. Cuscino Booster 1.10</strong>
                  Aggiungi un evento a 1.10 sulla singola finale: riduce la puntata di altri 15€-20€
                  e ripristina il bonus multipla se sei a 4 eventi.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: STEP-BY-STEP INTERACTIVE MATRIX */}
      {activeTab === 'interactive_matrix' && (
        <div className="bg-[#0F1117] border border-[#2D3139] p-5 rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-[#2D3139]">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Matrice Comparativa Puntate a 0.50€ (Simmetrico vs Sbilanciato)
              </h3>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Tutti i calcoli sono matematicamente arrotondati all&apos;incremento superiore di
                0,50€
              </p>
            </div>

            <div className="text-xs font-mono text-[#64748B]">
              Base Iniziale: <strong className="text-white">€{params.baseStake.toFixed(2)}</strong>{' '}
              &bull; Target:{' '}
              <strong className="text-white">€{params.targetProfit.toFixed(2)}</strong>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#2D3139] text-[#64748B] text-[10px] uppercase bg-[#141824]">
                  <th className="p-2.5">Step / Match</th>
                  <th className="p-2.5">Quota + Bonus</th>
                  <th className="p-2.5">Target Flat</th>
                  <th className="p-2.5 text-[#3B82F6]">Puntata Flat (€0.50)</th>
                  <th className="p-2.5 text-amber-400">Target Sbilanciato</th>
                  <th className="p-2.5 text-amber-300">Puntata Sbilanciata (€0.50)</th>
                  <th className="p-2.5 text-emerald-400">Puntata Salva-Capitale</th>
                  <th className="p-2.5 text-right">Differenza Cassa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#20242C]">
                {comparisonData.flatSteps.map((step, idx) => {
                  const frontStep = comparisonData.frontLoadedSteps[idx];
                  const preservStep = comparisonData.capitalPreservSteps[idx];
                  const isFinal = step.step === params.totalEvents;
                  const diff = Number((step.stake - frontStep.stake).toFixed(2));

                  const frontTarget = getStepTargetProfit(
                    step.step,
                    params.totalEvents,
                    params.targetProfit,
                    'front_loaded',
                  );

                  return (
                    <tr
                      key={step.step}
                      className={`hover:bg-[#1A1D26]/50 transition-colors ${
                        isFinal ? 'bg-purple-950/20 font-bold' : ''
                      }`}
                    >
                      <td className="p-2.5 text-white">
                        {step.name}
                        {isFinal && (
                          <span className="ml-1 text-[9px] px-1 bg-purple-900/60 text-purple-300 rounded-xs">
                            FINALE
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-emerald-400">{step.calculatedOdds.toFixed(2)}</td>
                      <td className="p-2.5 text-[#94A3B8]">€{params.targetProfit.toFixed(2)}</td>
                      <td className="p-2.5 text-white font-bold">€{step.stake.toFixed(2)}</td>
                      <td className="p-2.5 text-amber-400">€{frontTarget.toFixed(2)}</td>
                      <td className="p-2.5 text-amber-300 font-bold">
                        €{frontStep.stake.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-emerald-300 font-bold">
                        €{preservStep.stake.toFixed(2)}
                      </td>
                      <td className="p-2.5 text-right">
                        {diff > 0 ? (
                          <span className="text-emerald-400 font-bold">
                            +€{diff.toFixed(2)} risparmiati
                          </span>
                        ) : diff < 0 ? (
                          <span className="text-[#64748B]">
                            -€{Math.abs(diff).toFixed(2)} (anticipo)
                          </span>
                        ) : (
                          <span className="text-[#64748B]">Parità</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
