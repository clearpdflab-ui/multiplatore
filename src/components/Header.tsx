import React from 'react';
import { ViewMode } from '../types';
import { Activity, ShieldAlert, Cpu, Layers, Calendar } from 'lucide-react';

interface HeaderProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  return (
    <header className="h-16 border-b border-[#2D3139] flex items-center justify-between px-3 sm:px-8 bg-[#0F1117] select-none">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="w-8 h-8 bg-[#3B82F6] rounded-xs flex items-center justify-center font-bold text-white shadow-sm shadow-[#3B82F6]/30">
          Σ
        </div>
        <div>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-white flex items-center gap-2">
            MULTISCALE COVERAGE
            <span className="text-[#3B82F6] font-mono text-xs font-normal opacity-90 hidden sm:inline">
              // ENGINE V.4.2
            </span>
          </h1>
          <p className="text-[10px] text-[#64748B] tracking-wider uppercase hidden md:block">
            Modellatore Matematico e Diagnostica Coperture a Scalare
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex border border-[#2D3139] bg-[#0A0B10] p-0.5 rounded-xs font-mono">
          <button
            onClick={() => onViewChange('calendar_odds')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors rounded-xs flex items-center gap-1.5 ${
              currentView === 'calendar_odds'
                ? 'bg-[#3B82F6] text-white shadow-sm font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Calendario &amp; Bookmaker</span>
            <span className="sm:hidden">Calendario</span>
          </button>

          <button
            onClick={() => onViewChange('live_slips')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors rounded-xs flex items-center gap-1.5 ${
              currentView === 'live_slips'
                ? 'bg-[#3B82F6] text-white shadow-sm font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Schedine Live</span>
            <span className="sm:hidden">Schedine</span>
          </button>

          <button
            onClick={() => onViewChange('practical')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors rounded-xs flex items-center gap-1.5 ${
              currentView === 'practical'
                ? 'bg-[#1A1D26] text-white border border-[#3B82F6]/50 shadow-sm font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Simulatore</span>
            <span className="sm:hidden">Simul.</span>
          </button>

          <button
            onClick={() => onViewChange('math')}
            className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors rounded-xs flex items-center gap-1.5 ${
              currentView === 'math'
                ? 'bg-[#1A1D26] text-white border border-[#3B82F6]/50 shadow-sm font-bold'
                : 'text-[#94A3B8] hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Analisi Matematica</span>
            <span className="sm:hidden">Analisi</span>
          </button>
        </div>
      </div>
    </header>
  );
};
