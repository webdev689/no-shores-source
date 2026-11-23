import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GpuTimer, MOST_PASSES, RING, zoneTimes } from './gpuTimer.ts';

test('each pass counts its end less its beginning to its zone; a pass never written counts nothing', () => {
  const stamps = new BigUint64Array([1_000_000n, 3_000_000n, 3_000_000n, 3_500_000n, 0n, 0n, 4_000_000n, 5_000_000n]);
  const times = zoneTimes(['main', 'water', 'water', 'main'], stamps);
  assert.deepEqual(
    [...times],
    [
      ['main', 3],
      ['water', 0.5],
    ],
  );
});

/** A device with timestamps whose read-backs wait until `land` lets them through, in the order asked. */
function fakeDevice(timestamps = true) {
  const waiting: (() => void)[] = [];
  const submitted: string[] = [];
  const passes: (GPURenderPassTimestampWrites | undefined)[] = [];
  const pass = { end() {} };
  const device = {
    features: new Set(timestamps ? ['timestamp-query'] : []),
    createQuerySet: () => ({}),
    createBuffer: ({ size }: { size: number }) => {
      const words = new BigUint64Array(size / 8).map((_unused, index) => BigInt((index + 1) * 1_000_000));
      return {
        mapAsync: () => new Promise<void>((done) => waiting.push(done)),
        getMappedRange: () => words.buffer,
        unmap() {},
      };
    },
    createCommandEncoder: () => ({
      beginRenderPass: (descriptor: GPURenderPassDescriptor) => (passes.push(descriptor.timestampWrites), pass),
      beginComputePass: (descriptor: GPUComputePassDescriptor) => (passes.push(descriptor.timestampWrites), pass),
      resolveQuerySet: () => submitted.push('resolve'),
      copyBufferToBuffer() {},
      finish: () => ({}),
    }),
    queue: { submit() {} },
  } as unknown as GPUDevice;
  const land = async () => {
    for (const done of waiting.splice(0)) done();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { device, passes, submitted, land };
}

test('a device without timestamps has no timer', () => {
  assert.equal(
    GpuTimer.forDevice(fakeDevice(false).device, () => undefined),
    null,
  );
});

test('a timed frame stamps each pass under the zone named last, and hands back its times once read', async () => {
  const { device, passes, land } = fakeDevice();
  const heard: Map<string, number>[] = [];
  const timer = GpuTimer.forDevice(device, (times) => heard.push(times));
  assert.ok(timer);
  timer.start();
  const encoder = timer.timed(device.createCommandEncoder());
  timer.mark('shadows');
  encoder.beginRenderPass({ colorAttachments: [] });
  timer.mark('water');
  encoder.beginComputePass();
  encoder.beginRenderPass({ colorAttachments: [] });
  timer.finish();
  assert.deepEqual(
    passes.map((writes) => [writes?.beginningOfPassWriteIndex, writes?.endOfPassWriteIndex]),
    [
      [0, 1],
      [2, 3],
      [4, 5],
    ],
  );
  assert.equal(heard.length, 0, 'nothing is waited for');
  await land();
  // The fake's stamps are 1 ms apart, so each pass took 1 ms.
  assert.deepEqual(
    [...(heard[0] ?? [])],
    [
      ['shadows', 1],
      ['water', 2],
    ],
  );
});

test('frames go untimed while every slot of the ring is out, and are timed again once one comes back', async () => {
  const { device, passes, land } = fakeDevice();
  let heard = 0;
  const timer = GpuTimer.forDevice(device, () => heard++);
  assert.ok(timer);
  const frame = () => {
    timer.start();
    timer.timed(device.createCommandEncoder()).beginRenderPass({ colorAttachments: [] });
    timer.finish();
  };
  for (let index = 0; index < RING + 2; index++) frame();
  assert.equal(passes.filter((writes) => writes).length, RING, 'the frames past the ring are not stamped');
  await land();
  assert.equal(heard, RING);
  frame();
  assert.ok(passes.at(-1), 'a slot back is used again');
});

test('a frame stamps its first MOST_PASSES passes and no more; a frame with no passes reads nothing', async () => {
  const { device, passes, submitted, land } = fakeDevice();
  const timer = GpuTimer.forDevice(device, () => undefined);
  assert.ok(timer);
  timer.start();
  timer.finish();
  assert.equal(submitted.length, 0);
  timer.start();
  const encoder = timer.timed(device.createCommandEncoder());
  for (let index = 0; index < MOST_PASSES + 3; index++) encoder.beginRenderPass({ colorAttachments: [] });
  timer.finish();
  assert.equal(passes.filter((writes) => writes).length, MOST_PASSES);
  await land();
});

test('an encoder outside a timed frame is left as it is', () => {
  const { device } = fakeDevice();
  const timer = GpuTimer.forDevice(device, () => undefined);
  const encoder = device.createCommandEncoder();
  const own = encoder.beginRenderPass;
  assert.equal(timer?.timed(encoder).beginRenderPass, own);
});
