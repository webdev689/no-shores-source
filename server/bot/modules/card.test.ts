import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deflateSync } from 'node:zlib';
import { GUILD, OWNER, bodyOf, panelRequest, signInPanel, standWorker } from '../botForTests.ts';
import { CARD_PATH, cardUrl, cardWords } from './card.ts';
import { CARD_TALL, CARD_WIDE, drawCard, fitted } from './cardDrawing.ts';
import { drawable, wordsWide } from './cardLetters.ts';
import { decodePng, encodePng } from './png.ts';
import { welcomeModule } from './welcome.ts';

const WORDS = {
  title: 'Welcome',
  name: 'Ann',
  under: 'Member #4',
  avatar: 'https://cdn.discordapp.com/avatars/1/a.png',
  accent: '#d9a33c',
  background: '#0e1a2e',
};
const partsOf = (address: string) => {
  const url = new URL(address);
  return [url.searchParams.get('p') ?? '', url.searchParams.get('s') ?? ''] as const;
};
/** A grey picture, every pixel solid. */
const grey = (width = 4, height = 4) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(200);
  for (let alpha = 3; alpha < data.length; alpha += 4) data[alpha] = 255;
  return encodePng({ width, height, data });
};

test("cards: an address is signed with the bot's own key; a changed word or another key is refused", async () => {
  const vars = { BOT_URL: 'https://bot.example', DISCORD_BOT_TOKEN: 'token-a' };
  const [packed, signature] = partsOf(await cardUrl(vars, WORDS));
  assert.equal((await cardWords(vars, packed, signature))?.name, 'Ann');
  assert.equal(await cardWords({ ...vars, DISCORD_BOT_TOKEN: 'token-b' }, packed, signature), null);
  assert.equal(await cardWords(vars, `${packed.slice(0, -2)}AA`, signature), null);
  const [strangePacked, strangeSigned] = partsOf(
    await cardUrl(vars, { name: 'Ann', avatar: 'https://elsewhere.example/a.png', accent: 'red' }),
  );
  const read = await cardWords(vars, strangePacked, strangeSigned);
  assert.equal(read?.avatar, '', 'the card fetches avatars from Discord alone');
  assert.equal(read?.accent, '#d9a33c');
  assert.equal(await cardUrl({ ...vars, BOT_URL: 'http://bot.example' }, WORDS), '', 'only an https address');
  assert.equal(await cardUrl({ BOT_URL: 'https://bot.example' }, WORDS), '', 'no key, no card');
});

test("cards: signed with the deploy's own key where it is set, so a rotated bot token breaks no card posted", async () => {
  const before = { BOT_URL: 'https://bot.example', DISCORD_BOT_TOKEN: 'token-a', CARD_SIGNING_KEY: 'k'.repeat(64) };
  const [packed, signature] = partsOf(await cardUrl(before, WORDS));
  assert.equal((await cardWords({ ...before, DISCORD_BOT_TOKEN: 'token-b' }, packed, signature))?.name, 'Ann');
  assert.equal(await cardWords({ ...before, CARD_SIGNING_KEY: 'j'.repeat(64) }, packed, signature), null);
});

test('cards: drawn as a PNG of the card size, the avatar read from Discord; a bad avatar draws the initial', async () => {
  const avatar = await grey(16, 16);
  assert.equal((await decodePng(avatar))?.width, 16, 'the reader reads what the writer writes');
  const asked: string[] = [];
  const fetchPicture = async (url: string) => (asked.push(url), new Response(avatar));
  const bytes = await drawCard(
    { ...WORDS, avatar: 'https://cdn.discordapp.com/avatars/1/a.webp?size=256' },
    fetchPicture,
  );
  const read = await decodePng(bytes);
  assert.deepEqual([read?.width, read?.height], [CARD_WIDE, CARD_TALL]);
  const middle = (168 + 160 * CARD_WIDE) * 4;
  assert.deepEqual([...(read?.data.subarray(middle, middle + 3) ?? [])], [200, 200, 200], 'the avatar fills the ring');
  assert.deepEqual(asked, ['https://cdn.discordapp.com/avatars/1/a.png?size=256'], 'asked for as a PNG');
  const plain = await drawCard({ ...WORDS, title: '', name: '漢字', under: '' }, async () => new Response('no'));
  assert.equal((await decodePng(plain))?.width, CARD_WIDE, 'another script and an unreadable avatar still draw');
  assert.equal(await decodePng(new Uint8Array([1, 2, 3])), null);
});

test('cards: words the letters do not draw are left out, and a long name is shrunk, then cut short', () => {
  assert.equal(drawable('Ann 漢字 Bo'), 'Ann Bo');
  assert.deepEqual(fitted('Ann', [8, 4], 600), { text: 'Ann', scale: 8 });
  assert.equal(fitted('A'.repeat(20), [8, 4], 600).scale, 4);
  const long = fitted('A'.repeat(80), [8, 4], 600);
  assert.ok(long.text.endsWith('...') && wordsWide(long.text, 4) <= 600, long.text);
});

test('cards: a PNG that inflates past the size its header promises is refused before it fills memory', async () => {
  const chunk = (kind: string, body: Uint8Array) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'ascii');
    Buffer.from(body).copy(out, 8);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const bomb = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(4 * 1024 * 1024))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  assert.equal(await decodePng(new Uint8Array(bomb)), null);
});

test('cards: the Worker serves a signed card for a year and refuses one it did not sign', async () => {
  const bot = await standWorker({ modules: [welcomeModule] });
  const url = await cardUrl(bot.env, { ...WORDS, avatar: '' });
  assert.ok(url.startsWith(`https://bot.example.workers.dev${CARD_PATH}?`));
  const served = await bot.call(new Request(url));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.match(String(served.headers.get('cache-control')), /immutable/);
  assert.equal((await decodePng(new Uint8Array(await served.arrayBuffer())))?.width, CARD_WIDE);
  const forged = new URL(url);
  forged.searchParams.set('s', 'AAAAAAAAAAAAAAAAAAAAAA');
  assert.equal((await bot.call(new Request(forged))).status, 404);
});

test('cards: the preview handed back by a save is drawn in the settings just saved', async () => {
  const bot = await standWorker({ modules: [welcomeModule] });
  const token = await signInPanel(bot, OWNER);
  const page = `/v1/panel/g/${GUILD}/m/welcome`;
  const got = (await bodyOf(await bot.call(panelRequest(token, page)))) as {
    config: Record<string, Record<string, unknown>>;
    rev: number;
    preview: { cardUrl: string };
  };
  const accentOf = async (address: string) => (await cardWords(bot.env, ...partsOf(address)))?.accent;
  assert.equal(await accentOf(got.preview.cardUrl), '#d9a33c');
  const config = { ...got.config, card: { ...got.config.card, accent: '#336699' } };
  const body = JSON.stringify({ config, rev: got.rev, enabled: true });
  const saved = (await bodyOf(await bot.call(panelRequest(token, page, { method: 'PUT', body })))) as {
    preview: { cardUrl: string };
  };
  assert.equal(await accentOf(saved.preview.cardUrl), '#336699');
});
