/**
 * Money is carried as integer MINOR units plus an ISO 4217 code, never as floats
 * in storage. UGX has no minor unit in practice (exponent 0); USD, GBP, KES use 2.
 * The database stores minor units as bigint; the engine uses number, which is
 * exact for any amount below 9e15 minor units.
 */
export const CURRENCY_EXPONENT = { UGX: 0, USD: 2, GBP: 2, KES: 2 } as const;
export type Currency = keyof typeof CURRENCY_EXPONENT;

export interface Money {
  amountMinor: number;
  currency: Currency;
}

export function toMajor(m: Money): number {
  return m.amountMinor / 10 ** CURRENCY_EXPONENT[m.currency];
}

export function fromMajor(major: number, currency: Currency): Money {
  return { amountMinor: Math.round(major * 10 ** CURRENCY_EXPONENT[currency]), currency };
}

/**
 * FX rates are quoted as: one unit (major) of `currency` = `rate` units (major) of the base.
 * The base currency itself must be present with rate 1.
 */
export type FxRates = Partial<Record<Currency, number>>;

export function convert(m: Money, to: Currency, rates: FxRates): Money {
  if (m.currency === to) return m;
  const fromRate = rates[m.currency];
  const toRate = rates[to];
  if (fromRate === undefined || toRate === undefined) {
    throw new Error(`Missing FX rate for ${fromRate === undefined ? m.currency : to}`);
  }
  return fromMajor((toMajor(m) * fromRate) / toRate, to);
}
