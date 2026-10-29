import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HazinaApi } from '../api.js';

const major = (minor: number, currency: string) =>
  (currency === 'UGX' ? minor : minor / 100).toLocaleString('en-UG', { maximumFractionDigits: 2 });

export function registerWealthTools(server: McpServer, api: HazinaApi): number {
  server.registerTool(
    'hazina_net_worth',
    {
      title: 'Net worth',
      description:
        'Current net worth from the latest dated valuations, in the family base currency.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async () => {
      const nw = await api.get<{
        currency: string;
        assetsMinor: number;
        liabilitiesMinor: number;
        netWorthMinor: number;
      }>('/v1/net-worth');
      const text = `Net worth ${nw.currency} ${major(nw.netWorthMinor, nw.currency)} (assets ${major(nw.assetsMinor, nw.currency)}, liabilities ${major(nw.liabilitiesMinor, nw.currency)}).`;
      return { content: [{ type: 'text', text }] };
    },
  );

  server.registerTool(
    'hazina_cash_runway',
    {
      title: 'Cash runway and funded ratio',
      description:
        'Months of runway, gap months and funded ratio from a projection starting at the given month.',
      inputSchema: {
        start: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .describe('First month, YYYY-MM'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ start }) => {
      const p = await api.get<{
        runwayMonths: number;
        gapMonths: string[];
        fundedRatio: number | null;
      }>(`/v1/projection?start=${start}`);
      const ratio = p.fundedRatio === null ? 'no net need' : `${(p.fundedRatio * 100).toFixed(0)}%`;
      const gaps = p.gapMonths.length ? `Gap months: ${p.gapMonths.join(', ')}.` : 'No gap months.';
      return {
        content: [
          { type: 'text', text: `Runway ${p.runwayMonths} months. Funded ratio ${ratio}. ${gaps}` },
        ],
      };
    },
  );
  return 2;
}
