// The page's side of the game's sound: its one audio context, made and woken by the player's first press or key, and
// every call the game's worker sends (`audioAway.ts`) carried out on it, each number held for what it stands for
// until the worker lets it go.
import {
  type AudioOp,
  type AudioReply,
  CONTEXT,
  DESTINATION,
  LISTENER,
  MAKERS,
  WRAPPED,
  type Wrapped,
} from './audioOps.ts';

type Reply = (reply: AudioReply, transfer?: Transferable[]) => void;

export class AudioHost {
  private audio: AudioContext | null = null;
  private silent = false;
  private readonly held = new Map<number, unknown>();
  private readonly reply: Reply;
  private readonly made: () => AudioContext;

  constructor(reply: Reply, made: () => AudioContext = () => new AudioContext()) {
    [this.reply, this.made] = [reply, made];
  }

  /** Makes the context on the player's press or key, as a browser lets sound start only then, and wakes it again on a
   *  later one, should the browser have stopped it; says the clock either way. */
  wake(): void {
    if (!this.audio) {
      let audio: AudioContext;
      try {
        audio = this.made();
      } catch (error) {
        // A browser without Web Audio plays the game silent: the press that asked still reaches the game.
        if (!this.silent) console.warn('the game plays without sound:', error);
        this.silent = true;
        return;
      }
      this.audio = audio;
      this.held.set(CONTEXT, audio);
      this.held.set(DESTINATION, audio.destination);
      this.held.set(LISTENER, audio.listener);
      audio.addEventListener('statechange', () => this.clock());
    }
    if (this.audio.state !== 'running') void this.audio.resume();
    this.clock();
  }

  /** The clock as it stands now. */
  clock(): void {
    const audio = this.audio;
    if (!audio) return;
    const now = performance.timeOrigin + performance.now();
    const listenerParams = 'positionX' in audio.listener;
    this.reply({
      kind: 'clock',
      time: audio.currentTime,
      at: now,
      state: audio.state,
      ...{ sampleRate: audio.sampleRate, listenerParams },
    });
  }

  run(ops: readonly AudioOp[]): void {
    const audio = this.audio;
    if (!audio) {
      // Nothing sounds without a context, so what the game waits on is answered at once, and it holds nothing for it.
      for (const told of ops) this.unanswered(told);
      return;
    }
    for (const told of ops) {
      try {
        this.one(audio, told);
      } catch (error) {
        console.warn('a sound could not be made:', told[0], error);
      }
    }
    this.clock();
  }

  /** What the game waits on, answered with no context to make it on: a sound's end, a recording's decoding. */
  private unanswered(told: AudioOp): void {
    if (told[0] === 'ended') this.reply({ kind: 'ended', id: told[1] });
    else if (told[0] === 'decode') this.reply({ kind: 'decoded', id: told[1], error: 'the page plays no sound' });
  }

  private one(audio: AudioContext, told: AudioOp): void {
    switch (told[0]) {
      case 'make': {
        const [, id, how, args] = told;
        if (!MAKERS.has(how)) throw new Error(`no maker ${how}`);
        const maker = (audio as unknown as Record<string, (...args: unknown[]) => unknown>)[how];
        this.held.set(
          id,
          maker?.apply(
            audio,
            args.map((arg) => this.unwrap(arg)),
          ),
        );
        return;
      }
      case 'param': {
        const [, id, owner, name] = told;
        this.held.set(id, (this.held.get(owner) as Record<string, unknown> | undefined)?.[name]);
        return;
      }
      case 'set': {
        const [, id, name, value] = told;
        const target = this.held.get(id) as Record<string, unknown> | undefined;
        if (target) target[name] = this.unwrap(value);
        return;
      }
      case 'call': {
        const [, id, method, args] = told;
        const target = this.held.get(id) as Record<string, unknown> | undefined;
        const called = target?.[method];
        if (typeof called !== 'function') return;
        const answer: unknown = called.apply(
          target,
          args.map((arg) => this.unwrap(arg)),
        );
        if (answer instanceof Promise) answer.catch((error: unknown) => console.warn(`${method}:`, error));
        return;
      }
      case 'buffer': {
        const [, id, channels, sampleRate] = told;
        const buffer = audio.createBuffer(
          Math.max(1, channels.length),
          Math.max(1, channels[0]?.length ?? 0),
          sampleRate,
        );
        channels.forEach((data, channel) => buffer.copyToChannel(data as Float32Array<ArrayBuffer>, channel));
        this.held.set(id, buffer);
        return;
      }
      case 'decode': {
        const [, id, data] = told;
        audio.decodeAudioData(data).then(
          (buffer) => {
            this.held.set(id, buffer);
            const channels = Array.from({ length: buffer.numberOfChannels }, (unused, channel) =>
              buffer.getChannelData(channel).slice(),
            );
            const transfer = channels.map((each) => each.buffer);
            this.reply({ kind: 'decoded', id, channels, sampleRate: buffer.sampleRate }, transfer);
          },
          (error: unknown) => this.reply({ kind: 'decoded', id, error: String(error) }),
        );
        return;
      }
      case 'ended': {
        const [, id] = told;
        const node = this.held.get(id);
        if (node instanceof EventTarget)
          node.addEventListener('ended', () => this.reply({ kind: 'ended', id }), { once: true });
        else this.reply({ kind: 'ended', id });
        return;
      }
      case 'forget':
        this.held.delete(told[1]);
        return;
    }
  }

  /** What the worker sent, its numbers put back as what they stand for. */
  private unwrap(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((each) => this.unwrap(each));
    if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
    if (WRAPPED in value) return this.held.get((value as Wrapped)[WRAPPED]);
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, this.unwrap(each)]));
  }
}
