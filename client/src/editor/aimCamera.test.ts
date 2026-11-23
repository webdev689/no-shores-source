import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookReach } from './aim.ts';
import { AIM_CAM_TAU, type AimAsk, AimCamera, type AimShip, type Laid } from './aimCamera.ts';
import { aimStation, inItsRig, LOWEST_ELEVATION } from './aimStation.ts';
import { orbitClearance } from './shipClear.ts';
import { hullBox, SLOOP_HULL } from '../ships/hulls.ts';

// Heading north: starboard is east, forward is north (south negative).
const SHIP: AimShip = { x: 100, y: 200, heading: 0, heave: 0, pitch: 0, roll: 0, hull: SLOOP_HULL };
const HOME = { eye: [100, 275, 30] as const, yaw: 0, pitch: 0.3 };
const STATION = aimStation(SLOOP_HULL);
const ON_STARBOARD = [SHIP.x + STATION.eye[1], SHIP.y - STATION.eye[0], STATION.eye[2]] as const;
const near = (actual: number, wanted: number, within = 1e-6) => Math.abs(actual - wanted) <= within;
const gap = (one: readonly number[], other: readonly number[]) =>
  Math.hypot(...one.map((value, axis) => value - (other[axis] ?? 0)));
const asked = (want: 1 | -1 | null, more: Partial<AimAsk> = {}): AimAsk => ({
  home: HOME,
  want,
  ship: SHIP,
  pitch: 0.1,
  lay: null,
  ...more,
});
/** Where a view's middle meets the sea (z = 0), from its eye. */
const onSea = (view: { eye: readonly number[]; yaw: number; pitch: number }) => {
  const reach = (view.eye[2] ?? 0) / Math.tan(view.pitch);
  return [(view.eye[0] ?? 0) + Math.sin(view.yaw) * reach, (view.eye[1] ?? 0) - Math.cos(view.yaw) * reach] as const;
};
const settled = (camera: AimCamera, ask: AimAsk, frames = 180) => {
  let frame = camera.frame(ask, 1 / 60);
  for (let step = 1; step < frames; step++) frame = camera.frame(ask, 1 / 60);
  return frame;
};

test('pressing aim eases the view out to its battery over a fifth of a second, not in one frame', () => {
  const camera = new AimCamera();
  const first = camera.frame(asked(1), 1 / 60);
  // DFO's: k eases by 1 - e^(-dt / tau), the eye moves by k smoothstepped: barely, the first frame.
  assert.ok(AIM_CAM_TAU > 0.1 && gap(first.eye, HOME.eye) < 0.05 * gap(ON_STARBOARD, HOME.eye), 'barely moved');
  const aimed = settled(camera, asked(1));
  assert.ok(gap(aimed.eye, ON_STARBOARD) < 0.01, 'three seconds on it stands at the battery');
});

/** Whether a point in the world stands inside any part of the ship at `SHIP` (its hull or a sail's swing). */
/** Whether a point in the world stands where its hull is (under its rail) or where its rig can come: an eye aboard
 *  stands over its deck, clear of both, and comes in over its rail. */
const inside = (hull: number, point: readonly number[]) => {
  const local = [SHIP.y - (point[1] ?? 0), (point[0] ?? 0) - SHIP.x, point[2] ?? 0] as const;
  const [low, high] = hullBox(hull);
  const [along, out, up] = local;
  const underRail = along > low[0] && along < high[0] && Math.abs(out) < high[1] && up < high[2] - 1;
  return underRail || inItsRig(hull, local, 0);
};

test('from the far beam, out to the battery and home again, the eye goes round the ship, never through its rig', () => {
  for (const hull of [0, 2]) {
    const ship = { ...SHIP, hull };
    // The camera's own place across the ship from the side looked at, as the fight's orbit stands when aiming starts.
    for (const home of [
      { eye: [SHIP.x - 14, SHIP.y + 2, 8] as const, yaw: Math.PI / 2, pitch: 0.3 },
      { eye: [SHIP.x - 75, SHIP.y, 30] as const, yaw: Math.PI / 2, pitch: 0.3 },
    ]) {
      const camera = new AimCamera();
      const ask = (want: 1 | -1 | null) => asked(want, { ship, home });
      for (let frame = 0; frame < 150; frame++) {
        const { eye } = camera.frame(ask(1), 1 / 60);
        assert.ok(!inside(hull, eye), `hull ${hull}, out, frame ${frame}: ${eye.map((value) => value.toFixed(1))}`);
      }
      for (let frame = 0; frame < 150; frame++) {
        const { eye } = camera.frame(ask(null), 1 / 60);
        assert.ok(!inside(hull, eye), `hull ${hull}, home, frame ${frame}: ${eye.map((value) => value.toFixed(1))}`);
      }
    }
  }
});

