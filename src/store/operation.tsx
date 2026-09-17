import React, { useCallback, useMemo, useState } from 'react';
import type { UserMatch } from '../types';
import type { Operation, OperationParams } from './operationState';
import {
  DEFAULT_OPERATION_PARAMS,
  loadOperation,
  OperationContext,
  persistOperation,
} from './operationState';

// Operazione corrente: la scala su cui stai lavorando, condivisa tra
// Prepara (workbench) e Piazza (schede piazzamento). Il workbench la tiene
// aggiornata a ogni modifica; Piazza la legge in sola lettura.

interface OperationProviderProps {
  children: React.ReactNode;
}

export const OperationProvider: React.FC<OperationProviderProps> = ({ children }) => {
  const [operation, setOperationState] = useState<Operation>(loadOperation);

  const setOperation = useCallback((matches: UserMatch[], params: OperationParams) => {
    setOperationState((prev) => {
      const next: Operation = {
        matches,
        params,
        updatedAt: new Date().toISOString(),
      };
      // Evita loop di render: se nulla e' cambiato, tieni lo stato precedente.
      if (
        JSON.stringify(prev.matches) === JSON.stringify(next.matches) &&
        JSON.stringify(prev.params) === JSON.stringify(next.params)
      ) {
        return prev;
      }
      persistOperation(next);
      return next;
    });
  }, []);

  const clearOperation = useCallback(() => {
    const next: Operation = {
      matches: [],
      params: { ...DEFAULT_OPERATION_PARAMS },
      updatedAt: new Date().toISOString(),
    };
    persistOperation(next);
    setOperationState(next);
  }, []);

  const value = useMemo(
    () => ({ operation, setOperation, clearOperation }),
    [operation, setOperation, clearOperation],
  );
  return <OperationContext.Provider value={value}>{children}</OperationContext.Provider>;
};
