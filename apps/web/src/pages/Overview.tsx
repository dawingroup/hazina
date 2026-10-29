import { useQuery } from '@tanstack/react-query';
import { apiGet, type NetWorth } from '@/lib/api';
import { money } from '@/lib/format';
import { Card, CardTitle, CardValue } from '@/components/ui/card';
import { useProjection } from './useProjection';

export function Overview() {
  const nw = useQuery({
    queryKey: ['net-worth'],
    queryFn: () => apiGet<NetWorth>('/v1/net-worth'),
  });
  const proj = useProjection();

  if (nw.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (nw.error) return <p className="text-destructive">{String(nw.error)}</p>;
  const d = nw.data!;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Wealth overview</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardTitle>Net worth</CardTitle>
          <CardValue>{money(d.netWorthMinor, d.currency, true)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Total assets</CardTitle>
          <CardValue>{money(d.assetsMinor, d.currency, true)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Total liabilities</CardTitle>
          <CardValue>{money(d.liabilitiesMinor, d.currency, true)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Liquidity runway</CardTitle>
          <CardValue>{proj.data ? `${proj.data.runwayMonths} months` : '…'}</CardValue>
        </Card>
      </div>
      <p className="text-sm text-muted-foreground">
        Trend line since last month arrives with the first month-end close (sprint 5).
      </p>
    </div>
  );
}
