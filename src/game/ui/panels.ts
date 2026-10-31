// Panel registry (PLAN2 §1.1): packages register full-screen overlays by id so other packages
// can open them without importing each other. Opening an unregistered id is a safe no-op.
// Agreed ids: 'pocketWatch'(P4) 'almanac'(P7) 'controls'(P7) 'join'(F2) 'mainspring'(P6) 'armory'(P5)
//             'handStand'(P5) 'departure'(P6) 'contracts'(P6) 'ledger'(P6) 'shrine'(P6) 'rehearsal'(P7)
import type { Overlay } from './overlay';

const factories = new Map<string, (args?: any) => Overlay>();

export const Panels = {
  register(id: string, factory: (args?: any) => Overlay): void { factories.set(id, factory); },
  /** build the panel; null when nobody registered it */
  open(id: string, args?: any): Overlay | null {
    const f = factories.get(id);
    if (!f) return null;
    try { return f(args); } catch (e) { console.error(`[panels] ${id} failed to open`, e); return null; }
  },
  has(id: string): boolean { return factories.has(id); },
  ids(): string[] { return [...factories.keys()]; },
};
