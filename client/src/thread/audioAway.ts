// The game's sound as its worker makes it. A worker has no Web Audio, so this stands in for it: every context, node,
// parameter and buffer the game makes is a number the page keeps, and every call on one is sent to the page with the
// rest of its task's (`AudioHost` carries them out there, in the page's own audio). The game's sound code runs here
// unchanged. What it reads back is each parameter where its course stands on the page's clock (run on from what the
// page last said), the context as the page's (one, an AudioContext), and the samples it filled or the page decoded.
import { ParamCourse, paramDefault } from './paramCourse.ts';
import {
  type AudioOp,
  type AudioReply,
  AUDIO_PARAMS,
  CONTEXT,
  DESTINATION,
  LISTENER,
  WRAPPED,
  type Wrapped,
} from './audioOps.ts';

type Send = (ops: AudioOp[], transfer: Transferable[]) => void;

/** One frame of the stand-ins' talk with the page: the calls waiting to go, and what each number stands for here. */
class Link {
  private ops: AudioOp[] = [];
  private transfer: Transferable[] = [];
  private next = LISTENER + 1;
  /** The page's clock as it last said, its state, and its rate. */
  heard = { time: 0, at: 0, state: 'suspended' as AudioContextState, sampleRate: 48_000, listenerParams: true };
  /** Stand-ins waiting on the page: for their end, or for a buffer's decoding. */
  readonly ending = new Map<number, StandIn>();
  readonly decoding = new Map<number, (buffer: StandBuffer | Error) => void>();
  private readonly forgotten = new FinalizationRegistry<number>((id) => this.say(['forget', id]));
  private readonly send: Send;

  constructor(send: Send) {
    this.send = send;
  }

  /** A number for a new stand-in. */
  fresh(): number {
    return this.next++;
  }

  /** Once the game lets go of `held`, the page lets go of what it stands for. */
  watch(held: object, id: number): void {
    this.forgotten.register(held, id);
  }

  say(told: AudioOp, transfer: readonly Transferable[] = []): void {
    if (this.ops.length === 0) queueMicrotask(() => this.flush());
    this.ops.push(told);
    this.transfer.push(...transfer);
  }

  private flush(): void {
    const [ops, transfer] = [this.ops, this.transfer];
    [this.ops, this.transfer] = [[], []];
    if (ops.length > 0) this.send(ops, transfer);
  }
}

let link: Link | null = null;

/** Whatever the page keeps a number for. */
abstract class StandIn extends EventTarget {
  readonly id: number;
  constructor(id: number) {
    super();
    this.id = id;
  }
  /** Sent ahead of its first use, where it has its own contents to send. */
  ship(): void {}
}

/** A value as the page reads it: a stand-in as its number, the rest as it is. */
function wrap(value: unknown): unknown {
  if (value instanceof StandIn) {
    value.ship();
    return { [WRAPPED]: value.id } satisfies Wrapped;
  }
  if (Array.isArray(value)) return value.map(wrap);
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, each]) => [key, wrap(each)]));
  return value;
}

const call = (id: number, method: string, args: readonly unknown[]) =>
  link?.say(['call', id, method, args.filter((arg) => arg !== undefined).map(wrap)]);

class StandParam extends StandIn {
  private readonly course: ParamCourse;
  private readonly clock: () => number;

