// The GPU's own time for each pass of a frame, read with timestamp queries where the device has them. Each pass begun
// on a timed encoder writes the GPU's clock as it begins and as it ends, counted to the zone named last. A frame's
// stamps are resolved into one slot of a small ring and read back once the GPU is done with them, never waited for: a
// frame that finds every slot still out is not timed.
import { BUFFER_USAGE } from './gpu.ts';

/** Frames whose stamps may be out being read at once, and the most passes one frame times. */
export const RING = 3;
export const MOST_PASSES = 64;

/** `GPUMapMode.READ`, by the specification's value. */
const MAP_READ = 0x1;
/** Bytes a pass's two stamps take. */
const PASS_BYTES = 16;

/** One frame's stamps: their query set, the buffer they resolve into, the one they are read back from, and each
 *  pass's zone in the order the passes began. */
interface Slot {
  readonly stamps: GPUQuerySet;
  readonly resolved: GPUBuffer;
  readonly read: GPUBuffer;
  readonly zones: string[];
}

/** Milliseconds each zone's passes took, from `stamps`, two a pass in nanoseconds: its beginning, then its end. A pass
 *  whose end does not follow its beginning (never written, or both rounded to the same tick) counts nothing. */
export function zoneTimes(zones: readonly string[], stamps: BigUint64Array): Map<string, number> {
  const times = new Map<string, number>();
  zones.forEach((zone, index) => {
    const [begun, ended] = [stamps[index * 2] ?? 0n, stamps[index * 2 + 1] ?? 0n];
    const took = begun > 0n && ended > begun ? Number(ended - begun) / 1e6 : 0;
    times.set(zone, (times.get(zone) ?? 0) + took);
  });
  return times;
}

export class GpuTimer {
  private readonly device: GPUDevice;
  private readonly heard: (times: Map<string, number>) => void;
  private readonly free: Slot[];
  /** The slot this frame's passes write into, or null while it is not timed. */
  private slot: Slot | null = null;
  private zone = '';

  /** A timer on `device`, handing `heard` each timed frame's milliseconds by zone as they come back; null where the
   *  device has no timestamps. */
  static forDevice(device: GPUDevice, heard: (times: Map<string, number>) => void): GpuTimer | null {
    return device.features.has('timestamp-query') ? new GpuTimer(device, heard) : null;
  }

  private constructor(device: GPUDevice, heard: (times: Map<string, number>) => void) {
    [this.device, this.heard] = [device, heard];
    const size = MOST_PASSES * PASS_BYTES;
    this.free = Array.from({ length: RING }, () => ({
      stamps: device.createQuerySet({ type: 'timestamp', count: MOST_PASSES * 2 }),
      resolved: device.createBuffer({ size, usage: BUFFER_USAGE.queryResolve | BUFFER_USAGE.copySource }),
      read: device.createBuffer({ size, usage: BUFFER_USAGE.mapRead | BUFFER_USAGE.copyDestination }),
      zones: [],
    }));
  }

  /** Starts a frame, timed if a slot of the ring is free. */
  start(): void {
    this.slot = this.free.pop() ?? null;
  }

  /** Names the zone that passes begun from now on count to. */
  mark(zone: string): void {
    this.zone = zone;
  }

  /** `encoder`, each pass begun on it while the frame is timed writing its stamps into the frame's slot. The passes are
   *  begun by many views, so the encoder's own two calls are wrapped rather than each view handed the stamps. */
  timed(encoder: GPUCommandEncoder): GPUCommandEncoder {
    if (!this.slot) return encoder;
    const [render, compute] = [encoder.beginRenderPass.bind(encoder), encoder.beginComputePass.bind(encoder)];
    encoder.beginRenderPass = (descriptor) => render({ ...descriptor, ...this.writes() });
    encoder.beginComputePass = (descriptor) => compute({ ...descriptor, ...this.writes() });
    return encoder;
  }

  /** Ends the frame: its stamps resolved and copied aside in a command buffer after the frame's own, and read back
   *  once the GPU has done them, when the slot goes back to the ring. */
  finish(): void {
    const slot = this.slot;
    this.slot = null;
    if (!slot) return;
    const bytes = slot.zones.length * PASS_BYTES;
    if (bytes === 0) {
      this.free.push(slot);
      return;
    }
    const encoder = this.device.createCommandEncoder();
    encoder.resolveQuerySet(slot.stamps, 0, slot.zones.length * 2, slot.resolved, 0);
    encoder.copyBufferToBuffer(slot.resolved, 0, slot.read, 0, bytes);
    this.device.queue.submit([encoder.finish()]);
    slot.read.mapAsync(MAP_READ, 0, bytes).then(
      () => {
        const stamps = new BigUint64Array(slot.read.getMappedRange(0, bytes).slice(0));
        slot.read.unmap();
        const zones = slot.zones.splice(0);
        this.free.push(slot);
        this.heard(zoneTimes(zones, stamps));
      },
      // A device lost or destroyed reads nothing more; its slot is never needed again.
      () => undefined,
    );
  }

  /** The stamps for the next pass begun in the frame, none once it has timed its most. */
  private writes(): { timestampWrites?: GPURenderPassTimestampWrites } {
    const slot = this.slot;
    if (!slot || slot.zones.length >= MOST_PASSES) return {};
    const index = slot.zones.push(this.zone) - 1;
    return {
      timestampWrites: {
        querySet: slot.stamps,
        beginningOfPassWriteIndex: index * 2,
        endOfPassWriteIndex: index * 2 + 1,
      },
    };
  }
}
