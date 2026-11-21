// Measures what the rooms send: every node's room that takes players run with one player for a few seconds through
// the server's own door, the player running round in a ring and swinging as a browser sends it, each snapshot
// counted raw and as the WebSocket sends it, deflated on one stream whose window reaches back over the snapshots
// before (permessage-deflate's context takeover).
//
//     node tools/wireSizes.mjs [ticks]
//
// Needs the room's WebAssembly (`npm run wasm`) and the bake's node files (`npm run bake`).
import { readdir, readFile } from 'node:fs/promises';
import { constants, createDeflateRaw } from 'node:zlib';
import { inputBytes } from '../client/src/network/messages.ts';
import { startRoomDoor } from '../server/roomDoor.ts';

const TICKS = Number(process.argv[2] ?? 300);
const compiled = new WebAssembly.Module(
  await readFile(new URL('../target/wasm32-unknown-unknown/release/room_wasm.wasm', import.meta.url)),
);
const folder = new URL('../generated/nodes/', import.meta.url);

/** A deflate stream as a WebSocket keeps one: each message flushed whole, its window kept for the next. */
function socketDeflate() {
  const stream = createDeflateRaw({ windowBits: 15 });
  let out = 0;
  stream.on('data', (chunk) => (out += chunk.length));
  return (bytes) =>
    new Promise((resolve) => {
      const before = out;
      stream.write(bytes);
      // A message's last four bytes (the sync flush's empty block) are not sent, as RFC 7692 says.
      stream.flush(constants.Z_SYNC_FLUSH, () => resolve(out - before - 4));
    });
}

/** The most a datagram carries, in bytes: a snapshot past it would go by the stream instead. */
const DATAGRAM = 1100;
const middle = (values) => [...values].sort((one, two) => one - two)[Math.floor(values.length / 2)] ?? 0;
const kilobytes = (bytes) => (bytes / 1000).toFixed(2);

const rows = [];
for (const name of (await readdir(folder)).filter((file) => file.endsWith('.json')).sort()) {
  const door = startRoomDoor(compiled);
  if (!door.openNode(await readFile(new URL(name, folder), 'utf8'))) continue;
  door.reseed([1, 2, 3, 4]);
  const player = door.join();
  if (!player) continue;
  const deflate = socketDeflate();
  const raw = [];
  const sent = [];
  for (let tick = 1; tick <= TICKS; tick++) {
    const swing = tick % 30 === 0 ? 1 : 0;
    const intent = new Float64Array([1, 0, tick * 0.01, 1, 0, 0, 0, swing, 0, 0, 0, 0, 0, NaN, NaN, NaN]);
    const look = { anim: '', frame: 0, facing: tick * 0.01 };
    door.input(player, inputBytes(tick, { intent, look, arms: 0, seen: BigInt(tick - 1) }));
    door.tick();
    // The player's screen showed the last snapshot, as a browser's next input says: this one builds on it.
    const snapshot = door.snapshot(player);
    raw.push(snapshot.length);
    sent.push(await deflate(snapshot));
  }
  const welcome = door.joined(player).length;
  const gear = door.gear(player).length;
  const over = raw.filter((bytes) => bytes > DATAGRAM).length;
  rows.push({
    node: name.replace('.json', ''),
    raw: middle(raw),
    sent: middle(sent),
    most: Math.max(...sent),
    welcome,
    gear,
    over,
    count: raw.length,
  });
}
const garrisoned = rows;
for (const row of rows)
  console.log(
    `${row.node.padEnd(34)} raw ${kilobytes(row.raw)} KB  sent ${kilobytes(row.sent)} KB (most ${kilobytes(row.most)})  welcome ${row.welcome} B  gear ${row.gear} B`,
  );
const seconds = 1 / startRoomDoor(compiled).tickSeconds;
console.log(
  `\n${rows.length} rooms taking players: snapshot raw ${kilobytes(middle(garrisoned.map((row) => row.raw)))} KB at the median ` +
    `(${kilobytes(Math.min(...garrisoned.map((row) => row.raw)))} to ${kilobytes(Math.max(...garrisoned.map((row) => row.raw)))}), sent ` +
    `${kilobytes(middle(garrisoned.map((row) => row.sent)))} KB (${kilobytes(Math.min(...garrisoned.map((row) => row.sent)))} to ` +
    `${kilobytes(Math.max(...garrisoned.map((row) => row.sent)))}), about ${kilobytes(middle(garrisoned.map((row) => row.sent)) * seconds)} KB a second; ` +
    `${((100 * rows.reduce((sum, row) => sum + row.over, 0)) / rows.reduce((sum, row) => sum + row.count, 0)).toFixed(1)}% of snapshots past a ${DATAGRAM}-byte datagram`,
);
