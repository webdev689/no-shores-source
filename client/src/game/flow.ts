/**
 * Where the player is in the game's loop: in the story that opens the game, on foot in a node or a dungeon,
 * back at their ship on the sea, or over an island's side choosing where to land. Travel between them passes through
 * a loading veil. Pure: the page feeds it what happened and draws what it answers.
 */
export type Flow =
  | { readonly mode: 'story' }
  | { readonly mode: 'loading'; readonly words: string; readonly then: Flow }
  | { readonly mode: 'foot'; readonly node: string }
  /** The way between passage zones, or across between two patrol zones (passages/passageWay.ts), played instead of
   *  the veil while the room changes. */
  | { readonly mode: 'passing'; readonly then: Flow }
  | { readonly mode: 'sea' }
  | { readonly mode: 'landing'; readonly chosen: string | null };

/** The veil stays down until everything round the player is ready, or this long; and once it is, for this many frames
 *  more drawn whole under it, so the first frames' own work (pipelines made, pictures sent) is done unseen
 *  ([[One Loading Screen Covers Every Trip Until the Place Is Ready]]). The way between passage zones waits as long
 *  on the body its room stands. */
export const READY_WAIT_S = 20;

/** Something that happened, from the player or the world. */
export type Happening =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'return-to-ship' }
  | { readonly kind: 'view-landings' }
  | { readonly kind: 'choose'; readonly node: string }
  | { readonly kind: 'land'; readonly node: string; readonly name: string }
  | { readonly kind: 'pass'; readonly node: string; readonly name: string; readonly into: boolean }
  | { readonly kind: 'join'; readonly node: string; readonly name: string }
  | { readonly kind: 'enter'; readonly node: string; readonly name: string }
  | { readonly kind: 'leave'; readonly node: string; readonly name: string }
  | { readonly kind: 'surface'; readonly name: string; readonly fell: boolean }
  | { readonly kind: 'wiped'; readonly node: string; readonly name: string }
  | { readonly kind: 'wash-up'; readonly node: string; readonly words: string }
  | { readonly kind: 'isle'; readonly node: string; readonly words: string }
  | { readonly kind: 'back' }
  /** Through a passage's mouth to the zone beyond, or by a lamp's Home back to the patrol zone. `loaded` then ends
   *  the way only once it has played to its end (`wayAt`'s `done`) and the place has come. */
  | { readonly kind: 'onward'; readonly node: string }
  | { readonly kind: 'home'; readonly node: string }
  | { readonly kind: 'cross'; readonly node: string; readonly name: string }
  | { readonly kind: 'story-ended'; readonly node: string; readonly name: string }
  | { readonly kind: 'shut'; readonly why: string };

/** The first flow: the player arrives in a node, as they wash up on Overlook's shore. */
export function arriving(node: string, name: string): Flow {
  return { mode: 'loading', words: `Arriving at ${name}`, then: { mode: 'foot', node } };
}

/** Whether the player is on the sea: sailing, or looking over an island's side to land; never between places. */
export function onTheSea(flow: Flow): boolean {
  return flow.mode === 'sea' || flow.mode === 'landing';
}

/** The flow after something happens. Anything that does not fit the mode leaves it as it was. */
export function next(flow: Flow, happening: Happening): Flow {
  switch (happening.kind) {
    case 'loaded':
      // Behind the veil the place has come; on the way between passage zones, the way has played to its end too.
      return flow.mode === 'loading' || flow.mode === 'passing' ? flow.then : flow;
    case 'cross':
    case 'onward':
    case 'home':
      return flow.mode === 'foot' ? { mode: 'passing', then: { mode: 'foot', node: happening.node } } : flow;
    case 'return-to-ship':
      if (flow.mode !== 'foot') return flow;
      return { mode: 'loading', words: 'Returning to your ship', then: { mode: 'sea' } };
    case 'view-landings':
      return flow.mode === 'sea' ? { mode: 'landing', chosen: null } : flow;
    case 'choose':
      return flow.mode === 'landing' ? { ...flow, chosen: happening.node } : flow;
    case 'land':
      if (flow.mode !== 'landing' || flow.chosen !== happening.node) return flow;
      return {
        mode: 'loading',
        words: `Landing at ${happening.name}`,
        then: { mode: 'foot', node: happening.node },
      };
    case 'pass':
      if (flow.mode !== 'foot') return flow;
      return {
        mode: 'loading',
        words: `${happening.into ? 'Entering' : 'Returning to'} ${happening.name}`,
        then: { mode: 'foot', node: happening.node },
      };
    case 'join':
      // A company member is joined from wherever the player is, on foot or at sea, as Destiny's join brings them in.
      if (flow.mode !== 'foot' && flow.mode !== 'sea') return flow;
      return {
        mode: 'loading',
        words: `Joining your company at ${happening.name}`,
        then: { mode: 'foot', node: happening.node },
      };
    case 'enter':
    case 'leave': {
      // Into a dungeon, on foot, or at sea or over an island's side as the Playlist starts a run, or out of one to its
      // node.
      const from = happening.kind === 'enter' && onTheSea(flow) ? flow.mode : 'foot';
      if (flow.mode !== from) return flow;
      const words = `${happening.kind === 'enter' ? 'Entering' : 'Leaving'} ${happening.name}`;
      return { mode: 'loading', words, then: { mode: 'foot', node: happening.node } };
    }
    case 'wiped':
      // A company that fell in an Abyss run is taken out to its entrance.
      if (flow.mode !== 'foot') return flow;
      return {
        mode: 'loading',
        words: `Your company fell. Leaving ${happening.name}`,
        then: { mode: 'foot', node: happening.node },
      };
    case 'surface': {
      // Out of a sea island's dungeon onto the sea, as a company that fell is taken out.
      if (flow.mode !== 'foot') return flow;
      const words = `${happening.fell ? 'Your company fell. ' : ''}Leaving ${happening.name}`;
      return { mode: 'loading', words, then: { mode: 'sea' } };
    }
    case 'wash-up':
    case 'isle':
      // Washed up from the sea, the player stands in the port city's social space or on an island's beach, the veil
      // saying why; anchored off an island, they walk ashore on its beach.
      if (flow.mode !== 'sea') return flow;
      return { mode: 'loading', words: happening.words, then: { mode: 'foot', node: happening.node } };
    case 'story-ended':
      // The story hands the player to the game where it leaves them: Overlook's social space.
      return flow.mode === 'story' ? arriving(happening.node, happening.name) : flow;
    case 'shut':
      // A room whose gate shuts to the player sends them back to their ship, the veil saying why.
      if (flow.mode !== 'foot' && flow.mode !== 'loading' && flow.mode !== 'passing') return flow;
      return { mode: 'loading', words: `${happening.why} Returning to your ship`, then: { mode: 'sea' } };
    case 'back':
      // Back from over an island's side to the helm.
      return flow.mode === 'landing' ? { mode: 'sea' } : flow;
  }
}