  constructor(id: number, start: number, clock: () => number) {
    super(id);
    [this.course, this.clock] = [new ParamCourse(start), clock];
  }
  /** The value the page's parameter holds now, along whatever is scheduled. */
  get value(): number {
    return this.course.valueAt(this.clock());
  }
  /** As a page's: the value set from now on. */
  set value(value: number) {
    const now = this.clock();
    this.course.add({ kind: 'set', time: now, value }, now);
    link?.say(['set', this.id, 'value', value]);
  }
  private scheduled(method: string, args: unknown[]): this {
    call(this.id, method, args);
    return this;
  }
  setValueAtTime(value: number, when: number): this {
    this.course.add({ kind: 'set', time: when, value }, this.clock());
    return this.scheduled('setValueAtTime', [value, when]);
  }
  linearRampToValueAtTime(value: number, when: number): this {
    this.course.add({ kind: 'linear', time: when, value }, this.clock());
    return this.scheduled('linearRampToValueAtTime', [value, when]);
  }
  exponentialRampToValueAtTime(value: number, when: number): this {
    this.course.add({ kind: 'exponential', time: when, value }, this.clock());
    return this.scheduled('exponentialRampToValueAtTime', [value, when]);
  }
  setTargetAtTime(value: number, when: number, constant: number): this {
    this.course.add({ kind: 'target', time: when, value, constant }, this.clock());
    return this.scheduled('setTargetAtTime', [value, when, constant]);
  }
  setValueCurveAtTime(curve: Float32Array | number[], when: number, length: number): this {
    const values = Float32Array.from(curve);
    this.course.add({ kind: 'curve', time: when, curve: values, length }, this.clock());
    return this.scheduled('setValueCurveAtTime', [values, when, length]);
  }
  cancelScheduledValues(when: number): this {
    this.course.cancel(when);
    return this.scheduled('cancelScheduledValues', [when]);
  }
  cancelAndHoldAtTime(when: number): this {
    this.course.hold(when);
    return this.scheduled('cancelAndHoldAtTime', [when]);
  }
}

/** A node: its parameters made as first asked for, every other property kept here and set on the page's. */
class StandNode extends StandIn {
  readonly context: StandContext;
  /** What made it (its context's maker, or the listener), which says its parameters' defaults. */
  readonly maker: string;
  readonly kept = new Map<PropertyKey, unknown>();
  private readonly params = new Map<string, StandParam>();
  private endedAsked = false;

  constructor(id: number, context: StandContext, maker = '') {
    super(id);
    [this.context, this.maker] = [context, maker];
  }

  param(name: string): StandParam {
    let param = this.params.get(name);
    if (!param) {
      param = new StandParam(link?.fresh() ?? 0, paramDefault(this.maker, name), () => this.context.currentTime);
      link?.watch(param, param.id);
      link?.say(['param', param.id, this.id, name]);
      this.params.set(name, param);
    }
    return param;
  }

  connect<T>(target: T, output?: number, input?: number): T {
    call(this.id, 'connect', [target, output, input]);
    return target;
  }
  disconnect(...args: unknown[]): void {
    call(this.id, 'disconnect', args);
  }
  start(...args: number[]): void {
    call(this.id, 'start', args);
  }
  stop(...args: number[]): void {
    call(this.id, 'stop', args);
  }
  setPosition(...args: number[]): void {
    call(this.id, 'setPosition', args);
  }
  setOrientation(...args: number[]): void {
    call(this.id, 'setOrientation', args);
  }

  override addEventListener(type: string, heard: EventListenerOrEventListenerObject | null, options?: unknown): void {
    if (type === 'ended') this.askEnded();
    super.addEventListener(type, heard, options as AddEventListenerOptions);
  }

  set onended(heard: ((event: Event) => void) | null) {
    this.kept.set('onended', heard);
    if (heard) this.askEnded();
  }
  get onended(): ((event: Event) => void) | null {
    return (this.kept.get('onended') as ((event: Event) => void) | undefined) ?? null;
  }

  /** The page says when it ends; it is kept here till then, so a sound nothing else holds still hears its end. */
  private askEnded(): void {
    if (this.endedAsked) return;
    this.endedAsked = true;
    link?.ending.set(this.id, this);
    link?.say(['ended', this.id]);
  }

  ended(): void {
    const event = new Event('ended');
    this.dispatchEvent(event);
    this.onended?.(event);
  }
}

