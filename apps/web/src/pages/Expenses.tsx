import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { money } from '@/lib/format';
import { useProjection } from './useProjection';

export function Expenses() {
  const { data, isLoading, error } = useProjection();
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-destructive">{String(error)}</p>;
  const rows = data.months.map((m) => ({ month: m.month, ...m.obligationsByCategory }));
  const fmt = (v: number) => money(v, data.baseCurrency, true);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Projected expenses</h1>
      <p className="text-muted-foreground">
        Obligations per month for 36 months, by family, personal and business.
      </p>
      <div className="h-96">
        <ResponsiveContainer>
          <BarChart data={rows}>
            <CartesianGrid vertical={false} strokeOpacity={0.2} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={80} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Legend />
            <Bar dataKey="family" stackId="o" fill="#0f766e" />
            <Bar dataKey="personal" stackId="o" fill="#2563eb" />
            <Bar dataKey="business" stackId="o" fill="#a16207" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
