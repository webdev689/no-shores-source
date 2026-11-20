// Barks over heads: a short line over its speaker, its words alone, typed and voiced as the box's are, then held and
// faded. The caller names each head by a key and gives its screen point every frame; a head without a point is hidden
// and silent, as a voice is only heard with its words.
import type { Cast, Line } from './cast.ts';
import { type VoiceOut, wordsNode } from './dialogue.ts';
import { BARK_PX, GAP_PX, barkOpacity, overheadPlace, underTheTop } from './place.ts';
import { wearSpeech } from './sheet.ts';
import { Typing } from './typing.ts';
import { panOf, speakSyllable, type VoiceProfile } from './voice.ts';

interface Bark {
  readonly node: HTMLElement;
  readonly typed: Text;
  readonly unseen: HTMLElement;
  readonly typing: Typing;
  readonly voice: VoiceProfile;
  sinceTypedS: number;
}

export class Overheads {
  private readonly layer: HTMLElement;
  private readonly voiceOut: VoiceOut;
  private readonly barks = new Map<string, Bark>();

  constructor(root: HTMLElement, voiceOut: VoiceOut) {
    const page = root.ownerDocument;
    wearSpeech(page);
    this.voiceOut = voiceOut;
    this.layer = page.createElement('div');
    this.layer.className = 'speech-overheads';
    root.append(this.layer);
  }

  /** Its words over the head, typed and voiced, then fading; a new bark over the same head replaces the last. */
  bark(head: string, line: Line, cast: Cast): void {
    const voice = cast.voices[cast.speakers[line.who].voice];
    const { node, typed, unseen } = wordsNode(this.layer.ownerDocument, 'speech-bark');
    node.hidden = true;
    this.barks.get(head)?.node.remove();
    this.barks.set(head, { node, typed, unseen, typing: new Typing(line.say, voice.syllableS), voice, sinceTypedS: 0 });
    this.layer.append(node);
  }

  /** Moves each bark on by `seconds` and stands it over its head's point, in CSS pixels; null hides it. */
  frame(seconds: number, heads: ReadonlyMap<string, readonly [number, number] | null>): void {
    for (const [key, bark] of this.barks) {
      // A bark over a head near the top edge moves down with it, so its words are never cut off while heard.
      const seen = heads.get(key) ?? null;
      const point = seen && underTheTop(seen, GAP_PX + BARK_PX);
      const pan = point ? panOf(point[0], this.layer.clientWidth || globalThis.innerWidth || 0) : 0;
      this.frameBark(bark, seconds, point, pan);
      if (barkOpacity(bark.typing.done, bark.sinceTypedS) === 0) {
        bark.node.remove();
        this.barks.delete(key);
      }
    }
  }

  clear(): void {
    this.barks.clear();
    this.layer.replaceChildren();
  }

  /** Takes the layer and all it shows off the page. */
  remove(): void {
    this.clear();
    this.layer.remove();
  }

  private width(): number {
    return this.layer.clientWidth || globalThis.innerWidth || Infinity;
  }

  private frameBark(bark: Bark, seconds: number, point: readonly [number, number] | null, pan: number) {
    if (bark.typing.done) bark.sinceTypedS += seconds;
    else if (bark.typing.step(seconds) && point) {
      const sound = this.voiceOut();
      if (sound) speakSyllable(sound.audio, sound.out, bark.voice, { pan, emphasis: true });
    }
    bark.typed.data = bark.typing.visible;
    bark.unseen.textContent = bark.typing.hidden;
    bark.node.hidden = !point;
    if (!point) return;
    const [left, top] = overheadPlace(point, [bark.node.offsetWidth, bark.node.offsetHeight], this.width());
    bark.node.style.translate = `${left}px ${top}px`;
    bark.node.style.opacity = String(barkOpacity(bark.typing.done, bark.sinceTypedS));
  }
}
