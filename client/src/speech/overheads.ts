// Barks and emotes over heads. A bark is a short line over its speaker, typed and voiced as the box's are, then held
// and faded; an emote is a feeling's glyph popping over the head with its sound. The caller names each head by a key
// and gives its screen point every frame; a head without a point is hidden and silent, as a voice is only heard with
// its words.
import { motionReduced } from '../plus/kit.ts';
import type { Cast, EmoteKind, Line } from './cast.ts';
import { type VoiceOut, wordsNode } from './dialogue.ts';
import { EMOTES, drawGlyph, glyphMotion, glyphSize } from './glyphs.ts';
import { BARK_PX, GAP_PX, barkOpacity, emoteOpacity, glyphScale, overheadPlace, underTheTop } from './place.ts';
import { wearSpeech } from './sheet.ts';
import { Typing } from './typing.ts';
import { panOf, speakSyllable, type VoiceProfile } from './voice.ts';

/** How long a glyph shows a step larger as it appears: its pop. */
const POP_S = 0.1;

interface Bark {
  readonly node: HTMLElement;
  readonly typed: Text;
  readonly unseen: HTMLElement;
  readonly typing: Typing;
  readonly voice: VoiceProfile;
  sinceTypedS: number;
}

interface Shown {
  readonly kind: EmoteKind;
  readonly canvas: HTMLCanvasElement;
  ageS: number;
  drawnScale: number;
  heard: boolean;
}

interface Head {
  bark: Bark | null;
  emote: Shown | null;
}

export class Overheads {
  private readonly layer: HTMLElement;
  private readonly voiceOut: VoiceOut;
  private readonly heads = new Map<string, Head>();

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
    const shown = this.headOf(head);
    shown.bark?.node.remove();
    shown.bark = { node, typed, unseen, typing: new Typing(line.say, voice.syllableS), voice, sinceTypedS: 0 };
    this.layer.append(node);
  }

  /** The glyph pops over the head with its paired sound. */
  emote(head: string, kind: EmoteKind): void {
    const canvas = this.layer.ownerDocument.createElement('canvas');
    canvas.className = 'speech-emote';
    canvas.hidden = true;
    const shown = this.headOf(head);
    shown.emote?.canvas.remove();
    shown.emote = { kind, canvas, ageS: 0, drawnScale: 0, heard: false };
    this.layer.append(canvas);
  }

  /** Moves each overhead on by `seconds` and stands it over its head's point, in CSS pixels; null hides it. */
  frame(seconds: number, heads: ReadonlyMap<string, readonly [number, number] | null>): void {
    const reduced = motionReduced();
    const scale = glyphScale(this.layer.clientHeight || globalThis.innerHeight || 720);
    for (const [key, head] of this.heads) {
      // What stands over a head near the top edge moves down with it, so its words are never cut off while heard.
      const glyph = head.emote ? glyphSize(head.emote.kind, scale + 1)[1] + (head.bark ? GAP_PX : 0) : 0;
      const seen = heads.get(key) ?? null;
      const point = seen && underTheTop(seen, GAP_PX + glyph + (head.bark ? BARK_PX : 0));
      const pan = point ? panOf(point[0], this.layer.clientWidth || globalThis.innerWidth || 0) : 0;
      const lift = head.emote ? this.frameEmote(head.emote, seconds, point, pan, scale, reduced) : 0;
      if (head.bark) this.frameBark(head.bark, seconds, point, pan, lift);
      if (head.emote && head.emote.ageS >= EMOTES[head.emote.kind].lifeS) {
        head.emote.canvas.remove();
        head.emote = null;
      }
      if (head.bark && barkOpacity(head.bark.typing.done, head.bark.sinceTypedS) === 0) {
        head.bark.node.remove();
        head.bark = null;
      }
      if (!head.bark && !head.emote) this.heads.delete(key);
    }
  }

  clear(): void {
    this.heads.clear();
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

  private headOf(key: string): Head {
    let head = this.heads.get(key);
    if (!head) {
      head = { bark: null, emote: null };
      this.heads.set(key, head);
    }
    return head;
  }

  /** Moves a glyph on and places it; returns how high it stands over the head, for a bark to stand above it. */
  private frameEmote(
    shown: Shown,
    seconds: number,
    point: readonly [number, number] | null,
    pan: number,
    scale: number,
    reduced: boolean,
  ): number {
    const emote = EMOTES[shown.kind];
    shown.ageS += seconds;
    shown.canvas.hidden = !point;
    const restingHeight = glyphSize(shown.kind, scale)[1] + GAP_PX;
    if (!point) return restingHeight;
    if (!shown.heard) {
      shown.heard = true;
      const sound = this.voiceOut();
      for (let syllable = 0; sound && syllable < emote.sound.syllables; syllable += 1) {
        const when = sound.audio.currentTime + syllable * (emote.sound.voice.syllableS + 0.04);
        speakSyllable(sound.audio, sound.out, emote.sound.voice, { pan, when });
      }
    }
    const drawScale = !reduced && shown.ageS < POP_S ? scale + 1 : scale;
    if (drawScale !== shown.drawnScale) {
      drawGlyph(shown.canvas, shown.kind, drawScale);
      shown.drawnScale = drawScale;
    }
    const [across, down] = glyphMotion(shown.kind, shown.ageS, reduced);
    const [left, top] = overheadPlace(point, glyphSize(shown.kind, drawScale), 0, this.width());
    shown.canvas.style.translate = `${left + across * scale}px ${top + down * scale}px`;
    shown.canvas.style.opacity = String(emoteOpacity(emote, shown.ageS));
    return restingHeight;
  }

  private frameBark(bark: Bark, seconds: number, point: readonly [number, number] | null, pan: number, lift: number) {
    if (bark.typing.done) bark.sinceTypedS += seconds;
    else if (bark.typing.step(seconds) && point) {
      const sound = this.voiceOut();
      if (sound) speakSyllable(sound.audio, sound.out, bark.voice, { pan, emphasis: true });
    }
    bark.typed.data = bark.typing.visible;
    bark.unseen.textContent = bark.typing.hidden;
    bark.node.hidden = !point;
    if (!point) return;
    const [left, top] = overheadPlace(point, [bark.node.offsetWidth, bark.node.offsetHeight], lift, this.width());
    bark.node.style.translate = `${left}px ${top}px`;
    bark.node.style.opacity = String(barkOpacity(bark.typing.done, bark.sinceTypedS));
  }
}
