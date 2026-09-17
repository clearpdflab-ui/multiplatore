import React, { useState } from 'react';
import { ViewMode } from '../types';
import { STEPS, TOOLS, TOOLS_ICON } from './steps';
import { AuthBar } from './AuthBar';

interface HeaderProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentView, onViewChange }) => {
  const [toolsOpen, setToolsOpen] = useState(false);
  const activeTool = TOOLS.find((t) => t.id === currentView) ?? null;
  const ToolsIcon = TOOLS_ICON;

  return (
    <header className="border-b border-[#2D3139] bg-[#0F1117] select-none">
      <div className="h-14 flex items-center justify-between px-3 sm:px-8 gap-2">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-[#3B82F6] rounded-xs flex items-center justify-center font-bold text-white shadow-sm shadow-[#3B82F6]/30">
            S
          </div>
          <h1 className="text-sm sm:text-base font-semibold tracking-tight text-white">
            MULTISCALE
          </h1>
        </div>
        <div className="hidden lg:block">
          <AuthBar />
        </div>
      </div>

      {/* Stepper: il flusso in 4 passi + strumenti */}
      <nav className="border-t border-[#2D3139] px-2 sm:px-8 py-2 flex items-center gap-1 overflow-x-auto font-mono">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const active = currentView === s.id;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <span className="text-[#2D3139] shrink-0">→</span>}
              <button
                onClick={() => onViewChange(s.id)}
                title={s.hint}
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs uppercase tracking-wider transition-colors rounded-xs shrink-0 ${
                  active
                    ? 'bg-[#3B82F6] text-white font-bold shadow-sm'
                    : 'text-[#94A3B8] hover:text-white hover:bg-[#1A1D26]'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold ${
                    active ? 'bg-white/25 text-white' : 'bg-[#1A1D26] text-[#64748B]'
                  }`}
                >
                  {s.n}
                </span>
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </button>
            </React.Fragment>
          );
        })}

        <div className="relative shrink-0 ml-1">
          <button
            onClick={() => setToolsOpen((v) => !v)}
            title="Strumenti fuori flusso: simulatore, analisi, book"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs uppercase tracking-wider transition-colors rounded-xs ${
              activeTool || toolsOpen
                ? 'bg-[#1A1D26] text-white border border-[#3B82F6]/50'
                : 'text-[#94A3B8] hover:text-white hover:bg-[#1A1D26]'
            }`}
          >
            <ToolsIcon className="w-3.5 h-3.5" />
            Strumenti{activeTool ? `: ${activeTool.label}` : ''}
          </button>
          {toolsOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-[#0F1117] border border-[#2D3139] rounded-xs shadow-xl z-50 py-1">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onViewChange(t.id);
                    setToolsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-[#1A1D26] ${
                    currentView === t.id ? 'text-white' : 'text-[#94A3B8]'
                  }`}
                >
                  <div className="text-xs font-bold uppercase tracking-wider">{t.label}</div>
                  <div className="text-[11px] text-[#64748B] normal-case">{t.hint}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>
    </header>
  );
};