/** A node as the game holds it: its parameters by name, its methods its own, any other property kept and sent. */
function nodeOf(node: StandNode): AudioNode {
  return new Proxy(node, {
    get(target, name) {
      if (typeof name === 'string' && AUDIO_PARAMS.has(name)) {
        // A page whose listener has no parameters is moved by its older calls, as the game's sound asks first.
        if (target.id === LISTENER && link?.heard.listenerParams === false) return undefined;
        return target.param(name);
      }
      if (name in target) {
        const value: unknown = Reflect.get(target, name, target);
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      }
      return target.kept.get(name);
    },
    set(target, name, value: unknown) {
      if (name === 'onended') target.onended = value as ((event: Event) => void) | null;
      else {
        target.kept.set(name, value);
        if (typeof name === 'string') link?.say(['set', target.id, name, wrap(value)]);
      }
      return true;
    },
  }) as unknown as AudioNode;
}

class StandBuffer extends StandIn {
  readonly sampleRate: number;
  readonly length: number;
  private readonly channels: Float32Array[];
  private shipped: boolean;

  constructor(id: number, channels: Float32Array[], sampleRate: number, shipped = false) {
    super(id);
    [this.channels, this.sampleRate, this.shipped] = [channels, sampleRate, shipped];
    this.length = channels[0]?.length ?? 0;
  }
  get numberOfChannels(): number {
    return this.channels.length;
  }
  get duration(): number {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new RangeError(`no channel ${channel}`);
    return data;
  }
  copyToChannel(source: Float32Array, channel: number, start = 0): void {
    this.getChannelData(channel).set(source, start);
  }
  copyFromChannel(target: Float32Array, channel: number, start = 0): void {
    target.set(this.getChannelData(channel).subarray(start, start + target.length));
  }
  /** shortcut: its samples are copied to the page, not moved, so the game still reads them; were the page's memory
   *  to tell, move them once the game is found never to read a buffer it has played. */
  override ship(): void {
    if (this.shipped) return;
    this.shipped = true;
    link?.say(['buffer', this.id, this.channels.map((data) => data.slice()), this.sampleRate]);
  }
}

class StandContext extends EventTarget {
  readonly id = CONTEXT;
  readonly destination: AudioNode;
  readonly listener: AudioListener;
  private shown = 0;

  constructor() {
    super();
    const destination = new StandNode(DESTINATION, this);
    this.destination = nodeOf(destination);
    this.listener = nodeOf(new StandNode(LISTENER, this, 'listener')) as unknown as AudioListener;
  }

  get sampleRate(): number {
    return link?.heard.sampleRate ?? 48_000;
  }
  get state(): AudioContextState {
    return link?.heard.state ?? 'suspended';
  }
  /** The page's clock as it last said, run on since while it runs; never backwards. */
  get currentTime(): number {
    const heard = link?.heard;
    if (!heard) return 0;
    const since = heard.state === 'running' ? (performance.timeOrigin + performance.now() - heard.at) / 1000 : 0;
    this.shown = Math.max(this.shown, heard.time + Math.max(0, since));
    return this.shown;
  }

  /** A node made on the page by `how`: one of its context's makers, or a node's own constructor. */
  make(how: string, args: readonly unknown[]): AudioNode {
    const node = new StandNode(link?.fresh() ?? 0, this, how);
    const held = nodeOf(node);
    link?.watch(held, node.id);
    link?.say(['make', node.id, how, args.map(wrap)]);
    return held;
  }

