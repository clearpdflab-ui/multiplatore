import React from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral' | 'violet';

const styles: Record<Tone, string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  warn: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  bad: 'bg-red-500/15 text-red-300 border-red-500/40',
  info: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  neutral: 'bg-[#1A1D26] text-[#94A3B8] border-[#2D3139]',
  violet: 'bg-violet-500/15 text-violet-300 border-violet-500/40',
};

export const Badge: React.FC<{
  tone?: Tone;
  children: React.ReactNode;
  title?: string;
  className?: string;
}> = ({ tone = 'neutral', children, title, className = '' }) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-xs border text-[10px] font-mono font-bold uppercase ${styles[tone]} ${className}`}
  >
    {children}
  </span>
);
