// The Test Ground's Arts, to try every spell at once: the Art worn, each slot of its Core, and the Anima filled and
// the Tenets readied. The room answers each ask as it would the Arts' screen's, and the panel shows its word.
import arts from '../../../content/arts/arts.json' with { type: 'json' };
import { button, make } from '../editor/dom.ts';
import type { ArtState } from '../network/artMessages.ts';
import { ASKS, type GearAsk } from '../network/gearMessages.ts';
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

/** Adds the Arts' panel to `root`; the function it answers shows the room's last word on the Arts, redrawn only when
 *  that word changes. */
export function startArtsPanel(root: HTMLElement, ask: (asked: GearAsk) => void): (state: ArtState | null) => void {
  const worn = make('select');
  worn.append(...arts.arts.map((art) => Object.assign(make('option', art.name), { value: String(art.id) })));
  worn.addEventListener('change', () => ask({ kind: ASKS.wearArt, column: Number(worn.value) }));
  let shown: ArtState | null = null;
  const slots = Array.from({ length: CORE_SLOTS }, (unused, slot) => {
    const select = make('select');
    select.addEventListener('change', () => {
      if (shown && select.value !== '') ask(coreAsk(shown.art, slot, Number(select.value)));
    });
    return select;
  });
  root.append(
    make('h2', 'Arts'),
    labelled('Art', worn),
    ...slots.map((select, slot) => labelled(`Core ${slot + 1}`, select)),
    button('Fill the Anima, ready the Tenets', () => ask({ kind: ASKS.grantArts })),
    make('p', 'R casts the Anima, Q and G the Tenets. A fragment set in another slot is refused.', 'hint'),
  );
  return (state) => {
    if (!state || state === shown) return;
    shown = state;
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
