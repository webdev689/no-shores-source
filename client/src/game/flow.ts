/**
 * Where the player is in the game's loop, after Destiny 1's: on foot in a node, back at their ship on the sea, or
 * over an island's side choosing where to land. Travel between them passes through a loading veil, as Destiny's
 * orbit does. Pure: the page feeds it what happened and draws what it answers.
 */
export type Flow =
  | { readonly mode: 'loading'; readonly words: string; readonly then: Flow }
  | { readonly mode: 'foot'; readonly node: string }
  | { readonly mode: 'sea'; readonly continent: string; readonly menu: boolean }
  | { readonly mode: 'landing'; readonly continent: string; readonly chosen: string | null };

/** Something that happened, from the player or the world. */
export type Happening =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'return-to-ship'; readonly continent: string }
  | { readonly kind: 'view-landings' }
  | { readonly kind: 'choose'; readonly node: string }
  | { readonly kind: 'land'; readonly node: string; readonly name: string }
  | { readonly kind: 'back' }
  | { readonly kind: 'menu' };

/** The first flow: the player arrives in a node, as they wash up on Overlook's shore. */
export function arriving(node: string, name: string): Flow {
  return { mode: 'loading', words: `Arriving at ${name}`, then: { mode: 'foot', node } };
}

/** The flow after something happens. Anything that does not fit the mode leaves it as it was. */
export function next(flow: Flow, happening: Happening): Flow {
  switch (happening.kind) {
    case 'loaded':
      return flow.mode === 'loading' ? flow.then : flow;
    case 'return-to-ship':
      if (flow.mode !== 'foot') return flow;
      return {
        mode: 'loading',
        words: 'Returning to your ship',
        then: { mode: 'sea', continent: happening.continent, menu: false },
      };
    case 'view-landings':
      return flow.mode === 'sea' ? { mode: 'landing', continent: flow.continent, chosen: null } : flow;
    case 'choose':
      return flow.mode === 'landing' ? { ...flow, chosen: happening.node } : flow;
    case 'land':
      if (flow.mode !== 'landing' || flow.chosen !== happening.node) return flow;
      return { mode: 'loading', words: `Landing at ${happening.name}`, then: { mode: 'foot', node: happening.node } };
    case 'back':
      if (flow.mode === 'landing') return { mode: 'sea', continent: flow.continent, menu: false };
      return flow.mode === 'sea' && flow.menu ? { ...flow, menu: false } : flow;
    case 'menu':
      return flow.mode === 'sea' ? { ...flow, menu: !flow.menu } : flow;
  }
}
