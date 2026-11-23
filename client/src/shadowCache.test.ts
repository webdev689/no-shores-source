import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CastRecording, FAR_HELD_FRAMES, farRedrawn, foldSignature } from './shadowCache.ts';

/** A pass that keeps the names and arguments of the calls made into it. */
function keepingPass(): { pass: GPURenderPassEncoder; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const pass = new Proxy({} as GPURenderPassEncoder, {
    get:
      (_target, name) =>
      (...args: unknown[]) =>
        calls.push([name, ...args]),
  });
  return { pass, calls };
}

/** Two casters' draws, as a city's and a ship's would come: their pipelines, groups and buffers, then their draws. */
const city = { pipeline: {}, group: {}, vertices: {} };
const ship = { pipeline: {}, group: {}, vertices: {} };
function drawCity(pass: GPURenderPassEncoder, first = 0): void {
  pass.setPipeline(city.pipeline as GPURenderPipeline);
  pass.setBindGroup(0, city.group as GPUBindGroup);
  pass.setVertexBuffer(0, city.vertices as GPUBuffer);
  pass.draw(42, 100, 0, first);
  pass.draw(42, 30, 0, first + 200);
}
function drawShip(pass: GPURenderPassEncoder, vertices = ship.vertices): void {
  pass.setPipeline(ship.pipeline as GPURenderPipeline);
  pass.setBindGroup(0, ship.group as GPUBindGroup);
  pass.setVertexBuffer(0, vertices as GPUBuffer);
  pass.drawIndexed(3000);
}
function signed(draw: (recording: CastRecording) => void): number {
  const recording = new CastRecording();
  draw(recording);
  return recording.signature;
}

test('a signature is a sum: the same words in another order fold alike, another word does not', () => {
  assert.equal(foldSignature(foldSignature(0, 7), 11), foldSignature(foldSignature(0, 11), 7));
  assert.notEqual(foldSignature(0, 7), foldSignature(0, 8));
});

test('a recording draws nothing, and makes every call kept, in order, into a pass that draws', () => {
  const recording = new CastRecording();
  drawCity(recording.pass);
  drawShip(recording.pass);
  const { pass, calls } = keepingPass();
  recording.replay(pass);
  const wanted = keepingPass();
  drawCity(wanted.pass);
  drawShip(wanted.pass);
  assert.deepEqual(calls, wanted.calls);
  assert.equal(calls.length, 9);
});

test("the same draws sign alike whichever caster comes first, as the drawers' order may change", () => {
  const both = signed((recording) => {
    drawCity(recording.pass);
    drawShip(recording.pass);
  });
  const turned = signed((recording) => {
    drawShip(recording.pass);
    drawCity(recording.pass);
  });
  assert.equal(both, turned);
  assert.equal(
    signed((recording) => drawCity(recording.pass)),
    signed((recording) => drawCity(recording.pass)),
  );
});

test('a draw that comes or goes, moves in its buffer, or reads another buffer signs otherwise', () => {
  const both = signed((recording) => {
    drawCity(recording.pass);
    drawShip(recording.pass);
  });
  const cityAlone = signed((recording) => drawCity(recording.pass));
  const moved = signed((recording) => {
    drawCity(recording.pass, 1);
    drawShip(recording.pass);
  });
  const otherHull = signed((recording) => {
    drawCity(recording.pass);
    drawShip(recording.pass, {});
  });
  assert.equal(new Set([both, cityAlone, moved, otherHull]).size, 4);
});

test("a tally signs what draws do not show: a ship moved signs otherwise, two ships' places in either order alike", () => {
  const placed = (first: number, second: number) =>
    signed((recording) => {
      recording.tally([first, 0.5, 2]);
      drawShip(recording.pass);
      recording.tally([second, 0.5, 2]);
      drawShip(recording.pass);
    });
  assert.equal(placed(1200.25, 1300.5), placed(1300.5, 1200.25));
  assert.notEqual(placed(1200.25, 1300.5), placed(1200.26, 1300.5));
});

test('the far map is drawn when it holds nothing, another view or other casters, or has been kept long enough', () => {
  const view = {};
  assert.equal(farRedrawn(null, view, 5), true);
  assert.equal(farRedrawn({ view, signature: 5, frames: 0 }, view, 5), false);
  assert.equal(farRedrawn({ view, signature: 5, frames: 0 }, {}, 5), true);
  assert.equal(farRedrawn({ view, signature: 5, frames: 0 }, view, 6), true);
  assert.equal(farRedrawn({ view, signature: 5, frames: FAR_HELD_FRAMES - 1 }, view, 5), false);
  assert.equal(farRedrawn({ view, signature: 5, frames: FAR_HELD_FRAMES }, view, 5), true);
  assert.equal(FAR_HELD_FRAMES, 60);
});
