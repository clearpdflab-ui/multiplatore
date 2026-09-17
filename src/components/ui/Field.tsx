import React from 'react';

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <label className="flex items-center gap-2" title={hint}>
    <span className="text-[#94A3B8] text-xs font-mono">{label}</span>
    {children}
  </label>
);

export const numberInputCls =
  'bg-[#1A1D26] border border-[#2D3139] px-2 py-1 text-white text-right rounded-xs font-bold font-mono text-xs';
