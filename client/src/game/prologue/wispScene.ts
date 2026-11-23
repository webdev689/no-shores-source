// The wisp's coming, played as a short cutscene on the wreck once the bow is taught, the fight held: the camera
// follows it in from over the water and about the quiet deck, the Brig's crew crying out at it, then stands back to
// watch it circle the player and engulf them (a flash, a ring of Volt, a thunderclap), and eases back over the
// shoulder. As the flash comes the room gives the player the Storm. A hum and a crackle follow it about.
import { Cues } from '../../cinema/cues.ts';
import { lookAt } from '../../cinema/rail.ts';
import { Laid } from '../../combat/spellPixels.ts';
import { audioPoint } from '../../listener.ts';
import { playSample } from '../../soundSamples.ts';
import { panShot, type Shot } from '../camera.ts';
import { worldOutput } from '../uiSounds.ts';
import type { Story } from './story.ts';
import {
  ENGULF_AT_S,
  FLASH_IN_S,
  layEngulf,
  layWisp,
  WISP_LENGTH_S,
  WISP_S,
  wispAt,
  wispCourse,
  type WispCourse,
  type WispNow,
} from './wisp.ts';

type Point = readonly [number, number, number];

/** How long the camera takes to leave the player's shot for the wisp, seconds; how far behind and over the player
 *  it watches the wisp from, and how far out and up it stands to watch the rings. */
const LEAVE_S = 1.1;
const WATCH = { back: 3.4, up: 2.6, side: 1.2 } as const;
const RINGS = { out: 7.6, up: 3.4 } as const;
/** How far back the trail is kept, seconds, and how often a point of it is kept. */
const TRAIL_KEPT_S = 1;
const TRAIL_EVERY_S = 1 / 30;
/** The flash's brightness as it comes and how fast it fades, a second. */
const FLASH = 1;
const FLASH_FADE = 2.5;
/** The hum's two tones (Hz) and its tremble; its loudness, faint far off and full as it engulfs; a crackle's gap. */
const HUM_HZ = [110, 164.8] as const;
const TREMBLE_HZ = 7;
const HUM_GAIN = [0.04, 0.16] as const;
const CRACKLE_S = 0.55;

/** What the wisp's coming shows this frame: the shot, its marks, the flash over the world, and whether it is over. */
export interface WispFrame {
  readonly shot: Shot;
  readonly marks: readonly number[];
  readonly flash: number;
  readonly done: boolean;
}

export class WispScene {
  private course: WispCourse;
  private readonly facing: number;
  private readonly from: Shot;
  private readonly cues: Cues;
  private seconds = 0;
  private flash = 0;
  private trail: { at: Point; age: number }[] = [];
  private sinceTrail = 0;
  private readonly laid = new Laid();
  private readonly hum = new Hum();

  /** The wisp comes for the player standing at `feet` facing `facing`, the camera leaving `from`; `give` gives them
   *  the Storm as it engulfs them. A page under development may begin it `into` seconds on, to picture it. */
  constructor(story: Story, feet: Point, facing: number, from: Shot, give: () => void, into = 0) {
    this.seconds = into;
    this.course = wispCourse(feet, facing);
    [this.facing, this.from] = [facing, from];
    const { ambience } = story.stage.parts;
    this.cues = new Cues([
      [1.7, () => void story.stage.play('wisp', true)],
      [
        ENGULF_AT_S + FLASH_IN_S,
        () => {
          give();
          this.flash = FLASH;
          ambience.flash();
          ambience.thunder(0.05);
        },
      ],
    ]);
  }

  /** One frame `seconds` long at `clock` on the page's clock, the player standing at `feet` (the room may stand them
   *  a moment after the wisp begins); `back` is the shot over their shoulder it eases back to at its end. */
  frame(seconds: number, clock: number, back: Shot, feet: Point): WispFrame {
    this.seconds += seconds;
    this.course = wispCourse(feet, this.facing);
    this.cues.step(this.seconds);
    this.flash = Math.max(0, this.flash - seconds * FLASH_FADE);
    const now = wispAt(this.course, this.seconds);
    this.keepTrail(now, seconds);
    const shot = this.shotOf(now, back);
    this.laid.clear();
    layWisp(this.laid, now, this.trail, shot.eye, clock);
    layEngulf(this.laid, this.course.feet, shot.eye, this.seconds - ENGULF_AT_S);
    const done = this.seconds >= WISP_LENGTH_S;
    this.hum.frame(now, seconds, done);
    return { shot, marks: this.laid.laid(), flash: this.flash, done };
  }

  /** Lets the hum go, the scene left before its end. */
  leave(): void {
    this.hum.frame(null, 0, true);
  }

  private keepTrail(now: WispNow, seconds: number): void {
    for (const point of this.trail) point.age += seconds;
    this.sinceTrail += seconds;
    if (this.sinceTrail >= TRAIL_EVERY_S && now.part !== 'gone') {
      this.sinceTrail = 0;
      this.trail.unshift({ at: now.at, age: 0 });
    }
    this.trail = this.trail.filter((point) => point.age <= TRAIL_KEPT_S);
  }

