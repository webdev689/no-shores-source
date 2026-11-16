import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { paintPicture, pictureUses } from './picture.ts';

const table = <Table>(name: string): Table =>
  JSON.parse(readFileSync(new URL(`../../../content/forged/${name}.json`, import.meta.url), 'utf8')) as Table;
const uses = pictureUses({ buildings: table('buildings'), props: table('props'), roomkit: table('roomkit') });
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/**
 * [archive, record, frame, then the first 16 hex digits of the SHA-256 of the picture's RGBA and of its glass] as
 * DFO Online's own painter gives them, run in Node: walls of each climate and their winters, the city specials,
 * roofs, doors, rooms, marble floors, paintings, solids, lone archives, an animated hearth, dungeons and the ground.
 */
// prettier-ignore
const DFO_PICTURES: readonly (readonly [number, number, number, string, string | null])[] = [
  [12, 0, 0, 'bd765c8479942dbd', null],
  [12, 3, 0, 'b074eacc416edb99', 'd1fa7eeb736d96a6'],
  [26, 3, 0, '6889c8ab322917b3', '3fa6abfae7d5513f'],
  [9, 4, 0, '71fd0a9e93ec0526', null],
  [109, 1, 0, '62aa6dcb37a72265', null],
  [112, 3, 0, 'baed6306cd0724b0', 'a6a450dd46a1c662'],
  [135, 0, 0, 'b9e61a8a37002fae', null],
  [161, 1, 0, 'c6d47f6619fc05ac', null],
  [164, 0, 0, '97bce9c9fa382ad0', null],
  [129, 4, 0, 'f49fbcd53b8ace32', null],
  [312, 3, 0, '3c3495192ad56d30', 'a6a450dd46a1c662'],
  [314, 0, 0, '59b2b14a49add951', null],
  [326, 2, 0, '8d96370e3076be52', null],
  [342, 0, 0, '8c92e9d2cd98fc56', null],
  [358, 2, 0, '17c9527b27c92897', null],
  [361, 3, 0, '098c25b7ab5d6231', 'fa30d653d68cb504'],
  [364, 0, 0, '0073d07c6fed9c96', null],
  [409, 0, 0, '45cd0de80a23fd5b', null],
  [426, 1, 0, '276885b08e8a3a0c', null],
  [464, 3, 0, 'c79bc50cc3c57a0e', '8eb0ffe2b5678799'],
  [313, 1, 0, '331802a38bf43e8e', null],
  [165, 3, 0, '58583fd46c68550c', '01cd1e613be39b7d'],
  [413, 0, 0, 'f1e3aed6dbbe1a53', null],
  [79, 0, 0, '1ad0f338aaec6e57', '01cd1e613be39b7d'],
  [80, 0, 0, '39b088a2ee3ce766', '01cd1e613be39b7d'],
  [82, 1, 0, 'd7f6e72a323a5d92', null],
  [83, 1, 0, '4e5ec8334c9633ce', null],
  [69, 0, 0, 'a2d8fa2fe1da0b7c', null],
  [169, 1, 0, 'be302c81bacfd126', null],
  [369, 2, 0, '2151fdb649c89158', null],
  [469, 2, 0, 'a4b516b048197914', null],
  [370, 3, 0, '71c55f8fbae4c24f', null],
  [74, 2, 0, '872cfdd239caf42c', null],
  [74, 3, 0, '7c165fe6f0ed79b3', null],
  [174, 3, 0, 'ddae1fb2c8c40af6', null],
  [374, 0, 0, 'ba291c7ce8274e33', null],
  [474, 0, 0, '4edb6ef6868e2425', null],
  [16, 2, 0, 'f726055ed9066803', '6933a18981ee602d'],
  [16, 3, 0, '4644038933bf04fa', null],
  [116, 2, 0, '589344a00b00a1c0', 'e215e19a6072d754'],
  [37, 1, 0, 'b7904780957452ee', null],
  [163, 0, 0, 'b56c64fb5c45b105', null],
  [337, 0, 0, 'b86720c08fe1dc1c', null],
  [463, 1, 0, '52be9729526ac083', null],
  [66, 3, 0, 'e4c41804a91e0168', null],
  [440, 3, 0, '3fd54203e374c4b5', null],
  [337, 3, 0, '7fced07078f045c6', null],
  [328, 4, 0, 'adf732c90fd1e097', null],
  [41, 0, 0, '923ed3d9199d0119', null],
  [148, 3, 0, 'a566dd0a8f76d486', null],
  [0, 77, 0, '2230fbc2156f99d2', null],
  [1, 5, 0, '1197b0c3f078d417', null],
  [33, 0, 0, 'a5b23df70e61980a', null],
  [57, 1, 0, '472d059b761b8741', null],
  [71, 0, 0, 'fc6a26dd0c21115d', null],
  [73, 0, 0, '3f9bd0034635971a', null],
  [81, 0, 0, '10df82214b1494ae', null],
  [87, 0, 0, 'fbfd8da3f3d1ce53', null],
  [87, 0, 1, 'ace3523f261a6d52', null],
  [87, 0, 3, '8704ca98317238e9', null],
  [93, 0, 0, '29fba99404092524', null],
  [333, 0, 0, '399ceea3df5b8c50', null],
  [22, 0, 0, '2fd2f6a5c6ade0d6', null],
  [123, 1, 0, 'c03a7b84c905b462', null],
  [324, 2, 0, '48b5d40da6dfd678', null],
  [2, 5, 0, '2e00610c79595f35', null],
  [3, 13, 0, '93b7b7697c466e1a', null],
  [4, 46, 0, 'c34cd8cc169710e4', null],
  [102, 20, 0, 'c1ee4c13aab9682a', null],
  [103, 33, 0, '00da51d2ddec4768', null],
  [104, 47, 0, 'f957703189b34820', null],
  [302, 6, 0, '43407f75e39456ae', null],
  [302, 54, 0, '762043a8820e2cb6', null],
  [303, 29, 0, '731b389f6785218c', null],
  [304, 55, 0, 'd68fcd5057c385e0', null],
  [402, 11, 0, '4e90eb1d9c9f8380', null],
  [403, 18, 0, '923f3ae04e04fead', null],
  [404, 39, 0, 'd1ac2d3ee5fe41c8', null],
];

test('every picture is the bytes DFO Online paints for it, its glass too', () => {
  for (const [archive, record, frame, rgba, glass] of DFO_PICTURES) {
    const picture = paintPicture(archive, record, frame, uses);
    assert.ok(picture, `${archive}.${record}.${frame} is painted`);
    assert.equal(digest(picture.rgba), rgba, `${archive}.${record}.${frame}`);
    assert.equal(picture.glass && digest(picture.glass), glass, `${archive}.${record}.${frame}'s glass`);
  }
});
