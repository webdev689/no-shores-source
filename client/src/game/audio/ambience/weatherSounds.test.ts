import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BED_LEVEL } from './player.ts';
import { SCAPES } from './scapes.ts';
import { runJob } from './sounds.ts';
import { THUNDER_MOST, thunderOf } from './weatherLaw.ts';

/** Samples weighted as the ear weighs loudness (ITU-R BS.1770's K-weighting: a shelf up over 1.7 kHz, a cut under
 *  38 Hz), at any rate. */
function kWeighted(samples: Float32Array, rate: number): Float64Array {
  const shelf = (() => {
    const [gain, quality, corner] = [10 ** (3.99984385397 / 40), 0.7071752369554193, 1681.9744509555319];
    const turn = (2 * Math.PI * corner) / rate;
    const [cos, alpha, root] = [Math.cos(turn), Math.sin(turn) / (2 * quality), Math.sqrt(gain)];
    return [
      gain * (gain + 1 + (gain - 1) * cos + 2 * root * alpha),
      -2 * gain * (gain - 1 + (gain + 1) * cos),
      gain * (gain + 1 + (gain - 1) * cos - 2 * root * alpha),
      gain + 1 - (gain - 1) * cos + 2 * root * alpha,
      2 * (gain - 1 - (gain + 1) * cos),
      gain + 1 - (gain - 1) * cos - 2 * root * alpha,
    ];
  })();
  const turn = (2 * Math.PI * 38.13547087613982) / rate;
  const [cos, alpha] = [Math.cos(turn), Math.sin(turn) / (2 * 0.5003270373253953)];
  const highpass = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha];
  let signal = Float64Array.from(samples);
  for (const [ahead0 = 0, ahead1 = 0, ahead2 = 0, back0 = 1, back1 = 0, back2 = 0] of [shelf, highpass]) {
    const out = new Float64Array(signal.length);
    let [in1, in2, out1, out2] = [0, 0, 0, 0];
    signal.forEach((value, i) => {
      const next = (ahead0 * value + ahead1 * in1 + ahead2 * in2 - back1 * out1 - back2 * out2) / back0;
      [in2, in1, out2, out1] = [in1, value, out1, next];
      out[i] = next;
    });
    signal = out;
  }
  return signal;
}

/** Loudness, LUFS, of mono samples heard in both ears alike: over the whole, or its loudest 400 ms (momentary). */
function loudness(samples: Float32Array, rate: number, momentary = false): number {
  const weighted = kWeighted(samples, rate);
  const window = momentary ? Math.round(0.4 * rate) : weighted.length;
  let most = -Infinity;
  for (let from = 0; from + window <= weighted.length; from += Math.round(0.1 * rate)) {
    let power = 0;
    for (let i = from; i < from + window; i++) power += (weighted[i] ?? 0) ** 2;
    most = Math.max(most, -0.691 + 10 * Math.log10((2 * power) / window));
  }
  return most;
}

/** A bed as its scape plays it at full: its samples at its layer's gain, the beds' share and the place's level. */
function bedAsPlayed(scape: keyof typeof SCAPES, bed: string): number {
  const layer = SCAPES[scape].beds.find((each) => each.bed === bed);
  assert.ok(layer, `${scape} has ${bed}`);
  const made = runJob({ kind: 'bed', key: layer.bed });
  assert.ok(made);
  const gain = layer.gain * BED_LEVEL * SCAPES[scape].level;
  return loudness(
    Float32Array.from(made.samples, (value) => value * gain),
    made.rate,
  );
}

test('the rain, at its hardest, sits among the beds at about the ambience level (-30 LUFS)', () => {
  const wind = bedAsPlayed('temperate-coast', 'wind.breeze');
  for (const [scape, bed] of [
    ['temperate-coast', 'rain.hiss'],
    ['temperate-coast', 'rain.patter'],
    ['social', 'rain.gutters'],
    ['sea', 'rain.deck'],
  ] as const) {
    const played = bedAsPlayed(scape, bed);
    assert.ok(played > -36 && played < -27, `${bed}: ${played.toFixed(1)} LUFS`);
    assert.ok(played < wind + 2, `${bed} under the wind it falls in (${wind.toFixed(1)} LUFS)`);
  }
});

test('thunder: a near crack stands well over the ambience yet never clips, a far roll is under its beds', () => {
  const thunderAt = (distance: number, take: number) => {
    const thunder = thunderOf({ x: distance, y: 0, atS: 0, toGround: true, power: 1 }, [0, 0]);
    assert.ok(thunder);
    const made = runJob({ kind: 'sound', key: thunder.sound, take });
    assert.ok(made);
    let peak = 0;
    for (const value of made.samples) peak = Math.max(peak, Math.abs(value));
    // The panner's equal power puts 0.71 of a call straight ahead in each ear.
    const gain = thunder.gain * Math.SQRT1_2;
    const scaled = Float32Array.from(made.samples, (value) => value * gain);
    return { sound: thunder.sound, peak: peak * gain, loud: loudness(scaled, made.rate, true) };
  };
  for (let take = 0; take < 3; take++) {
    const near = thunderAt(600, take);
    assert.equal(near.sound, 'thunder.crack');
    assert.ok(near.loud > -20 && near.loud < -10, `crack ${take}: ${near.loud.toFixed(1)} LUFS`);
    assert.ok(near.peak <= THUNDER_MOST, `crack ${take} peaks at ${near.peak}`);
    const far = thunderAt(20_000, take);
    assert.equal(far.sound, 'thunder.roll');
    assert.ok(far.loud < -32, `far roll ${take}: ${far.loud.toFixed(1)} LUFS`);
  }
});
