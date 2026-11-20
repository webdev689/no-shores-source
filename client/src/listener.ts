// The page's one audio listener, round which the world's sounds and the ambience both place theirs. The ambience
// counts its frame from an origin (her ship, at sea, so all it plays rides with her); every sound placed through a
// panner is placed in that same frame, so neither hears the other's sounds kilometres away.

type Point = readonly [number, number, number];

/** Each page's frame origin (world metres east and south), as the ambience last set it; the world's own where unset. */
const origins = new WeakMap<BaseAudioContext, readonly [number, number]>();

/** A world point (east, south, up) as the listener's frame has it: x east, y up, z south, from the frame's origin. */
export function audioPoint(audio: BaseAudioContext, point: Point): Point {
  const [east, south] = origins.get(audio) ?? [0, 0];
  return [point[0] - east, point[2], point[1] - south];
}

/** The listener at `eye` (world metres) facing `yaw` (clockwise from north, -y), up the world's up, in the frame
 *  counted from `origin` where given (which then stays its origin), else from the origin last given. */
export function listen(audio: BaseAudioContext, eye: Point, yaw: number, origin?: readonly [number, number]): void {
  if (origin) origins.set(audio, origin);
  const { listener } = audio;
  const [x, y, z] = audioPoint(audio, eye);
  const [ahead, along] = [Math.sin(yaw), -Math.cos(yaw)];
  // Browsers without the listener's parameters take its older calls.
  if (!(listener.positionX as AudioParam | undefined)) {
    listener.setPosition(x, y, z);
    listener.setOrientation(ahead, 0, along, 0, 1, 0);
    return;
  }
  [listener.positionX.value, listener.positionY.value, listener.positionZ.value] = [x, y, z];
  [listener.forwardX.value, listener.forwardY.value, listener.forwardZ.value] = [ahead, 0, along];
  [listener.upX.value, listener.upY.value, listener.upZ.value] = [0, 1, 0];
}
