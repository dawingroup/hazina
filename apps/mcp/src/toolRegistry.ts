import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HazinaApi } from './api.js';
import { registerWealthTools } from './tools/wealth.js';

/** Single list of tool modules, as in DawinOS. Every tool declares annotations. */
export function registerAllTools(server: McpServer, api: HazinaApi): number {
  return [registerWealthTools].reduce((n, register) => n + register(server, api), 0);
}
