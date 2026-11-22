import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChatLine } from '../../../../server/accounts/chatLaw.ts';
import { fakeInterface, wordsIn } from '../../ui/uiForTests.ts';
import type { Child } from '../../ui/node.ts';
import { ChatLog } from './chatLog.ts';
import { ChatPanel, type Relation, lineSpans } from './chatPanel.ts';

const relation = (name: string): Relation => (name === 'Ada' ? 'mine' : 'other');
const read = (line: ChatLine) =>
  lineSpans({ key: 0, at: 0, line, told: '' }, relation)
    .map((span) => span.words)
    .join('');

test('a line reads as its channel says it: World and the water marked, a Whisper to or from', () => {
  assert.equal(read({ channel: 'local', from: 'Ben', text: 'hi' }), '[Ben]: hi');
  assert.equal(read({ channel: 'world', from: 'Ben', text: 'hi' }), '[World] [Ben]: hi');
  const region: ChatLine = { channel: 'region', from: 'Ben', region: 'The Lantern Sea', text: 'ahoy' };
  assert.equal(read(region), '[Lantern Sea] [Ben]: ahoy');
  assert.equal(read({ channel: 'whisper', from: 'Ben', to: 'Ada', text: 'psst' }), '[Ben] whispers: psst');
  assert.equal(read({ channel: 'whisper', from: 'Ada', to: 'Ben', text: 'yes' }), 'To [Ben]: yes');
});

test('at sea Region stands in Local’s place, and Local in Region’s on land', () => {
  const panel = new ChatPanel();
  panel.place(true, 'The Lantern Sea');
  assert.equal(panel.channel, 'region');
  panel.channel = 'world';
  panel.place(false, null);
  assert.equal(panel.channel, 'world', 'World stays World');
  panel.channel = 'region';
  panel.place(false, null);
  assert.equal(panel.channel, 'local');
});

test('the up arrow reads back a band’s worth of lines, and the down arrow on to the newest again', () => {
  const { ui, step } = fakeInterface(1280, 400);
  const log = new ChatLog();
  for (let line = 1; line <= 30; line++) log.told(`line ${line}`, 0);
  const panel = new ChatPanel();
  let built: Child = null;
  const frame = (events: Parameters<typeof step>[1] = []) =>
    step(
      () => ({
        width: 'grow',
        height: 'grow',
        children: [(built = panel.node(ui, log, 0, ui.size, relation, () => 'keep'))],
      }),
      events,
    );
  panel.show();
  frame();
  frame();
  const shown = () => wordsIn(built).filter((words) => words.startsWith('line '));
  const newest = shown();
  assert.equal(newest.at(-1), 'line 30');
  frame([{ kind: 'key', key: 'ArrowUp' }]);
  frame();
  assert.equal(shown().at(-1), `line ${30 - newest.length}`, 'one band back');
  frame([{ kind: 'key', key: 'ArrowDown' }]);
  frame();
  assert.deepEqual(shown(), newest, 'and on to the newest');
  log.told('line 31', 0);
  frame();
  assert.equal(shown().at(-1), 'line 31', 'following the newest again');
});
