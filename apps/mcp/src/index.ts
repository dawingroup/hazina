#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { hazinaApi } from './api.js';
import { registerAllTools } from './toolRegistry.js';

const baseUrl = process.env.HAZINA_API_URL ?? 'http://localhost:8080';
const token = process.env.HAZINA_ID_TOKEN;
if (!token) throw new Error('HAZINA_ID_TOKEN (the signed-in person’s ID token) is required');

const server = new McpServer({ name: 'hazina', version: '0.1.0' });
const count = registerAllTools(server, hazinaApi(baseUrl, token));
await server.connect(new StdioServerTransport());
console.error(`hazina MCP server ready with ${count} read-only tools`);
