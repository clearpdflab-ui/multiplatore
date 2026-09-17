import React from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'success';

const styles: Record<Variant, string> = {
  primary: 'bg-[#3B82F6] text-white hover:bg-[#2563EB]',
  ghost:
    'bg-transparent border border-[#2D3139] text-[#94A3B8] hover:bg-[#1A1D26] hover:text-white',
  danger: 'bg-transparent border border-red-500/40 text-red-300 hover:bg-red-500/10',
  success:
    'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }
> = ({ variant = 'ghost', small = false, className = '', ...rest }) => (
  <button
    type="button"
    className={`inline-flex items-center gap-1.5 rounded-xs font-mono font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${small ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-xs'} ${styles[variant]} ${className}`}
    {...rest}
  />
);
