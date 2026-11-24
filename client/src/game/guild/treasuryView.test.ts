import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OutpostsFace } from '../../network/accounts.ts';
import type { Node } from '../../ui/node.ts';
import { drawn } from '../menuForTests.ts';
import { treasuryNode } from './treasuryView.ts';

const NOW = 100 * 3_600_000;
const FACE = {
  treasury: 1_000_000,
  ledger: [
    { at: NOW - 23 * 3_600_000, name: 'Ada', kind: 'raise war-table', amount: -250_000, balance: 1_000_000 },
    { at: NOW, name: 'Ben', kind: 'deposit', amount: 5, balance: 1_250_000 },
  ],
  allowed: 1,
  at: null,
  outposts: [],
} as unknown as OutpostsFace;

type Laid = { node: Node; box: { x: number; width: number } };

for (const size of [1, 2])
  test(`at the label step ${size}, each of the ledger's columns ends before the next begins`, () => {
    const page = drawn((context) => treasuryNode(context.ui, FACE, NOW, size, () => undefined), {
      width: 1500,
      height: 650,
    });
    page.frame();
    page.frame();
    const laid = (page.ui as unknown as { laid: readonly Laid[] }).laid;
    const box = (said: string) => laid.find((each) => each.node.text?.words === said)?.box;
    const row = ['23 hours ago', "Ada: Began the War Table's next tier", '−250,000', '1,000,000'].map(box);
    assert.ok(row.every(Boolean), JSON.stringify(row));
    for (const [place, cell] of row.entries()) {
      const next = row[place + 1];
      if (cell && next) assert.ok(cell.x + cell.width <= next.x, `column ${place} runs into column ${place + 1}`);
    }
  });
