import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAll, onFakePage } from '../combat/page.test.ts';
import { layToasts } from './hud.ts';

test('a toast already showing stays where it is as another comes, so only the new one rises in', () =>
  onFakePage((root) => {
    const toast = (...texts: string[]) => layToasts(root, texts);
    toast('The Brig is boarded!');
    const [first] = findAll(root, 'toast');
    assert.ok(first, 'shown');
    let moved = 0;
    const remove = first.remove.bind(first);
    first.remove = () => {
      moved += 1;
      remove();
    };
    toast('The Brig is boarded!', 'You will rise at the last checkpoint.');
    const shown = findAll(root, 'toast');
    assert.equal(shown.length, 2);
    assert.equal(shown[0], first, 'the first kept, first');
    assert.equal(moved, 0, 'never taken out and put back');
    toast('You will rise at the last checkpoint.');
    assert.equal(moved, 1, 'gone once it is no longer said');
    assert.equal(findAll(root, 'toast').length, 1);
  }));
