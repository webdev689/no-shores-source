import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAll, onFakePage } from '../combat/page.test.ts';
import type { GearState } from '../network/gearMessages.ts';
import type { PageContext } from './characterPage.ts';
import { musterAt } from './shipPages.ts';

/** A page's context for a player pledged to `pledge` (0 none), with no officer offered today. */
const pledged = (pledge: number): PageContext =>
  ({
    gear: { aurem: 0, standing: { pledge }, ship: { offers: [] } } as unknown as GearState,
  }) as unknown as PageContext;

test('the muster stands only on the screen of the faction pledged to', () =>
  onFakePage((root) => {
    assert.deepEqual(musterAt(pledged(0), 2), [], 'no pledge, no muster');
    assert.deepEqual(musterAt(pledged(2), 3), [], "another faction's screen");
    assert.deepEqual(musterAt(pledged(2), undefined), [], 'a keeper of no faction');
    const [muster] = musterAt(pledged(2), 2);
    assert.ok(muster, "the Lamplighters' screen, pledged to them");
    root.append(muster);
    assert.equal(findAll(root, 'ship-muster').length, 1);
  }));
