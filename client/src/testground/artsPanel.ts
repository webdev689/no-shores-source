// The Test Ground's Arts, to try every spell at once: the Art worn, each slot of its Core, each Art's level (owning
// all its fragments), and the Anima filled and the Tenets readied. The room answers each ask as it would the Arts'
// screen's, and the panel shows its word.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { button, make } from '../editor/dom.ts';
import type { ArtState } from '../network/artMessages.ts';
import { ASKS, type GearAsk, type Standing } from '../network/gearMessages.ts';
import { labelled } from './dressPanel.ts';

/** How many slots an Art's Core has. */
const CORE_SLOTS = 3;

/** The ask that sets `fragment` (its place in the Art's list) in `slot` of `art`'s Core. */
export const coreAsk = (art: number, slot: number, fragment: number): GearAsk => ({
  kind: ASKS.setCore,
  column: art,
  slot,
  node: fragment,
});

/** The ask that sets `art` at `level`, owning all its fragments. */
export const levelAsk = (art: number, level: number): GearAsk => ({ kind: ASKS.grantArtLevel, column: art, level });

/** Adds the Arts' panel to `root`; the function it answers shows the room's last word on the Arts and where the player
 *  stands with each, redrawn only when that word changes. */
export function startArtsPanel(
  root: HTMLElement,
  ask: (asked: GearAsk) => void,
): (state: ArtState | null, standing?: Standing) => void {
  const worn = make('select');
  worn.append(...arts.arts.map((art) => Object.assign(make('option', art.name), { value: String(art.id) })));
  let shown: ArtState | null = null;
  /** The Art and Core the lists were last built for; forgotten at each ask, so the room's next word, a refusal's
   *  too, sets every list back to what it holds. */
  let drawn = '';
  const asked = (gearAsk: GearAsk) => {
    drawn = '';
    ask(gearAsk);
  };
  worn.addEventListener('change', () => asked({ kind: ASKS.wearArt, column: Number(worn.value) }));
  const slots = Array.from({ length: CORE_SLOTS }, (unused, slot) => {
    const select = make('select');
    select.addEventListener('change', () => {
      if (!shown) return;
      // A fragment is never taken out, only replaced: "—" goes back to what the room holds.
      if (select.value === '') select.value = String(shown.cores[shown.art - 1]?.[slot] ?? '');
      else asked(coreAsk(shown.art, slot, Number(select.value)));
    });
    return select;
  });
  const levels = arts.arts.map((art) => {
    const select = make('select');
    select.append(
      ...[1, 2, 3, 4, 5].map((level) => Object.assign(make('option', String(level)), { value: String(level) })),
    );
    select.addEventListener('change', () => asked(levelAsk(art.id, Number(select.value))));
    return select;
  });
  root.append(
    make('h2', 'Arts'),
    labelled('Art', worn),
    ...slots.map((select, slot) => labelled(`Core ${slot + 1}`, select)),
    ...levels.map((select, place) => labelled(`${arts.arts[place]?.name ?? ''} level`, select)),
    button('Fill the Anima, ready the Tenets', () => ask({ kind: ASKS.grantArts })),
    make('p', 'R casts the Anima, Q and G the Tenets. A fragment set in another slot is refused.', 'hint'),
  );
  return (state, standing) => {
    if (!state) return;
    shown = state;
    // Built again only when the Art, its Core or a level changes, so a list held open is not closed under the pointer.
    const now = JSON.stringify([state.art, state.cores[state.art - 1], standing?.artLevels]);
    if (now === drawn) return;
    drawn = now;
    levels.forEach((select, place) => (select.value = String(standing?.artLevels[place] ?? 1)));
    worn.value = String(state.art);
    const core = arts.arts.find((art) => art.id === state.art)?.core ?? [];
    const set = state.cores[state.art - 1] ?? [];
    slots.forEach((select, slot) => {
      const none = Object.assign(make('option', '—'), { value: '' });
      const fragments = core.map((fragment, place) =>
        Object.assign(make('option', fragment.name), { value: String(place) }),
      );
      select.replaceChildren(none, ...fragments);
      select.value = String(set[slot] ?? '');
    });
  };
}
