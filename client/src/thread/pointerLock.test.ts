import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PointerLock } from './pointerLock.ts';

/** A page whose lock is granted or refused as `grants` says, the lock it holds, and what was asked of it. */
function pageWith(grants: boolean) {
  const asked: string[] = [];
  const page = {
    pointerLockElement: null as Element | null,
    exitPointerLock() {
      asked.push('exit');
      page.pointerLockElement = null;
    },
  };
  const canvas = {
    requestPointerLock: () => {
      asked.push('request');
      return grants ? Promise.resolve() : Promise.reject(new DOMException('no press', 'NotAllowedError'));
    },
  } as unknown as Element & { requestPointerLock(): Promise<void> };
  const grant = () => (page.pointerLockElement = canvas);
  return { asked, page, canvas, grant };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a lock granted after the game let go of it is let go at once', async () => {
  const { asked, page, canvas, grant } = pageWith(true);
  const lock = new PointerLock(canvas, page, null);
  lock.want(true);
  lock.want(false);
  await settled();
  grant();
  assert.equal(lock.changed(), false);
  assert.deepEqual(asked, ['request', 'exit']);
  assert.equal(page.pointerLockElement, null);
});

test('a lock the page is refused is asked of the shell, whose press takes it only while the game wants it', async () => {
  const { asked, page, canvas, grant } = pageWith(false);
  let shellAsked = 0;
  const lock = new PointerLock(canvas, page, () => shellAsked++);
  lock.want(true);
  await settled();
  assert.equal(shellAsked, 1);
  lock.again();
  await settled();
  assert.equal(shellAsked, 1, "the shell's own press is not asked of it again");
  grant();
  assert.equal(lock.changed(), true);
  lock.again();
  lock.want(false);
  lock.again();
  await settled();
  assert.deepEqual(asked, ['request', 'request', 'exit']);
});

test('in a browser, with no shell, a refused lock asks nothing more', async () => {
  const { asked, page, canvas } = pageWith(false);
  const lock = new PointerLock(canvas, page, null);
  lock.want(true);
  await settled();
  assert.deepEqual(asked, ['request']);
  assert.equal(lock.held, false);
});