  /** The camera: from the player's shot round to watch the wisp from behind them as it comes and wanders; out to one
   *  side to watch its rings close on them; and back over their shoulder once it has engulfed them. */
  private shotOf(now: WispNow, back: Shot): Shot {
    const { feet } = this.course;
    const chest: Point = [feet[0], feet[1], feet[2] + 1.2];
    const { facing } = this;
    const [ahead, right] = [
      [Math.sin(facing), -Math.cos(facing)],
      [Math.cos(facing), Math.sin(facing)],
    ] as const;
    const aimed = (eye: Point, target: Point): Shot => ({ ...this.from, eye, ...lookAt(eye, target) });
    const watching = aimed(
      [
        feet[0] - ahead[0] * WATCH.back + right[0] * WATCH.side,
        feet[1] - ahead[1] * WATCH.back + right[1] * WATCH.side,
        feet[2] + WATCH.up,
      ],
      // Between the player and the wisp: the deck and their back stay in the frame.
      now.part === 'gone'
        ? chest
        : [chest[0] * 0.55 + now.at[0] * 0.45, chest[1] * 0.55 + now.at[1] * 0.45, chest[2] * 0.55 + now.at[2] * 0.45],
    );
    const ringEye: Point = [feet[0] + right[0] * RINGS.out, feet[1] + right[1] * RINGS.out, feet[2] + RINGS.up];
    const rings = aimed(ringEye, chest);
    const into = this.seconds;
    const circleAt = WISP_S.drift + WISP_S.wander;
    const ease = (share: number) => {
      const clamped = Math.min(1, Math.max(0, share));
      return clamped * clamped * (3 - 2 * clamped);
    };
    if (into < circleAt) return panShot(this.from, watching, ease(into / LEAVE_S));
    const end = ENGULF_AT_S + WISP_S.engulf;
    if (into < end) return panShot(watching, rings, ease((into - circleAt) / LEAVE_S));
    return panShot(rings, back, ease((into - end) / WISP_S.back));
  }
}

/** The wisp's hum, two low tones trembling, following it and louder as it brightens, and its crackle, now and then
 *  the Arc Lash's snap played faint and high. Nothing plays where the world's sound is off. */
class Hum {
  private voice: { gain: GainNode; panner: PannerNode; stop: () => void } | null = null;
  private crackleIn = CRACKLE_S;

  frame(now: WispNow | null, seconds: number, over: boolean): void {
    if (over || !now || now.part === 'gone') {
      this.voice?.stop();
      this.voice = null;
      return;
    }
    const output = worldOutput();
    if (!output) return;
    const { audio } = output;
    this.voice ??= this.start(audio, output.out);
    const { gain, panner } = this.voice;
    [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = audioPoint(audio, now.at);
    gain.gain.setTargetAtTime(HUM_GAIN[0] + (HUM_GAIN[1] - HUM_GAIN[0]) * now.glow, audio.currentTime, 0.1);
    this.crackleIn -= seconds * (0.6 + now.glow);
    if (this.crackleIn > 0) return;
    this.crackleIn = CRACKLE_S * (0.5 + Math.random());
    const snap = audio.createGain();
    snap.gain.value = 0.25 + 0.35 * now.glow;
    snap.connect(panner);
    const played = playSample(audio, snap, 'spell.arclash', 1.5 + Math.random() * 0.4);
    if (played) played.onended = () => snap.disconnect();
    else snap.disconnect();
  }

  private start(audio: AudioContext, out: AudioNode): { gain: GainNode; panner: PannerNode; stop: () => void } {
    const panner = audio.createPanner();
    Object.assign(panner, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 2, maxDistance: 60 });
    panner.connect(out);
    const gain = audio.createGain();
    gain.gain.value = 0;
    gain.connect(panner);
    const tremble = audio.createOscillator();
    const depth = audio.createGain();
    tremble.frequency.value = TREMBLE_HZ;
    depth.gain.value = 0.35;
    tremble.connect(depth);
    const tones = HUM_HZ.map((pitch, index) => {
      const tone = audio.createOscillator();
      tone.type = index === 0 ? 'sine' : 'triangle';
      tone.frequency.value = pitch;
      const level = audio.createGain();
      level.gain.value = index === 0 ? 0.7 : 0.3;
      depth.connect(level.gain);
      tone.connect(level).connect(gain);
      tone.start();
      return tone;
    });
    tremble.start();
    const stop = () => {
      const end = audio.currentTime + 0.3;
      gain.gain.setTargetAtTime(0, audio.currentTime, 0.08);
      for (const oscillator of [...tones, tremble]) oscillator.stop(end);
      setTimeout(() => panner.disconnect(), 400);
    };
    return { gain, panner, stop };
  }
}
