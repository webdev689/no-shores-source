import assert from 'node:assert/strict';
import { test } from 'node:test';
import { licenceOf, previewOf, resultsOf, titleOf } from './pages.mjs';

test('a search page gives each sound once, in its order, with its author', () => {
  const html = `<a href="/people/kwahmah_02/sounds/256116/">Click</a> <a href="/people/kwahmah_02/sounds/256116/">x</a>
    <a href="https://freesound.org/people/Breviceps/sounds/448081/">Pop</a> <a href="/people/../sounds/1/">bad</a>`;
  assert.deepEqual(resultsOf(html), [
    { author: 'kwahmah_02', id: '256116' },
    { author: 'Breviceps', id: '448081' },
  ]);
});

test('only CC0 and Attribution are allowed', () => {
  assert.equal(licenceOf('<a href="http://creativecommons.org/publicdomain/zero/1.0/">'), 'CC0');
  assert.equal(licenceOf('<a href="https://creativecommons.org/licenses/by/4.0/">'), 'CC-BY');
  assert.equal(licenceOf('<a href="https://creativecommons.org/licenses/by-nc/4.0/">'), null);
  assert.equal(licenceOf('<a href="https://creativecommons.org/licenses/sampling+/1.0/">'), null);
  assert.equal(licenceOf('no licence here'), null);
});

test("a sound's preview is its own, on Freesound's CDN", () => {
  const html = `<meta property="og:audio" content="https://cdn.freesound.org/previews/256/256116_3263906-hq.mp3">
    <a href="https://cdn.freesound.org/previews/1/1999_3-hq.mp3">another</a>`;
  assert.equal(previewOf(html, '256116'), 'https://cdn.freesound.org/previews/256/256116_3263906-hq.mp3');
  assert.equal(previewOf(html, '448081'), null);
});

test("a sound's title is read plainly", () => {
  assert.equal(titleOf('<meta property="og:title" content="Click &amp; Pop by kwahmah_02">', '1'), 'Click & Pop');
  assert.equal(titleOf('<title>UI Tick - Freesound</title>', '2'), 'UI Tick');
  assert.equal(titleOf('', '3'), 'Sound 3');
});
