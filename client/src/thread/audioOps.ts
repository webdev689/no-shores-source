// What the game's worker says to the page's audio, and what the page says back (`audioAway.ts`, `audioHost.ts`): each
// context, node, parameter and buffer is a number, the context, its destination and its listener the first three.

export const CONTEXT = 0;
export const DESTINATION = 1;
export const LISTENER = 2;

/** Every property of a node or the listener that is a parameter, read as the parameter itself. */
export const AUDIO_PARAMS: ReadonlySet<string> = new Set([
  'gain',
  'frequency',
  'detune',
  'Q',
  'playbackRate',
  'pan',
  'offset',
  'delayTime',
  'threshold',
  'knee',
  'ratio',
  'attack',
  'release',
  'positionX',
  'positionY',
  'positionZ',
  'orientationX',
  'orientationY',
  'orientationZ',
  'forwardX',
  'forwardY',
  'forwardZ',
  'upX',
  'upY',
  'upZ',
]);

/** How a node may be made on the page: by one of its context's makers. */
export const MAKERS: ReadonlySet<string> = new Set([
  'createGain',
  'createOscillator',
  'createBiquadFilter',
  'createBufferSource',
  'createPanner',
  'createStereoPanner',
  'createWaveShaper',
  'createDynamicsCompressor',
  'createConvolver',
  'createConstantSource',
  'createChannelMerger',
  'createDelay',
]);

/** The key a stand-in is sent under, its number its value. */
export const WRAPPED = '@audio';
export interface Wrapped {
  readonly [WRAPPED]: number;
}

export type AudioOp =
  /** A node made by `how`, from these arguments. */
  | readonly ['make', id: number, how: string, args: readonly unknown[]]
  /** The parameter `name` of what `owner` stands for. */
  | readonly ['param', id: number, owner: number, name: string]
  | readonly ['set', id: number, name: string, value: unknown]
  | readonly ['call', id: number, method: string, args: readonly unknown[]]
  /** A buffer of these samples, each channel's, at this rate. */
  | readonly ['buffer', id: number, channels: readonly Float32Array[], sampleRate: number]
  /** A file's bytes to decode into a buffer. */
  | readonly ['decode', id: number, data: ArrayBuffer]
  /** Said back when it ends. */
  | readonly ['ended', id: number]
  /** Let go: the game holds it no more. */
  | readonly ['forget', id: number];

export type AudioReply =
  /** The page's clock: its time at `at` (milliseconds from the epoch), its state and rate. */
  | {
      readonly kind: 'clock';
      readonly time: number;
      readonly at: number;
      readonly state: AudioContextState;
      readonly sampleRate: number;
    }
  | { readonly kind: 'ended'; readonly id: number }
  | { readonly kind: 'decoded'; readonly id: number; readonly channels: Float32Array[]; readonly sampleRate: number }
  | { readonly kind: 'decoded'; readonly id: number; readonly error: string };
