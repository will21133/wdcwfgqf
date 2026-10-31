// Debug URL routes (PLAN2 §1.2). Packages register routes from their own files instead of editing
// boot.ts; boot tries them in registration order and the first one that returns true takes over.
// Example: registerDebugRoute('egg', (q) => { if (!q.has('egg')) return false; ...; return true; });

export type DebugRoute = (q: URLSearchParams) => boolean | Promise<boolean>;

const routes: { name: string; run: DebugRoute }[] = [];

export function registerDebugRoute(name: string, run: DebugRoute): void {
  routes.push({ name, run });
}

export function debugRouteNames(): string[] { return routes.map((r) => r.name); }

/** boot: try every route; returns the name of the route that took over, or null */
export async function runDebugRoutes(q: URLSearchParams): Promise<string | null> {
  for (const r of routes) {
    try {
      if (await r.run(q)) return r.name;
    } catch (e) {
      console.error(`[debug] route "${r.name}" failed`, e);
    }
  }
  return null;
}
