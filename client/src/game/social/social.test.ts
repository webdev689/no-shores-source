import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HELP } from '../../../../server/accounts/chatLaw.ts';
import type { Child } from '../../ui/node.ts';
import { Stack } from '../../ui/stack.ts';
import { fakeInterface, wordsIn } from '../../ui/uiForTests.ts';
import { fakePage } from '../pageForTests.ts';
import { chatOpen, openChat, startSocial } from './social.ts';

/** The chat of a page playing alone, its field open: each line typed and said, and what the band shows after. */
function chat() {
  fakePage();
  Object.assign(globalThis, { devicePixelRatio: 1 });
  const stack = new Stack();
  startSocial(
    stack,
    null,
    async () => null,
    () => null,
  );
  const { ui, step } = fakeInterface(1280, 800);
  let built: Child = null;
  const frame = (events: Parameters<typeof step>[1] = []) => step(() => (built = stack.node(ui)), events);
  const say = (typed: string) => {
    if (!chatOpen()) {
      openChat();
      frame();
    }
    // A line the chat cannot say stays in the field; each here is typed afresh.
    ui.setFieldText('chat-field', '');
    frame([{ kind: 'text', text: typed }]);
    frame([{ kind: 'key', key: 'Enter' }]);
    frame();
  };
  return { say, shown: () => wordsIn(built).join(' | '), open: chatOpen };
}

test('what is typed is answered: the commands listed, one that is none, /r with no one, a bad name, and alone', () => {
  const { say, shown, open } = chat();
  say('/help');
  assert.ok(shown().includes(HELP[0] ?? ''), 'the commands, listed');
  assert.equal(open(), true, 'the field stays open');
  say('/dance');
  assert.match(shown(), /There is no \/dance command/);
  say('/r hello');
  assert.match(shown(), /No one has whispered to you yet\./);
  say('/w two words');
  say('/w no-one hi');
  assert.match(shown(), /no-one is no player's name\./);
  say('hello');
  assert.match(shown(), /You are playing alone: no one hears the chat\./);
});
