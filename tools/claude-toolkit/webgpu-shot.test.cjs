// The picture driver's guards, without a browser: `node --test tools/claude-toolkit/webgpu-shot.test.cjs`.
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { servesThisCheckout, takeLock } = require('./webgpu-shot.cjs');

test('a lock held by a live run is refused, and one left by a dead run is taken over', () => {
  const lock = join(mkdtempSync(join(tmpdir(), 'shot-lock-')), 'lock');
  writeFileSync(lock, String(process.ppid));
  assert.throws(() => takeLock(lock), /another picture run/);
  // No process has pid 2^22 + 1 here: Linux's pids stop at 2^22.
  writeFileSync(lock, String(2 ** 22 + 1));
  takeLock(lock);
  assert.equal(readFileSync(lock, 'utf8'), String(process.pid));
});

/** A server answering each path from `pages`, 403 for any other. */
async function serving(pages) {
  const server = createServer((request, response) => {
    const page = pages[request.url];
    response.writeHead(page === undefined ? 403 : 200).end(page ?? '');
  });
  await new Promise((up) => server.listen(0, '127.0.0.1', up));
  return { server, url: `http://127.0.0.1:${server.address().port}/?at=x` };
}

test('a dev server is this checkout\'s when it serves this checkout\'s files under /@fs/, and only then', async () => {
  const top = mkdtempSync(join(tmpdir(), 'shot-top-'));
  const { server, url } = await serving({ '/?at=x': '<script src="/@vite/client">', [`/@fs${top}/package.json`]: '{}' });
  try {
    assert.equal(await servesThisCheckout(url, top), true);
    assert.equal(await servesThisCheckout(url, `${top}-other`), false);
  } finally {
    server.close();
  }
});

test('a built page is this checkout\'s when its hashed script is in this checkout\'s dist/', async () => {
  const top = mkdtempSync(join(tmpdir(), 'shot-top-'));
  mkdirSync(join(top, 'dist', 'assets'), { recursive: true });
  writeFileSync(join(top, 'dist', 'assets', 'index-abc.js'), '');
  const page = '<script type="module" crossorigin src="/no-shores/assets/index-abc.js"></script>';
  const { server, url } = await serving({ '/?at=x': page });
  try {
    assert.equal(await servesThisCheckout(url, top), true);
    assert.equal(await servesThisCheckout(url, mkdtempSync(join(tmpdir(), 'shot-other-'))), false);
  } finally {
    server.close();
  }
  assert.equal(await servesThisCheckout('http://127.0.0.1:9/', top), true, 'a server not up is left to the load');
});
