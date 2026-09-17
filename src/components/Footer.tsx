import React from 'react';
import { ViewMode } from '../types';
import { STEPS, TOOLS } from './steps';

interface FooterProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Footer: React.FC<FooterProps> = ({ currentView, onViewChange }) => {
  return (
    <footer className="bg-[#0F1117] border-t border-[#2D3139] px-4 sm:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
      <div className="text-[10px] text-[#64748B] uppercase tracking-wider font-mono">
        Mai perdita · verifica prima di piazzare
      </div>
      <div className="flex flex-wrap gap-1.5 justify-end font-mono">
        {STEPS.map((s) => (
          <button
            key={s.id}
            onClick={() => onViewChange(s.id)}
            title={s.hint}
            className={`px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
              currentView === s.id
                ? 'bg-[#3B82F6] text-white shadow-sm'
                : 'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white'
            }`}
          >
            {s.n}. {s.label}
          </button>
        ))}
        {TOOLS.map((t) => (
          <button
            key={t.id}
            onClick={() => onViewChange(t.id)}
            title={t.hint}
            className={`px-2.5 py-1.5 text-[11px] uppercase tracking-wider transition-all rounded-xs cursor-pointer ${
              currentView === t.id
                ? 'bg-[#1A1D26] text-white border border-[#3B82F6] shadow-sm'
                : 'bg-transparent border border-[#2D3139] text-[#64748B] hover:bg-[#1A1D26] hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </footer>
  );
};
