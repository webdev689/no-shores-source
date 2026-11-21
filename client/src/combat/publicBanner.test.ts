import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bannerOf } from '../game/publicLaw.ts';
import type { PublicEvent } from '../network/publicMessages.ts';
import { findAll, onFakePage } from './page.test.ts';
import { PublicBanner, StoreBars } from './publicBanner.ts';

const event: PublicEvent = {
  kind: 1,
  phase: 1,
  ground: [0, 0, 0],
  radius: 25,
  ticksLeft: 3600,
  nextKind: 2,
  nextGround: [0, 0, 0],
  nextTicks: 0,
  stage: 1,
  stages: 2,
  progress: 3,
  needed: 12,
  heroic: 1,
  heroicTicks: 600,
  bonus: false,
  marks: [],
};

test('the banner shows the event’s words, its heroic window and its bonus, in its tone, and slides in at a beat', () =>
  onFakePage((root) => {
    const banner = new PublicBanner(root);
    assert.equal(banner.root.hidden, true, 'hidden with no event');
    banner.update(bannerOf(event, 'saltgrass-downs'), 0.016, 'begun');
    const text = (name: string) => findAll(root, name)[0]?.textContent;
    assert.equal(banner.root.hidden, false);
    assert.equal(text('pb-title'), 'The Fissure');
    assert.equal(text('pb-clock'), '1:00');
    assert.equal(text('pb-bar-label'), '3 / 12 shards');
    assert.equal(text('pb-heroic-text'), 'Break the growth');
    assert.equal(text('pb-heroic-clock'), '0:10');
    assert.equal(findAll(root, 'pb-bonus')[0]?.dataset.state, 'lost');
    assert.equal(banner.root.dataset.tone, 'running');
    assert.equal(banner.root.dataset.beat, 'begun');
    assert.ok(banner.root.classList.contains('beat'));
    banner.update(null, 0.016);
    assert.equal(banner.root.hidden, true);
  }));

test('a store’s bar stands over it while on the screen, and hides off it', () =>
  onFakePage((root) => {
    const bars = new StoreBars(root);
    bars.update(
      [
        { at: [0, 0, 0], share: 0.5 },
        { at: [9, 0, 0], share: 0 },
      ],
      (point) => (point[0] > 5 ? null : { x: 100, y: 50 }),
      0.016,
    );
    const [shown, off] = findAll(root, 'store-bar');
    assert.equal(shown?.hidden, false);
    assert.equal(shown?.style.transform, 'translate(100px, 50px)');
    assert.equal(off?.hidden, true);
  }));
