// Barks over heads: a short line over its speaker, its words alone, typed and voiced as the box's are, then held and
// faded. The caller names each head by a key and gives its screen point every frame; a head without a point is hidden
// and silent, as a voice is only heard with its words. Drawn by the game as a layer of its interface under every
// other, the dialogue box among them, as a speaker's head can be behind it.
import { TONES } from '../plus/tones.ts';
import type { Child, Node } from '../ui/node.ts';
import type { Stack } from '../ui/stack.ts';
import type { Interface } from '../ui/ui.ts';
import type { Cast, Line } from './cast.ts';
import { typedSpans, type VoiceOut } from './dialogue.ts';
import { BARK_PX, GAP_PX, barkOpacity, overheadPlace, underTheTop } from './place.ts';
import { Typing } from './typing.ts';
import { panOf, speakSyllable, type VoiceProfile } from './voice.ts';

interface Bark {
  readonly typing: Typing;
  readonly voice: VoiceProfile;
  sinceTypedS: number;
  /** Where its head stands this frame, CSS pixels, or null while it is hidden. */
  point: readonly [number, number] | null;
}

/** A bark's words, `size` steps of the face. */
const BARK_SIZE = 2;

export class Overheads {
  private readonly voiceOut: VoiceOut;
  private readonly barks = new Map<string, Bark>();
  private readonly removeLayer: () => void;
  /** How wide the view was when last drawn, CSS pixels: the voices pan across it. */
  private viewWidth = 0;

  constructor(stack: Stack, voiceOut: VoiceOut) {
    this.voiceOut = voiceOut;
    this.removeLayer = stack.under((ui) => this.node(ui));
  }

  /** Its words over the head, typed and voiced, then fading; a new bark over the same head replaces the last. */
  bark(head: string, line: Line, cast: Cast): void {
    const voice = cast.voices[cast.speakers[line.who].voice];
    this.barks.set(head, { typing: new Typing(line.say, voice.syllableS), voice, sinceTypedS: 0, point: null });
  }

  /** Moves each bark on by `seconds` and stands it over its head's point, in CSS pixels; null hides it. */
  frame(seconds: number, heads: ReadonlyMap<string, readonly [number, number] | null>): void {
    const width = this.viewWidth || globalThis.innerWidth || 0;
    for (const [key, bark] of this.barks) {
      // A bark over a head near the top edge moves down with it, so its words are never cut off while heard.
      const seen = heads.get(key) ?? null;
      bark.point = seen && underTheTop(seen, GAP_PX + BARK_PX);
      const pan = bark.point ? panOf(bark.point[0], width) : 0;
      this.step(bark, seconds, pan);
      if (barkOpacity(bark.typing.done, bark.sinceTypedS) === 0) this.barks.delete(key);
    }
  }

  clear(): void {
    this.barks.clear();
  }

  /** Takes the layer and all it shows away. */
  remove(): void {
    this.clear();
    this.removeLayer();
  }

  /** Every bark with a head to stand over, this frame. */
  node(ui: Interface): Child {
    this.viewWidth = ui.size.width;
    const shown = [...this.barks.values()].filter((bark) => bark.point);
    if (shown.length === 0) return null;
    return {
      width: 'grow',
      height: 'grow',
      through: true,
      clip: true,
      children: shown.map((bark) => this.barkNode(ui, bark)),
    };
  }

  private barkNode(ui: Interface, bark: Bark): Node {
    const wide = Math.ceil(ui.renderer.measure(bark.typing.text, BARK_SIZE));
    const [left, top] = overheadPlace(bark.point ?? [0, 0], [wide, BARK_PX], ui.size.width);
    return {
      opacity: barkOpacity(bark.typing.done, bark.sinceTypedS),
      float: { to: 'parent', x: left, y: top },
      children: [
        {
          text: {
            words: typedSpans(bark.typing.visible, bark.typing.hidden),
            size: BARK_SIZE,
            leading: BARK_PX,
            colour: TONES.word,
            edge: 'halo',
            wrap: false,
          },
        },
      ],
    };
  }

  private step(bark: Bark, seconds: number, pan: number): void {
    if (bark.typing.done) bark.sinceTypedS += seconds;
    else if (bark.typing.step(seconds) && bark.point) {
      const sound = this.voiceOut();
      if (sound) speakSyllable(sound.audio, sound.out, bark.voice, { pan, emphasis: true });
    }
  }
}
