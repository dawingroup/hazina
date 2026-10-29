import { auth } from './firebase';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export async function apiGet<T>(path: string): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const r = await fetch(`${BASE}${path}`, {
    headers: { authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return (await r.json()) as T;
}

export interface NetWorth {
  currency: string;
  assetsMinor: number;
  liabilitiesMinor: number;
  netWorthMinor: number;
  assetCount: number;
}
export interface ProjectedMonth {
  month: string;
  obligationsMinor: number;
  obligationsByCategory: { family: number; personal: number; business: number };
  reliableIncomeMinor: number;
  netNeedMinor: number;
  liquidBalanceMinor: number;
  gap: boolean;
}
export interface Projection {
  baseCurrency: string;
  months: ProjectedMonth[];
  fundedRatio: number | null;
  runwayMonths: number;
  gapMonths: string[];
  buckets: {
    bucket: string;
    pvNeedMinor: number;
    fundedMinor: number;
    fundedRatio: number | null;
  }[];
}