test('taken from any place round any hull, near or far, the eye swings out and round in one sweep, never through a sail', () => {
  for (const hull of [0, 1, 2, 3]) {
    const ship = { ...SHIP, hull };
    for (let degrees = 0; degrees < 360; degrees += 30)
      for (const pitch of [0.05, 0.3, 0.8])
        for (const zoom of [11.4, 25.6]) {
          const yaw = (degrees * Math.PI) / 180;
          const away = Math.max(zoom, orbitClearance(ship, [SHIP.x, SHIP.y, 6], yaw, pitch));
          const back = [-Math.sin(yaw) * Math.cos(pitch), Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch)];
          const eye = [
            SHIP.x + (back[0] ?? 0) * away,
            SHIP.y + (back[1] ?? 0) * away,
            6 + (back[2] ?? 0) * away,
          ] as const;
          for (const side of [1, -1] as const) {
            const camera = new AimCamera();
            const outs: number[] = [];
            for (let frame = 0; frame < 90; frame++) {
              const drawn = camera.frame(asked(side, { ship, home: { eye, yaw, pitch } }), 1 / 60).eye;
              outs.push(Math.hypot((drawn[0] ?? 0) - SHIP.x, (drawn[1] ?? 0) - SHIP.y));
              assert.ok(!inside(hull, drawn), `hull ${hull} ${degrees}° ${pitch} ${zoom} m, frame ${frame}`);
            }
            outs.forEach((here, index) => {
              const [before, after] = [outs[index - 1] ?? here, outs[index + 1] ?? here];
              const detour =
                (here - before) * (here - after) > 0 ? Math.min(Math.abs(here - before), Math.abs(here - after)) : 0;
              assert.ok(
                detour < 0.05,
                `hull ${hull} ${degrees}° ${pitch} ${zoom} m: out and back ${detour.toFixed(2)} m`,
              );
            });
          }
        }
  }
});

test('the view looks square off the side taken at the water its guns are laid on: the sight is on the lay', () => {
  const aimed = settled(new AimCamera(), asked(1));
  assert.ok(aimed.look, 'it lays');
  assert.equal(aimed.look.bearing, 90);
  const range = STATION.eye[1] + lookReach(-0.1, STATION.eye[2]);
  assert.ok(near(aimed.look.range, range), `${aimed.look.range} m out`);
  const [east, south] = onSea(aimed);
  assert.ok(near(east, SHIP.x + range, 1e-6), "the view's middle meets the sea that far out from its middle");
  assert.ok(near(south, SHIP.y - STATION.ports[0], 1e-6), "and square off the battery's middle");
  const ray = aimed.look.ray ?? [];
  const way = [Math.sin(aimed.yaw) * Math.cos(aimed.pitch), -Math.cos(aimed.yaw) * Math.cos(aimed.pitch)];
  assert.ok(near(ray[3] ?? 0, way[0] ?? 0) && near(ray[4] ?? 0, way[1] ?? 0), "the look's ray is the view's middle");
  const port = settled(new AimCamera(), asked(-1));
  assert.ok(port.look && port.look.bearing === -90 && near(onSea(port)[0], SHIP.x - range, 1e-6));
});

test("the view turns along the keel to stand over the volley's fall, the ship's own way carried by its balls", () => {
  const fall = [SHIP.x + 40, SHIP.y - 1 - 4, 0] as const;
  const lay: Laid = {
    side: 'starboard',
    launches: [[SHIP.x + 3, SHIP.y - 1, 2, 50, -5, 3]],
    ends: [{ point: fall }],
    elevation: 0,
    reach: 300,
  };
  const aimed = settled(new AimCamera(), asked(1, { lay }));
  const bearing = (to: readonly number[]) => Math.atan2((to[0] ?? 0) - aimed.eye[0], aimed.eye[1] - (to[1] ?? 0));
  assert.ok(near(aimed.yaw, bearing(fall), 1e-6), 'its middle looks over the fall');
  assert.ok(near(bearing(onSea(aimed)), bearing(fall), 1e-6), 'and meets the water on that line');
  const otherSide = settled(new AimCamera(), asked(-1, { lay }));
  assert.ok(near(onSea(otherSide)[1], SHIP.y - STATION.ports[0], 1e-6), "the other side's lay does not move it");
});

test("a look past the guns' longest throw or short of their nearest is held there, and its pitch with it", () => {
  const lay: Laid = {
    side: 'starboard',
    launches: [[SHIP.x + 3, SHIP.y, 2, 0, 0, 0]],
    ends: [],
    elevation: 0.2,
    reach: 60,
  };
  const far = settled(new AimCamera(), asked(1, { lay, pitch: -0.15 }));
  assert.ok(far.look && near(far.look.range, 63), `held at ${far.look?.range} m`);
  assert.ok(near(STATION.eye[1] + lookReach(-far.heldPitch, STATION.eye[2]), 63, 1e-6), 'its pitch held to match');
  const close = settled(new AimCamera(), asked(1, { pitch: 1.2 }));
  assert.ok(close.look && near(close.look.range, STATION.nearestM), `held at ${close.look?.range} m`);
});

