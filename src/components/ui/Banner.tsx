import React from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info';

const styles: Record<Tone, string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200',
  warn: 'border-amber-500/40 bg-amber-500/5 text-amber-200',
  bad: 'border-red-500/40 bg-red-500/5 text-red-200',
  info: 'border-sky-500/40 bg-sky-500/5 text-sky-200',
};

const titleStyles: Record<Tone, string> = {
  ok: 'text-emerald-300',
  warn: 'text-amber-300',
  bad: 'text-red-300',
  info: 'text-sky-300',
};

// Regola casa: titolo + UNA riga + al massimo un'azione. Niente muri di testo.
export const Banner: React.FC<{
  tone?: Tone;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ tone = 'info', title, children, action, className = '' }) => (
  <div className={`border rounded-xs p-3 font-mono text-xs space-y-1 ${styles[tone]} ${className}`}>
    <div className={`font-bold uppercase tracking-wider ${titleStyles[tone]}`}>{title}</div>
    {children && <div className="leading-relaxed">{children}</div>}
    {action && <div className="pt-1">{action}</div>}
  </div>
);
