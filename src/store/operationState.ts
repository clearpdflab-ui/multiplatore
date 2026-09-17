import { createContext } from 'react';
import type { AsymmetricMode, FinalHedgeMode, UserMatch } from '../types';

// Stato dell'operazione corrente (scala condivisa Prepara <-> Piazza).
// Tipi + default + persistenza: niente componenti qui (fast-refresh pulito).

export interface OperationParams {
  baseStake: number;
  targetProfit: number;
  targetMode: 'fixed' | 'roi';
  roiPct: number;
  baseCap: number;
  asymmetricMode: AsymmetricMode;
  enableBooster: boolean;
  boosterOdds: number;
  finalHedgeMode: FinalHedgeMode;
  layOdds?: number;
  layCommissionPct: number;
  layStake?: number;
  harmonized: boolean;
  budget?: number;
  line: number;
}

export interface Operation {
  matches: UserMatch[];
  params: OperationParams;
  updatedAt: string;
}

export const OPERATION_STORAGE_KEY = 'multiplatore:operation:v1';

export const DEFAULT_OPERATION_PARAMS: OperationParams = {
  baseStake: 20,
  targetProfit: 45,
  targetMode: 'fixed',
  roiPct: 4,
  baseCap: 10,
  asymmetricMode: 'front_loaded',
  enableBooster: true,
  boosterOdds: 1.1,
  finalHedgeMode: 'lay_exchange',
  layCommissionPct: 4.5,
  harmonized: true,
  line: 3.5,
};

export function loadOperation(): Operation {
  try {
    const raw = localStorage.getItem(OPERATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Operation>;
      if (Array.isArray(parsed.matches)) {
        return {
          matches: parsed.matches,
          params: { ...DEFAULT_OPERATION_PARAMS, ...(parsed.params ?? {}) },
          updatedAt: parsed.updatedAt ?? new Date().toISOString(),
        };
      }
    }
  } catch {
    /* parte vuota */
  }
  return {
    matches: [],
    params: { ...DEFAULT_OPERATION_PARAMS },
    updatedAt: new Date().toISOString(),
  };
}

export function persistOperation(op: Operation) {
  try {
    localStorage.setItem(OPERATION_STORAGE_KEY, JSON.stringify(op));
  } catch {
    /* storage non disponibile: resta in memoria */
  }
}

export interface OperationContextValue {
  operation: Operation;
  setOperation: (matches: UserMatch[], params: OperationParams) => void;
  clearOperation: () => void;
}

export const OperationContext = createContext<OperationContextValue | null>(null);