test('with its guns at their lowest, the view goes no nearer than where their balls fall as the ship lies now', () => {
  // A crest under the ship and a trough out there carry the lowest lay past its nearest at rest.
  const lay: Laid = {
    side: 'starboard',
    launches: [[SHIP.x + 3, SHIP.y, 3, 0, 0, 0]],
    ends: [{ point: [SHIP.x + 21, SHIP.y - 2, -0.7] }],
    elevation: -LOWEST_ELEVATION,
    reach: 150,
  };
  const close = settled(new AimCamera(), asked(1, { lay, pitch: 1.2 }));
  assert.ok(close.look && near(close.look.range, 21, 1e-9), `held at ${close.look?.range} m`);
  assert.ok(near(onSea(close)[0], SHIP.x + 21, 1e-6), 'and the sight stands there');
  const lower = settled(new AimCamera(), asked(1, { lay: { ...lay, elevation: 0.05 - LOWEST_ELEVATION }, pitch: 1.2 }));
  assert.ok(lower.look && near(lower.look.range, STATION.nearestM), 'guns that could go lower hold it at rest');
});

test("a ship drawn as one hull and firing another's guns lays no nearer than those guns reach", () => {
  const brigFiringSloop = { ...SHIP, hull: 2, guns: SLOOP_HULL };
  const close = settled(new AimCamera(), asked(1, { ship: brigFiringSloop, pitch: 1.2 }));
  assert.ok(close.look && near(close.look.range, aimStation(SLOOP_HULL).nearestM), `${close.look?.range} m`);
  assert.ok(aimStation(2).nearestM > aimStation(SLOOP_HULL).nearestM + 2, "the Brig's own reach nearer is longer");
});

test('letting go eases the view home again, and once home the camera is its own', () => {
  const camera = new AimCamera();
  settled(camera, asked(1));
  const leaving = camera.frame(asked(null), 1 / 60);
  assert.ok(gap(leaving.eye, ON_STARBOARD) < 0.05 * gap(HOME.eye, ON_STARBOARD), 'the first frame still stands by');
  assert.equal(leaving.look, null, 'and lays nothing');
  const home = settled(camera, asked(null), 240);
  assert.deepEqual([home.eye, home.yaw, home.pitch], [HOME.eye, HOME.yaw, HOME.pitch]);
});

test('a held aim keeps the side it was taken on; taken again on the other, it goes home first, never across the ship', () => {
  const camera = new AimCamera();
  settled(camera, asked(1));
  assert.equal(camera.frame(asked(-1), 1 / 60).look?.bearing, 90, 'held, the look stays on starboard');
  camera.frame(asked(null), 1 / 60);
  const [low, high] = hullBox(SLOOP_HULL);
  const sides = new Set<number>();
  let frame = camera.frame(asked(-1), 1 / 60);
  for (let step = 0; step < 240; step++) {
    frame = camera.frame(asked(-1), 1 / 60);
    const [east, south, up] = frame.eye;
    const [along, out] = [SHIP.y - south, east - SHIP.x];
    if (along > low[0] && along < high[0] && Math.abs(out) < high[1] + 1 && up < 20) sides.add(Math.sign(out));
  }
  assert.ok(sides.size < 2, 'over the ship only on the side it goes out to: never across its middle');
  assert.ok(
    frame.look?.bearing === -90 && gap(frame.eye, [SHIP.x - STATION.eye[1], ON_STARBOARD[1], ON_STARBOARD[2]]) < 0.01,
  );
});

test('the eye rides the ship as drawn: its heave, its bow rising and its heel carry it', () => {
  const camera = new AimCamera();
  settled(camera, asked(1));
  const rolled = { ...SHIP, heave: 1.5, roll: 0.2, pitch: 0.1, heading: 0.3 };
  const aimed = settled(camera, asked(1, { ship: rolled }), 30);
  // Starboard heeled down by 0.2 rad: the eye stands lower than over a level deck, and moves with it.
  const level = settled(new AimCamera(), asked(1, { ship: { ...rolled, roll: 0, pitch: 0 } }));
  assert.ok(aimed.eye[2] < level.eye[2] - 0.1, `${aimed.eye[2]} against ${level.eye[2]}`);
  assert.ok(near(gap(aimed.eye, [rolled.x, rolled.y, rolled.heave]), gap(ON_STARBOARD, [SHIP.x, SHIP.y, 0]), 1e-6));
});

test('the eye aboard leans in on the zoom as it eases in', () => {
  const camera = new AimCamera();
  const first = camera.frame(asked(1), 1 / 60);
  assert.ok(first.eased > 0 && first.eased < 0.1, `${first.eased}`);
  assert.ok(settled(camera, asked(1), 120).eased > 0.999);
  assert.equal(settled(camera, asked(null), 240).eased, 0, 'home, none');
});
