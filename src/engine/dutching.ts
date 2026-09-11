export function roundToFiftyCents(val: number): number {
  if (val <= 0) {
    return 0.5;
  }
  const rounded = Math.ceil(val * 2) / 2;
  return Math.max(1.0, Number(rounded.toFixed(2)));
}

export function getStepTargetProfit(
  step: number,
  totalEvents: number,
  baseTarget: number,
  mode: 'flat' | 'front_loaded' | 'capital_preservation' = 'flat',
): number {
  if (mode === 'flat' || !mode) {
    return baseTarget;
  }

  if (mode === 'front_loaded') {
    const ratio = (step - 1) / Math.max(1, totalEvents - 1);
    const factor = Math.max(0.12, 1.8 - 1.68 * ratio);
    return Math.max(5, Math.round((baseTarget * factor) / 5) * 5);
  }

  if (mode === 'capital_preservation') {
    if (step >= totalEvents - 1) {
      return 0;
    }
    if (step <= 2) {
      return Math.round((baseTarget * 1.25) / 5) * 5;
    }
    return Math.max(5, Math.round((baseTarget * 0.6) / 5) * 5);
  }

  return baseTarget;
}
