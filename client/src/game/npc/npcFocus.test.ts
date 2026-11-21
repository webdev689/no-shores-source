import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEPER_KINDS } from '../keepers.ts';
import { isKeeperView, keyBeside } from './npcScreen.ts';

/** A node of a stand-in page: its class, its key, its children; enough for finding a neighbour. */
interface Node {
  readonly className: string;
  readonly dataset: Record<string, string>;
  readonly children: Node[];
  parent: Node | null;
}
const node = (className: string, key: string | null, ...children: Node[]): Node => {
  const made: Node = { className, dataset: key ? { key } : {}, children, parent: null };
  for (const child of children) child.parent = made;
  return made;
};
const sibling = (from: Node, step: number) => from.parent?.children[from.parent.children.indexOf(from) + step] ?? null;
const keyed = (from: Node): Node[] =>
  from.children.flatMap((child) => [...(child.dataset['key'] ? [child] : []), ...keyed(child)]);
/** The stand-in as the DOM's Element, with only what `keyBeside` reads. */
function asElement(from: Node | null): Element | null {
  if (!from) return null;
  return {
    dataset: from.dataset,
    get nextElementSibling() {
      return asElement(sibling(from, 1));
    },
    get previousElementSibling() {
      return asElement(sibling(from, -1));
    },
    closest(selector: string) {
      const wanted = selector.split(',').map((one) => one.trim().slice(1));
      for (let up: Node | null = from; up; up = up.parent) if (wanted.includes(up.className)) return asElement(up);
      return null;
    },
    querySelectorAll: () => keyed(from).map(asElement),
  } as unknown as Element;
}

const ware = (key: string) => node('npc-ware', null, node('npc-tile', key), node('npc-price', null));

test('the focus left by a keeper’s tile goes to the tiles beside its holder, then the next row’s first and the row before’s last', () => {
  const art = node('npc-row', null, node('gear-heading', null), node('npc-tiles', null, ware('art'), ware('rise')));
  const vestiges = node('npc-row', null, node('gear-heading', null), node('npc-tiles', null, ware('a'), ware('b')));
  const opened = node('npc-row', null, node('gear-heading', null), node('npc-tiles', null, ware('opened')));
  node('npc-rows', null, art, vestiges, opened);
  const [first, second] = vestiges.children[1]?.children ?? [];
  assert.deepEqual(keyBeside(asElement(first?.children[0] ?? null)), ['b', 'opened', 'rise']);
  assert.deepEqual(keyBeside(asElement(second?.children[0] ?? null)), ['a', 'opened', 'rise']);
  const alone = node('npc-row', null, node('npc-tiles', null, ware('last')));
  node('npc-rows', null, alone, opened);
  assert.deepEqual(keyBeside(asElement(alone.children[0]?.children[0]?.children[0] ?? null)), ['opened']);
});

test('the focus left by a taken letter goes to the next letter, else the one before', () => {
  const letter = (id: string) =>
    node('npc-letter', null, node('gear-cell', `letter-${id}`), node('npc-take', `take-${id}`));
  const letters = node('npc-letters', null, letter('1'), letter('2'), letter('3'));
  node('npc-row', null, node('gear-heading', null), letters);
  const take = (place: number) => asElement(letters.children[place]?.children[1] ?? null);
  assert.deepEqual(keyBeside(take(1)), ['letter-3', 'take-1']);
  assert.deepEqual(keyBeside(take(2)), ['take-2']);
});

test('elsewhere in the menu the focus goes to the press beside it, as before', () => {
  const cells = node('grid', null, node('gear-cell', 'x'), node('gear-cell', 'y'));
  assert.deepEqual(keyBeside(asElement(cells.children[0] ?? null)), ['y']);
});

test('every counter opens a keeper’s screen, the vault’s among them; the menu’s tabs do not', () => {
  for (const kind of KEEPER_KINDS) assert.equal(isKeeperView(kind), true, kind);
  assert.equal(isKeeperView('inventory'), false);
});
