import { money } from '@/lib/format';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { useProjection } from './useProjection';

const pct = (r: number | null) => (r === null ? 'No need' : `${Math.round(r * 100)}%`);
const LABEL: Record<string, string> = {
  liquidity: 'Liquidity, 0–12 months',
  committed: 'Committed, 1–5 years',
  long_term: 'Long-term, 5+ years',
};

export function Coverage() {
  const { data, isLoading, error } = useProjection();
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-destructive">{String(error)}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Coverage</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardTitle>Funded ratio</CardTitle>
          <CardValue>{pct(data.fundedRatio)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Liquidity runway</CardTitle>
          <CardValue>{data.runwayMonths} months</CardValue>
        </Card>
      </div>
      <div className="space-y-3">
        {data.buckets.map((b) => (
          <div key={b.bucket}>
            <div className="flex justify-between text-sm">
              <span>{LABEL[b.bucket] ?? b.bucket}</span>
              <span className="tabular-nums text-muted-foreground">
                {money(b.fundedMinor, data.baseCurrency, true)} of{' '}
                {money(b.pvNeedMinor, data.baseCurrency, true)} · {pct(b.fundedRatio)}
              </span>
            </div>
            <div className="mt-1 h-2 rounded bg-muted">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: `${Math.min(100, (b.fundedRatio ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
