const EXP: Record<string, number> = { UGX: 0, USD: 2, GBP: 2, KES: 2 };

export function money(minor: number, currency: string, compact = false): string {
  const major = minor / 10 ** (EXP[currency] ?? 2);
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : (EXP[currency] ?? 2),
  }).format(major);
}
