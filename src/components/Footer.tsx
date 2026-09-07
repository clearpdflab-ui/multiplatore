import React from 'react';
import { ViewMode } from '../types';

interface FooterProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Footer: React.FC<FooterProps> = ({ currentView, onViewChange }) => {
  return (
    <footer className="h-20 bg-[#0F1117] border-t border-[#2D3139] px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
      <div className="flex gap-6 sm:gap-8 text-left">
        <div>
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
            Tempo di Elaborazione
          </div>
          <div className="text-xs sm:text-sm font-mono text-white">14ms</div>
        </div>
        <div>
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
            Precisione Matematica
          </div>
          <div className="text-xs sm:text-sm font-mono text-emerald-400">99.998%</div>
        </div>
        <div className="hidden md:block">
          <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
            Architettura Calcolo
          </div>
          <div className="text-xs sm:text-sm font-mono text-[#3B82F6]">Dutching Esponenziale v4.2</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto justify-end font-mono">
        <button
          onClick={() => onViewChange('calendar_odds')}
          className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
            currentView === 'calendar_odds'
              ? 'bg-[#3B82F6] text-white shadow-sm'
              : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
          }`}
        >
          Calendario 7gg &amp; Odds
        </button>
        <button
          onClick={() => onViewChange('live_slips')}
          className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
            currentView === 'live_slips'
              ? 'bg-[#3B82F6] text-white shadow-sm'
              : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
          }`}
        >
          Schedine Live
        </button>
        <button
          onClick={() => onViewChange('practical')}
          className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
            currentView === 'practical'
              ? 'bg-[#1A1D26] text-white border border-[#3B82F6] shadow-sm'
              : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
          }`}
        >
          Simulatore
        </button>
        <button
          onClick={() => onViewChange('books')}
          className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
            currentView === 'books'
              ? 'bg-[#3B82F6] text-white shadow-sm'
              : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
          }`}
        >
          Book &amp; Bonus
        </button>
        <button
          onClick={() => onViewChange('math')}
          className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
            currentView === 'math'
              ? 'bg-[#1A1D26] text-white border border-[#3B82F6] shadow-sm'
              : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
          }`}
        >
          Analisi Matematica
        </button>
      </div>
    </footer>
  );
};
