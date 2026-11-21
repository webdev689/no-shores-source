import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soundAway } from './audioAway.ts';
import { AudioHost } from './audioHost.ts';
import type { AudioOp, AudioReply } from './audioOps.ts';

/** A page's audio, enough of it to see what was made, set and called on it. */
class FakeParam {
  value = 0;
  readonly calls: unknown[][] = [];
  linearRampToValueAtTime(...args: unknown[]) {
    this.calls.push(['linearRampToValueAtTime', ...args]);
    return this;
  }
}
class FakeNode extends EventTarget {
  readonly kind: string;
  readonly gain = new FakeParam();
  readonly joined: unknown[] = [];
  started: number | null = null;
  buffer: unknown = null;
  constructor(kind: string) {
    super();
    this.kind = kind;
  }
  connect(target: unknown) {
    this.joined.push(target);
    return target;
  }
  start(when = 0) {
    this.started = when;
  }
}
class FakeBuffer {
  readonly data: Float32Array[];
  readonly sampleRate: number;
  constructor(channels: number, length: number, sampleRate: number) {
    this.data = Array.from({ length: channels }, () => new Float32Array(length));
    this.sampleRate = sampleRate;
  }
  get numberOfChannels() {
    return this.data.length;
  }
  getChannelData(channel: number) {
    return this.data[channel] ?? new Float32Array();
  }
  copyToChannel(source: Float32Array, channel: number) {
    this.data[channel]?.set(source);
  }
}
class FakeContext extends EventTarget {
  readonly destination = new FakeNode('destination');
  readonly listenerCalls: unknown[][] = [];
  readonly listener: object;
  constructor(params = true) {
    super();
    const calls = this.listenerCalls;
    const older = { setPosition: (...args: unknown[]) => calls.push(['setPosition', ...args]) };
    this.listener = params ? { ...older, positionX: new FakeParam() } : older;
  }
  readonly made: FakeNode[] = [];
  readonly sampleRate = 44_100;
  currentTime = 2;
  state: AudioContextState = 'running';
  createGain() {
    return this.add(new FakeNode('gain'));
  }
  createBufferSource() {
    return this.add(new FakeNode('source'));
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeBuffer(channels, length, rate);
  }
  decodeAudioData() {
    const buffer = new FakeBuffer(2, 3, 22_050);
    buffer.data[1]?.set([0.5, 0.25, 0]);
    return Promise.resolve(buffer);
  }
  resume() {
    return Promise.resolve();
  }
  private add(node: FakeNode) {
    this.made.push(node);
    return node;
  }
}

/** The worker's stand-ins and the page's host, each one's words reaching the other after the task they were said in,
 *  as two threads' do. */
function joined(listenerParams = true) {
  const page = new FakeContext(listenerParams);
  let answer: ((reply: AudioReply) => void) | null = null;
  const host = new AudioHost(
    (reply) => queueMicrotask(() => answer?.(reply)),
    () => page as unknown as AudioContext,
  );
  answer = soundAway((ops) => host.run(ops));
  host.wake();
  return page;
}

const settled = () => new Promise((done) => setTimeout(done, 0));

test("the game's sound is made on the page's audio: each node joined, each parameter set and each buffer sent", async () => {
  const page = joined();
  await settled();
  const audio = new AudioContext();
  assert.equal(audio.sampleRate, 44_100, 'the page says its rate');
  assert.equal(audio.state, 'running');
  const gain = new GainNode(audio, { gain: 0.5 });
  const source = audio.createBufferSource();
  const buffer = audio.createBuffer(1, 4, 44_100);
  buffer.getChannelData(0).set([0.1, 0.2, 0.3, 0.4]);
  source.buffer = buffer;
  source.connect(gain).connect(audio.destination);
  gain.gain.linearRampToValueAtTime(1, 3);
  let ended = 0;
  source.addEventListener('ended', () => ended++);
  source.start(2.5);
  const along = gain.gain.value;
  assert.ok(along >= 0.5 && along < 1, `a ramp reads where it stands now, not its end: ${along}`);
  await settled();
  const [madeGain, madeSource] = page.made;
  assert.equal(madeGain?.kind, 'gain');
  assert.equal(madeGain.gain.value, 0.5, "a constructor's options are set on the page's node");
  assert.deepEqual(madeGain.gain.calls, [['linearRampToValueAtTime', 1, 3]]);
  assert.equal(madeSource?.joined[0], madeGain);
  assert.equal(madeGain.joined[0], page.destination);
  assert.deepEqual((madeSource.buffer as FakeBuffer).data[0], Float32Array.from([0.1, 0.2, 0.3, 0.4]));
  assert.equal(madeSource.started, 2.5);
  madeSource.dispatchEvent(new Event('ended'));
  await settled();
  assert.equal(ended, 1, 'the page says when a sound ends');
});

test("the page's clock runs on in the worker while the page's audio runs, and never goes back", async () => {
  joined();
  await settled();
  const audio = new AudioContext();
  const first = audio.currentTime;
  assert.ok(first >= 2);
  await new Promise((done) => setTimeout(done, 20));
  assert.ok(audio.currentTime > first, 'it runs on between the times the page says it');
});

test('a sound decoded by the page is held there and its samples read in the worker', async () => {
  joined();
  await settled();
  const audio = new AudioContext();
  const decoded = await audio.decodeAudioData(new ArrayBuffer(8));
  assert.equal(decoded.numberOfChannels, 2);
  assert.equal(decoded.sampleRate, 22_050);
  assert.deepEqual(decoded.getChannelData(1), Float32Array.from([0.5, 0.25, 0]));
});

test('the context the game makes is an AudioContext, as the sound code asks before it plays a recording', async () => {
  joined();
  await settled();
  const audio = new AudioContext();
  assert.ok(audio instanceof AudioContext);
  assert.equal(new AudioContext(), audio, 'the page has one');
});

test("a parameter reads its node's default, and its value along a ramp, as a page's does", async () => {
  const page = joined();
  await settled();
  const audio = new AudioContext();
  const gain = audio.createGain();
  assert.equal(gain.gain.value, 1, "a gain's default");
  const now = audio.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + 10);
  const along = gain.gain.value;
  assert.ok(along >= 0 && along < 0.5, `just begun: ${along}`);
  void page;
});

test('a page listener without its position parameters is moved by its older calls', async () => {
  const page = joined(false);
  await settled();
  const audio = new AudioContext();
  assert.equal((audio.listener as unknown as { positionX?: unknown }).positionX, undefined);
  audio.listener.setPosition(1, 2, 3);
  await settled();
  assert.deepEqual(page.listenerCalls, [['setPosition', 1, 2, 3]]);
});

test('a page without Web Audio lets the press through, silent', () => {
  const host = new AudioHost(
    () => undefined,
    () => {
      throw new ReferenceError('AudioContext is not defined');
    },
  );
  assert.doesNotThrow(() => host.wake());
});

test('a page with no audio answers what the game waits on at once, so the game holds nothing for it', () => {
  const replies: unknown[] = [];
  const host = new AudioHost((reply) => replies.push(reply));
  const data = new ArrayBuffer(8);
  host.run([
    ['ended', 41],
    ['decode', 42, data],
  ] as unknown as AudioOp[]);
  assert.deepEqual(replies, [
    { kind: 'ended', id: 41 },
    { kind: 'decoded', id: 42, error: 'the page plays no sound' },
  ]);
});
