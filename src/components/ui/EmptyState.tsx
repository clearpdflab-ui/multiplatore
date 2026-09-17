import React from 'react';
import { Button } from './Button';

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon, title, text, actionLabel, onAction }) => (
  <div className="bg-[#0F1117] border border-dashed border-[#2D3139] rounded-sm p-8 text-center space-y-3">
    {icon && <div className="flex justify-center text-[#64748B]">{icon}</div>}
    <h3 className="text-white font-bold font-mono uppercase tracking-wider text-sm">{title}</h3>
    <p className="text-xs text-[#94A3B8] font-mono max-w-md mx-auto leading-relaxed">{text}</p>
    {actionLabel && onAction && (
      <Button variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </div>
);
