import { useContext } from 'react';
import { OperationContext, type OperationContextValue } from './operationState';

export function useOperation(): OperationContextValue {
  const ctx = useContext(OperationContext);
  if (!ctx) {
    throw new Error('useOperation va usato dentro <OperationProvider>');
  }
  return ctx;
}
