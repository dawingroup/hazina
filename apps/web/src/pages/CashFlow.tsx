import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money } from '@/lib/format';
import { useProjection } from './useProjection';

export function CashFlow() {
  const { data, isLoading, error } = useProjection();
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-destructive">{String(error)}</p>;
  const rows = data.months.map((m) => ({
    month: m.month,
    income: m.reliableIncomeMinor,
    outflows: -m.obligationsMinor,
    balance: m.liquidBalanceMinor,
  }));
  const fmt = (v: number) => money(v, data.baseCurrency, true);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Cash flow</h1>
      <p className="text-muted-foreground">
        Reliable income against outflows each month, with the cumulative liquid balance.{' '}
        {data.gapMonths.length
          ? `Gap months: ${data.gapMonths.join(', ')}.`
          : 'No projected gap months.'}
      </p>
      <div className="h-96">
        <ResponsiveContainer>
          <ComposedChart data={rows} stackOffset="sign">
            <CartesianGrid vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={80} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.4} />
            <Bar dataKey="income" stackId="f" fill="#0f766e" />
            <Bar dataKey="outflows" stackId="f" fill="#b91c1c" />
            <Line dataKey="balance" stroke="#2563eb" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
