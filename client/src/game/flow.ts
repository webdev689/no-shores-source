/**
 * Where the player is in the game's loop: in the story that opens the game, on foot in a node or a patrol's dungeon,
 * back at their ship on the sea, or over an island's side choosing where to land. Travel between them passes through
 * a loading veil. On foot and at sea a menu may be open over the play. Pure: the page feeds it what happened and
 * draws what it answers.
 */
export type Flow =
  | { readonly mode: 'story' }
  | { readonly mode: 'loading'; readonly words: string; readonly then: Flow }
  | { readonly mode: 'foot'; readonly node: string; readonly menu: boolean }
  | { readonly mode: 'sea'; readonly menu: boolean }
  | { readonly mode: 'landing'; readonly chosen: string | null };

/** Something that happened, from the player or the world. */
export type Happening =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'menu' }
  | { readonly kind: 'return-to-ship' }
  | { readonly kind: 'view-landings' }
  | { readonly kind: 'choose'; readonly node: string }
  | { readonly kind: 'land'; readonly node: string; readonly name: string }
  | { readonly kind: 'join'; readonly node: string; readonly name: string }
  | { readonly kind: 'enter'; readonly node: string; readonly name: string }
  | { readonly kind: 'leave'; readonly node: string; readonly name: string }
  | { readonly kind: 'back' }
  | { readonly kind: 'story-ended'; readonly node: string; readonly name: string }
  | { readonly kind: 'shut'; readonly why: string };

/** The first flow: the player arrives in a node, as they wash up on Overlook's shore. */
export function arriving(node: string, name: string): Flow {
  return { mode: 'loading', words: `Arriving at ${name}`, then: { mode: 'foot', node, menu: false } };
}

/** The flow after something happens. Anything that does not fit the mode leaves it as it was. */
export function next(flow: Flow, happening: Happening): Flow {
  switch (happening.kind) {
    case 'loaded':
      return flow.mode === 'loading' ? flow.then : flow;
    case 'menu':
      return flow.mode === 'foot' || flow.mode === 'sea' ? { ...flow, menu: !flow.menu } : flow;
    case 'return-to-ship':
      if (flow.mode !== 'foot') return flow;
      return { mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea', menu: false } };
    case 'view-landings':
      return flow.mode === 'sea' ? { mode: 'landing', chosen: null } : flow;
    case 'choose':
      return flow.mode === 'landing' ? { ...flow, chosen: happening.node } : flow;
    case 'land':
      if (flow.mode !== 'landing' || flow.chosen !== happening.node) return flow;
      return {
        mode: 'loading',
        words: `Landing at ${happening.name}`,
        then: { mode: 'foot', node: happening.node, menu: false },
      };
    case 'join':
      // A company member is joined from wherever the player is, on foot or at sea, as Destiny's join brings them in.
      if (flow.mode !== 'foot' && flow.mode !== 'sea') return flow;
      return {
        mode: 'loading',
        words: `Joining your company at ${happening.name}`,
        then: { mode: 'foot', node: happening.node, menu: false },
      };
    case 'enter':
    case 'leave': {
      // Into a patrol's dungeon, or out of one to its patrol, on foot with no menu open.
      if (flow.mode !== 'foot' || flow.menu) return flow;
      const words = `${happening.kind === 'enter' ? 'Entering' : 'Leaving'} ${happening.name}`;
      return { mode: 'loading', words, then: { mode: 'foot', node: happening.node, menu: false } };
    }
    case 'story-ended':
      // The story hands the player to the game where it leaves them: Overlook's social space.
      return flow.mode === 'story' ? arriving(happening.node, happening.name) : flow;
    case 'shut':
      // A room whose gate shuts to the player sends them back to their ship, the veil saying why.
      if (flow.mode !== 'foot' && flow.mode !== 'loading') return flow;
      return { mode: 'loading', words: `${happening.why} Returning to your ship`, then: { mode: 'sea', menu: false } };
    case 'back':
      if (flow.mode === 'landing') return { mode: 'sea', menu: false };
      return (flow.mode === 'foot' || flow.mode === 'sea') && flow.menu ? { ...flow, menu: false } : flow;
  }
}
