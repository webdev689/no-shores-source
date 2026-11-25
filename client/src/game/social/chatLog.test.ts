import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LINES_KEPT, PEEK_LINES, PEEK_MS } from '../../../../server/accounts/chatLaw.ts';
import { ChatLog, heardLocally, peekShare } from './chatLog.ts';

test('a line shows whole for three quarters of its time, then fades to nothing', () => {
  assert.equal(peekShare(0), 1);
  assert.equal(peekShare(PEEK_MS * 0.75), 1);
  assert.equal(peekShare(PEEK_MS * 0.875), 0.5);
  assert.equal(peekShare(PEEK_MS), 0);
});

test("a Local line is kept from those near enough and the player's own; a Whisper is answered by /r", () => {
  const log = new ChatLog();
  const near = (name: string) => name === 'Ben';
  log.heard({ channel: 'local', from: 'Ben', text: 'near' }, 0, 'Ada', near);
  log.heard({ channel: 'local', from: 'Cal', text: 'far' }, 0, 'Ada', near);
  log.heard({ channel: 'local', from: 'Ada', text: 'mine' }, 0, 'Ada', near);
  log.heard({ channel: 'world', from: 'Cal', text: 'world' }, 0, 'Ada', near);
  assert.deepEqual(
    log.lines.map((logged) => logged.line?.text),
    ['near', 'mine', 'world'],
  );
  log.heard({ channel: 'whisper', from: 'Ada', to: 'Dee', text: 'sent' }, 0, 'Ada', near);
  assert.equal(log.lastWhisperer, null, "the player's own Whisper is no one's to answer");
  log.heard({ channel: 'whisper', from: 'Dee', to: 'Ada', text: 'psst' }, 0, 'Ada', near);
  assert.equal(log.lastWhisperer, 'Dee');
});

test('shut, the newest five show while young; the log keeps the newest two hundred', () => {
  const log = new ChatLog();
  for (let index = 0; index < LINES_KEPT + 10; index++) log.told(`line ${index}`, index * 100);
  assert.equal(log.lines.length, LINES_KEPT);
  assert.equal(log.lines[0]?.told, 'line 10');
  const now = (LINES_KEPT + 9) * 100;
  assert.deepEqual(
    log.peek(now).map((logged) => logged.told),
    Array.from({ length: PEEK_LINES }, (unused, index) => `line ${LINES_KEPT + 5 + index}`),
  );
  assert.deepEqual(log.peek(now + PEEK_MS * 2), [], 'gone once old');
});

test('Local is heard within earshot, and in a Breach’s run from anywhere in it', () => {
  assert.ok(heardLocally([10, 0, 0], [0, 0, 0], false));
  assert.ok(!heardLocally([280, 0, 0], [0, 0, 0], false), 'a shore far from the court, out of earshot');
  assert.ok(heardLocally([280, 0, 0], [0, 0, 0], true), 'in a run, the court calls to its taken');
  assert.ok(!heardLocally(undefined, [0, 0, 0], true), 'one not in the room is never heard');
});
