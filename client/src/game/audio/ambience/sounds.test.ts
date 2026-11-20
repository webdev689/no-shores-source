import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BEDS, BED_RMS, type BedKey } from './beds.ts';
import { type Job, SOUNDS, SOUND_RATE, type SoundKey, isJob, jobName, runJob, takesOf } from './sounds.ts';

const beds = Object.keys(BEDS) as BedKey[];
const sounds = Object.keys(SOUNDS) as SoundKey[];

test('a job is answered with its samples and their rate, the same every time; a job of nothing with nothing', () => {
  const bed = runJob({ kind: 'bed', key: 'wind.moan' });
  assert.ok(bed);
  assert.equal(bed.rate, BEDS['wind.moan'].rate);
  assert.equal(bed.samples.length, Math.round(BEDS['wind.moan'].rate * BEDS['wind.moan'].seconds));
  assert.deepEqual(runJob({ kind: 'bed', key: 'wind.moan' })?.samples, bed.samples);
  const take = runJob({ kind: 'sound', key: 'owl.tawny', take: 1 });
  assert.ok(take);
  assert.equal(take.rate, SOUND_RATE);
  assert.deepEqual(runJob({ kind: 'sound', key: 'owl.tawny', take: 1 })?.samples, take.samples);
  assert.notDeepEqual(runJob({ kind: 'sound', key: 'owl.tawny', take: 0 })?.samples, take.samples);
  for (const job of [
    { kind: 'bed', key: 'nothing' },
    { kind: 'sound', key: 'owl.tawny', take: takesOf('owl.tawny') },
    { kind: 'sound', key: 'owl.tawny', take: -1 },
    { kind: 'sound', key: 'toString', take: 0 },
  ] as unknown as Job[]) {
    assert.equal(isJob(job), false);
    assert.equal(runJob(job), null);
  }
  const names = [
    ...beds.map((key) => jobName({ kind: 'bed', key })),
    ...sounds.flatMap((key) =>
      Array.from({ length: takesOf(key) }, (unused, take) => jobName({ kind: 'sound', key, take })),
    ),
  ];
  assert.equal(new Set(names).size, names.length);
});

test('every bed loops without a seam: its last sample runs into its first as any sample into the next', () => {
  for (const key of beds) {
    const made = runJob({ kind: 'bed', key });
    assert.ok(made);
    const samples = made.samples;
    const steps = Array.from({ length: samples.length - 1 }, (unused, i) =>
      Math.abs((samples[i + 1] ?? 0) - (samples[i] ?? 0)),
    );
    const sorted = [...steps].sort((one, other) => one - other);
    const usual = sorted[Math.floor(sorted.length * 0.999)] ?? 0;
    const last = samples.length - 1;
    const seam = Math.abs((samples[0] ?? 0) - (samples[last] ?? 0));
    assert.ok(seam <= usual, `${key}: the seam steps ${seam}, past 99.9% of its steps (${usual})`);
    const bend = Math.abs((samples[1] ?? 0) - (samples[0] ?? 0) - ((samples[last] ?? 0) - (samples[last - 1] ?? 0)));
    assert.ok(bend <= usual * 2, `${key}: the seam bends ${bend}`);
    let [power, peak] = [0, 0];
    for (const value of samples) [power, peak] = [power + value * value, Math.max(peak, Math.abs(value))];
    const rms = Math.sqrt(power / samples.length);
    assert.ok(peak <= 0.95 + 1e-6, `${key} peaks under the ceiling`);
    assert.ok(Math.abs(rms - BED_RMS) < 0.002 || peak > 0.949, `${key} is levelled: ${rms}`);
  }
});

test('every take is whole, under its ceiling, and starts and ends in silence', () => {
  for (const key of sounds)
    for (let take = 0; take < takesOf(key); take++) {
      const made = runJob({ kind: 'sound', key, take });
      assert.ok(made);
      const samples = made.samples;
      let peak = 0;
      for (const value of samples) {
        assert.ok(Number.isFinite(value), `${key} ${take} is whole`);
        peak = Math.max(peak, Math.abs(value));
      }
      assert.ok(peak > 0.1 && peak <= 1 + 1e-6, `${key} ${take} peaks at ${peak}`);
      assert.ok(Math.abs(samples[0] ?? 0) < 0.05, `${key} ${take} starts quiet`);
      assert.ok(Math.abs(samples[samples.length - 1] ?? 0) < 1e-3, `${key} ${take} ends quiet`);
    }
});
