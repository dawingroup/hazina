/**
 * The MCP server never touches the database. Every tool calls the Hazina API with
 * the signed-in person's token, so Claude sees exactly what that person may see,
 * through the same tenant scoping and audit log.
 */
export interface HazinaApi {
  get<T>(path: string): Promise<T>;
}

export function hazinaApi(baseUrl: string, token: string): HazinaApi {
  return {
    async get<T>(path: string) {
      const r = await fetch(new URL(path, baseUrl), {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`Hazina API ${path} answered ${r.status}`);
      return (await r.json()) as T;
    },
  };
}
