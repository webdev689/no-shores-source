// The dialogue box, bottom centre in the Enhanced Plus kit: the speaker's name, in their own colour, over their
// words, typed as they are heard. A speaker with no name is a voice from nowhere, its words alone in the middle of the screen. Drawn by the game
// as a layer of its interface under every other, so the HUD, the menu and every window stand over the words; a
// screen reader hears each line once it is typed whole. The pacing is the conversation's (conversation.ts); this file
// only shows it and sounds it.
import { TONES } from '../plus/tones.ts';
import { announce } from '../ui/announce.ts';
import type { Child, Node, Span } from '../ui/node.ts';
import { colourOf } from '../ui/quads.ts';
import type { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { Cast, Line } from './cast.ts';
import { Conversation } from './conversation.ts';
import { speakSyllable } from './voice.ts';

/** Where speech is heard: the game's world sound, or null while sound sleeps or is silenced, when words still show. */
export type VoiceOut = () => { readonly audio: AudioContext; readonly out: AudioNode } | null;

/** The fight's vitals take the bottom left up to 354 px across, so the box keeps to the middle, clear of them on both
 *  sides, and stands over the sea bar at the screen's foot. */
const CLEAR_OF_VITALS_PX = 380;
const BOX_WIDTH_PX = 660;
const BOX_LEAST_PX = 330;
const BOX_FOOT_PX = 104;
/** Words still to be typed: laid, so the typed words never reflow, but not seen. */
const UNSEEN = 'rgba(0,0,0,0)';

/** The words typed so far, then the rest of the line laid out unseen. */
export const typedSpans = (visible: string, hidden: string): Span[] => [
  { words: visible },
  { words: hidden, colour: UNSEEN },
];

/** The kit's header band under the speaker's name: a faint lit ground, a lit line along its top and an outline along
 *  its foot. */
const HEADER: Partial<Node> = {
  fill: 'rgba(255,255,255,0.035)',
  draw: (ui, box, scale, clip, fade) => {
    for (const [y, css] of [
      [box.y, 'rgba(255,255,255,0.05)'],
      [box.y + box.height - scale, TONES.outline],
    ] as const) {
      const [red, green, blue, alpha] = colourOf(css);
      ui.quads.add({ x: box.x, y, width: box.width, height: scale }, [red, green, blue, alpha * fade], clip);
    }
  },
};

/** The boxes shown now, which the HUD gives way to while any stands. */
const shownBoxes = new Set<DialogueBox>();

/** Whether a dialogue box holds the screen: a named speaker's words are up. */
export const speaking = (): boolean => shownBoxes.size > 0;

/** The box for `name`'s words, their name in `colour` (the kit's brass for none), or the voice from nowhere's words
 *  alone for a speaker with no name, in a view `width` wide. */
export function dialogueNode(name: string, words: readonly Span[], width: number, colour: string | null = null): Node {
  if (name === '')
    return {
      width: Math.min(BOX_WIDTH_PX, width - 44),
      opacity: 0.7,
      float: { to: 'screen', anchor: [0.5, 0.5], at: [0.5, 0.5] },
      children: [
        {
          width: 'grow',
          text: { words, size: 2, leading: 33, colour: TONES.wordDim, edge: 'halo', align: 'center' },
        },
      ],
    };
  return {
    role: 'window',
    direction: 'column',
    padding: 2,
    width: Math.max(BOX_LEAST_PX, Math.min(BOX_WIDTH_PX, width - 2 * CLEAR_OF_VITALS_PX)),
    float: { to: 'screen', anchor: [0.5, 1], at: [0.5, 1], y: -BOX_FOOT_PX },
    children: [
      {
        ...HEADER,
        width: 'grow',
        padding: [4, 22, 3, 22],
        children: [
          {
            text: {
              words: name,
              size: 2,
              leading: 33,
              colour: colour ?? TONES.brassHi,
              edge: 'shadow',
              edgeColour: TONES.outline,
            },
          },
        ],
      },
      {
        width: 'grow',
        padding: [11, 22, 15, 22],
        minHeight: 66,
        children: [{ width: 'grow', text: { words, size: 2, leading: 33, edge: 'shadow', edgeColour: TONES.outline } }],
      },
    ],
  };
}

export class DialogueBox {
  private readonly voiceOut: VoiceOut;
  private readonly removeLayer: () => void;
  private talk: Conversation | null = null;
  private cast: Cast | null = null;
  private shownIndex = -1;
  /** Who speaks the line shown, "" for a voice from nowhere, and the colour their name is shown in. */
  private name = '';
  private colour: string | null = null;
  private told = '';
  private onLine: ((line: Line, index: number) => void) | undefined;
  private resolve: (() => void) | null = null;

  constructor(stack: Stack, voiceOut: VoiceOut) {
    this.voiceOut = voiceOut;
    // Under every layer, so all the game's interface laid before or after the story's stands over the words.
    this.removeLayer = stack.under((ui) => this.node(ui));
  }

  get open(): boolean {
    return this.talk !== null;
  }

  /** Plays the lines in turn; resolves once the last has been read. `auto` advances by itself after each line has
   *  been typed and held (for cutscenes); otherwise `advance()` moves on. A speaker whose name is "" is a voice from
   *  nowhere: no box, the words alone, centred, faint. */
  play(
    lines: readonly Line[],
    cast: Cast,
    options: { auto?: boolean; onLine?: (line: Line, index: number) => void } = {},
  ): Promise<void> {
    this.skip();
    this.talk = new Conversation(lines, cast, options.auto ?? false);
    this.cast = cast;
    this.onLine = options.onLine;
    this.shownIndex = -1;
    const done = new Promise<void>((resolve) => (this.resolve = resolve));
    this.show();
    return done;
  }

  /** A press: finishes the typing, or moves to the next line. */
  advance(): void {
    this.talk?.advance();
    this.show();
  }

  /** Ends at once, the promise resolved. */
  skip(): void {
    this.talk = null;
    this.told = '';
    shownBoxes.delete(this);
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }

  /** Ends at once and takes the box and the voice from nowhere away. */
  remove(): void {
    this.skip();
    this.removeLayer();
  }

  /** The typewriter and its voice. */
  frame(seconds: number): void {
    const talk = this.talk;
    if (!talk) return;
    if (talk.step(seconds) && talk.voice) {
      const sound = this.voiceOut();
      if (sound) speakSyllable(sound.audio, sound.out, talk.voice, { emphasis: talk.emphasis });
    }
    this.show();
  }

  /** The box this frame, or nothing between lines. */
  node(ui: Interface): Child {
    const talk = this.talk;
    if (!talk?.line) return null;
    const words = typedSpans(talk.typing.visible, talk.typing.hidden);
    const box = dialogueNode(this.name, words, ui.size.width, this.colour);
    return { width: 'grow', height: 'grow', through: true, children: [box] };
  }

  /** Brings the box up to the conversation: a new line's speaker, the line told once typed whole, or the end. */
  private show(): void {
    const talk = this.talk;
    if (!talk || !this.cast) return;
    const line = talk.line;
    if (!line) {
      this.skip();
      return;
    }
    if (talk.index !== this.shownIndex) {
      this.shownIndex = talk.index;
      ({ name: this.name, colour: this.colour } = this.cast.speakers[line.who]);
      if (this.name === '') shownBoxes.delete(this);
      else shownBoxes.add(this);
      this.onLine?.(line, talk.index);
      // The caller may have played or skipped from inside onLine: the box is then theirs, not this line's.
      if (this.talk !== talk) return;
    }
    // Read aloud whole, not letter by letter as the words type.
    const whole = talk.typing.done ? `${this.name === '' ? '' : `${this.name}: `}${talk.typing.text}` : '';
    if (whole !== this.told) {
      this.told = whole;
      if (whole) announce(whole);
    }
  }
}
