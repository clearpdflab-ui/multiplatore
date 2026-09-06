export function getBonusPercentage(eventCount: number): number {
  if (eventCount >= 8) return 26.2;
  if (eventCount === 7) return 18.0;
  if (eventCount === 6) return 12.0;
  if (eventCount === 5) return 6.0;
  return 0.0;
}
