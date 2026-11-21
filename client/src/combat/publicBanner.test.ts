import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findAll, onFakePage } from './page.test.ts';
import { type Banner, PublicBanner, StoreBars } from './publicBanner.ts';

const shown: Banner = {
  tone: 'running',
  kicker: 'Public event',
  title: 'The Fissure',
  place: 'The High Downs',
  clock: '1:00',
  objective: 'Carry shards to the fissure to seal it',
  bar: { share: 0.25, label: '3 / 12 shards' },
  heroic: { text: 'Break the growth', clock: '0:10', met: false },
  bonus: { text: 'Bonus: seal it with half the time left', state: 'lost' },
};

test('the banner shows the event’s words, its heroic window and its bonus, in its tone, and slides in at a beat', () =>
  onFakePage((root) => {
    const banner = new PublicBanner(root);
    assert.equal(banner.root.hidden, true, 'hidden with no event');
    banner.update(shown, 0.016, 'begun');
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

test('the banner reads out its beats on a line of their own, and never its ticking clocks', () =>
  onFakePage((root) => {
    const banner = new PublicBanner(root);
    banner.update(shown, 0.016, 'begun');
    const attributes = (node: unknown) => (node as { attributes: Record<string, string> }).attributes;
    assert.equal(attributes(banner.root)['aria-atomic'], 'false');
    for (const name of ['pb-clock', 'pb-heroic-clock'])
      assert.equal(attributes(findAll(root, name)[0])['aria-hidden'], 'true', name);
    const said = findAll(root, 'pb-said')[0];
    assert.equal(said?.textContent, 'Public event: The Fissure. Carry shards to the fissure to seal it');
    banner.update({ ...shown, clock: '0:59' }, 0.016);
    assert.equal(said?.textContent, 'Public event: The Fissure. Carry shards to the fissure to seal it', 'kept');
  }));
