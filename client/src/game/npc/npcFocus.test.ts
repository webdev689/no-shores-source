import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keyBeside } from './npcScreen.ts';

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
const inner = (from: Node): Node | null =>
  from.children.map((child) => (child.dataset['key'] ? child : inner(child))).find(Boolean) ?? null;
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
      const wanted = selector.slice(1);
      for (let up: Node | null = from; up; up = up.parent) if (up.className === wanted) return asElement(up);
      return null;
    },
    querySelector: () => asElement(inner(from)),
  } as unknown as Element;
}

const ware = (key: string) => node('npc-ware', null, node('npc-tile', key), node('npc-price', null));

test('the focus left by a keeper’s tile goes to the tile beside its holder, else to the next row’s first', () => {
  const vestiges = node('npc-row', null, node('gear-heading', null), node('npc-tiles', null, ware('a'), ware('b')));
  const opened = node('npc-row', null, node('gear-heading', null), node('npc-tiles', null, ware('opened')));
  node('npc-rows', null, vestiges, opened);
  const [first, second] = vestiges.children[1]?.children ?? [];
  assert.equal(keyBeside(asElement(first?.children[0] ?? null)), 'b');
  assert.equal(keyBeside(asElement(second?.children[0] ?? null)), 'a');
  const alone = node('npc-row', null, node('npc-tiles', null, ware('last')));
  node('npc-rows', null, alone, opened);
  assert.equal(keyBeside(asElement(alone.children[0]?.children[0]?.children[0] ?? null)), 'opened');
});

test('elsewhere in the menu the focus goes to the press beside it, as before', () => {
  const cells = node('grid', null, node('gear-cell', 'x'), node('gear-cell', 'y'));
  assert.equal(keyBeside(asElement(cells.children[0] ?? null)), 'y');
});
