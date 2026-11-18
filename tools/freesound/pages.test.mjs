import assert from 'node:assert/strict';
import { test } from 'node:test';
import { licenceLinkOf, licenceOf, previewOf, resultsOf, titleOf } from './pages.mjs';

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
  assert.equal(
    titleOf('<meta property="og:title" content="Click &amp; Pop by kwahmah_02">', '1', 'kwahmah_02'),
    'Click & Pop',
  );
  // Only the author's own name is taken off, never a title's last words.
  assert.equal(titleOf('<meta property="og:title" content="Drive by car by someone">', '4', 'someone'), 'Drive by car');
  assert.equal(titleOf('<title>Freesound - Drive by car</title>', '5', 'someone'), 'Drive by car');
  assert.equal(titleOf('<title>UI Tick - Freesound</title>', '2'), 'UI Tick');
  assert.equal(titleOf('', '3'), 'Sound 3');
});

test("a credit cites the licence's own address and version", () => {
  assert.deepEqual(licenceLinkOf('<a href="https://creativecommons.org/licenses/by/4.0/">'), {
    name: 'CC-BY',
    url: 'https://creativecommons.org/licenses/by/4.0/',
  });
  assert.deepEqual(licenceLinkOf('<a href="http://creativecommons.org/publicdomain/zero/1.0/">'), {
    name: 'CC0',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  });
  assert.equal(licenceLinkOf('<a href="https://creativecommons.org/licenses/by-nc/3.0/">'), null);
});

test('a page that links more than one licence gives none, whichever comes first', () => {
  const words = '<p>Mine is <a href="https://creativecommons.org/publicdomain/zero/1.0/">free</a></p>';
  const box = '<a href="https://creativecommons.org/licenses/by-nc/4.0/">Attribution NonCommercial</a>';
  assert.equal(licenceLinkOf(words + box), null);
  assert.equal(licenceLinkOf(box + words), null);
  // The same licence linked twice is still that licence.
  const twice = '<a href="https://creativecommons.org/licenses/by/4.0/">';
  assert.equal(licenceOf(twice + twice), 'CC-BY');
});
