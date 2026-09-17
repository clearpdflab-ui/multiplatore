import { Calendar, Layers, ShieldCheck, Repeat, Sliders } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { ViewMode } from '../types';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { title?: string; titleId?: string }>;

export interface StepDef {
  id: ViewMode;
  n: number;
  label: string;
  hint: string;
  icon: Icon;
}

// Il flusso operativo: 4 passi in ordine. Tutto il resto sta in Strumenti.
export const STEPS: StepDef[] = [
  {
    id: 'calendar_odds',
    n: 1,
    label: 'Cerca',
    hint: 'Trova le partite o fatti proporre le scale',
    icon: Calendar,
  },
  {
    id: 'live_slips',
    n: 2,
    label: 'Prepara',
    hint: 'Arma la scala e verifica i numeri',
    icon: Layers,
  },
  {
    id: 'place',
    n: 3,
    label: 'Piazza',
    hint: 'Piazza ogni ticket senza errori',
    icon: ShieldCheck,
  },
  { id: 'cycles', n: 4, label: 'Segui', hint: 'Esiti, ledger e storico', icon: Repeat },
];

export interface ToolDef {
  id: ViewMode;
  label: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'practical', label: 'Simulatore', hint: 'Prova idee senza soldi veri' },
  { id: 'math', label: 'Analisi', hint: 'Diagnostica e teoria del motore' },
  { id: 'books', label: 'Book & Bonus', hint: 'Registra book, bonus e tetti' },
];

export const TOOLS_ICON: Icon = Sliders;

export function isStepView(v: ViewMode): boolean {
  return STEPS.some((s) => s.id === v);
}
