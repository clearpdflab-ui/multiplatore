import React from 'react';

export const Card: React.FC<{
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  accent?: 'none' | 'emerald' | 'sky' | 'amber' | 'red' | 'violet';
  className?: string;
}> = ({ title, action, children, accent = 'none', className = '' }) => {
  const border =
    accent === 'none'
      ? 'border-[#2D3139]'
      : accent === 'emerald'
        ? 'border-emerald-500/30'
        : accent === 'sky'
          ? 'border-sky-500/30'
          : accent === 'amber'
            ? 'border-amber-500/30'
            : accent === 'red'
              ? 'border-red-500/30'
              : 'border-violet-500/30';
  return (
    <section
      className={`bg-[#0F1117] border ${border} p-4 sm:p-5 rounded-sm space-y-3 ${className}`}
    >
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {typeof title === 'string' ? (
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              {title}
            </h2>
          ) : (
            title
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
};