  createGain(): GainNode {
    return this.make('createGain', []) as GainNode;
  }
  createOscillator(): OscillatorNode {
    return this.make('createOscillator', []) as OscillatorNode;
  }
  createBiquadFilter(): BiquadFilterNode {
    return this.make('createBiquadFilter', []) as BiquadFilterNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    return this.make('createBufferSource', []) as AudioBufferSourceNode;
  }
  createPanner(): PannerNode {
    return this.make('createPanner', []) as PannerNode;
  }
  createStereoPanner(): StereoPannerNode {
    return this.make('createStereoPanner', []) as StereoPannerNode;
  }
  createWaveShaper(): WaveShaperNode {
    return this.make('createWaveShaper', []) as WaveShaperNode;
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return this.make('createDynamicsCompressor', []) as DynamicsCompressorNode;
  }
  createConvolver(): ConvolverNode {
    return this.make('createConvolver', []) as ConvolverNode;
  }
  createConstantSource(): ConstantSourceNode {
    return this.make('createConstantSource', []) as ConstantSourceNode;
  }
  createChannelMerger(inputs = 6): ChannelMergerNode {
    return this.make('createChannelMerger', [inputs]) as ChannelMergerNode;
  }
  createDelay(most = 1): DelayNode {
    return this.make('createDelay', [most]) as DelayNode;
  }
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return bufferOf(
      Array.from({ length: channels }, () => new Float32Array(length)),
      sampleRate,
    );
  }

  resume(): Promise<void> {
    call(CONTEXT, 'resume', []);
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    call(CONTEXT, 'suspend', []);
    return Promise.resolve();
  }

  /** Decoded by the page, which keeps the buffer and sends its samples back for the game to read. */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    const away = link;
    if (!away) return Promise.reject(new Error('no page to decode the sound'));
    const id = away.fresh();
    return new Promise((resolve, reject) => {
      away.decoding.set(id, (buffer) =>
        buffer instanceof Error ? reject(buffer) : resolve(buffer as unknown as AudioBuffer),
      );
      away.say(['decode', id, data], [data]);
    });
  }
}

function bufferOf(channels: Float32Array[], sampleRate: number, shipped = false, id = link?.fresh() ?? 0): AudioBuffer {
  const buffer = new StandBuffer(id, channels, sampleRate, shipped);
  link?.watch(buffer, id);
  return buffer as unknown as AudioBuffer;
}

let context: StandContext | null = null;

/** A node's own constructor: made by its context's maker, then given its options, as the constructor would. */
const constructed = (maker: string) =>
  function made(audio: StandContext, options: Readonly<Record<string, unknown>> = {}): AudioNode {
    const node = audio.make(maker, []) as unknown as Record<string, unknown>;
    for (const [name, value] of Object.entries(options)) {
      const held = node[name];
      if (held instanceof StandParam) held.value = value as number;
      else node[name] = value;
    }
    return node as unknown as AudioNode;
  } as unknown as new (audio: BaseAudioContext, options?: object) => AudioNode;

/** The page's one context, made as the game first asks for it: `new AudioContext()` answers it each time, and it is
 *  an `AudioContext` to whoever asks. */
const OneContext = function made(): StandContext {
  context ??= new StandContext();
  return context;
} as unknown as typeof AudioContext;
OneContext.prototype = StandContext.prototype as unknown as AudioContext;

/** Puts the stand-ins where a page's Web Audio would be, their calls sent by `send`; answers what to do with what the
 *  page says back. One context only: the page has one. */
export function soundAway(send: Send): (reply: AudioReply) => void {
  link = new Link(send);
  const away = link;
  Object.assign(globalThis, {
    AudioContext: OneContext,
    GainNode: constructed('createGain'),
    OscillatorNode: constructed('createOscillator'),
    BiquadFilterNode: constructed('createBiquadFilter'),
    StereoPannerNode: constructed('createStereoPanner'),
    AudioBuffer: function made(options: { numberOfChannels?: number; length: number; sampleRate: number }) {
      const channels = Array.from({ length: options.numberOfChannels ?? 1 }, () => new Float32Array(options.length));
      return bufferOf(channels, options.sampleRate);
    },
  });
  return (reply) => {
    if (reply.kind === 'clock') away.heard = reply;
    else if (reply.kind === 'ended') {
      const node = away.ending.get(reply.id);
      away.ending.delete(reply.id);
      if (node instanceof StandNode) node.ended();
    } else {
      const done = away.decoding.get(reply.id);
      away.decoding.delete(reply.id);
      if ('error' in reply) done?.(new Error(reply.error));
      else done?.(bufferOf(reply.channels, reply.sampleRate, true, reply.id) as unknown as StandBuffer);
    }
  };
}
