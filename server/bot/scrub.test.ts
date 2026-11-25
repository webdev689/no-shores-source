// A picture's metadata taken out before anyone can fetch it: a JPEG's EXIF (GPS and all, its orientation kept), XMP,
// IPTC and comments; a PNG's text and EXIF chunks; a WebP's EXIF and XMP, its header set to match. Pixels untouched.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exifOrientation, scrubPicture } from './scrub.ts';

const segment = (marker: number, body: Buffer) =>
  Buffer.concat([Buffer.from([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255]), Buffer.from(body)]);
/** A little-endian EXIF block: IFD0 holding an orientation and a GPS pointer, and the GPS words after it. */
const exifBody = (orientation: number) => {
  const tiff = Buffer.alloc(8 + 2 + 2 * 12 + 4 + 16);
  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  tiff.writeUInt16LE(0x0112, 10);
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(orientation, 18);
  tiff.writeUInt16LE(0x8825, 22);
  tiff.writeUInt16LE(4, 24);
  tiff.writeUInt32LE(1, 26);
  tiff.writeUInt32LE(38, 30);
  tiff.write('GPS 51.5N 0.1W!!', 38, 'ascii');
  return Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
};
/** A scrub that must succeed. */
const scrubbed = (bytes: Uint8Array, type: string): Uint8Array => {
  const out = scrubPicture(bytes, type);
  assert.ok(out, 'the picture was read');
  return out;
};
const SCAN = Buffer.from([0x11, 0x22, 0x33, 0xff, 0x00, 0x44, 0xff, 0xd9]);
const jpeg = (orientation: number) =>
  Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'binary')),
    segment(0xe1, exifBody(orientation)),
    segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Home</x:xmpmeta>', 'binary')),
    segment(0xed, Buffer.from('Photoshop 3.0\0IPTC city', 'binary')),
    segment(0xfe, Buffer.from('taken at home', 'ascii')),
    segment(0xdb, Buffer.alloc(65, 1)),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    SCAN,
  ]);

test('scrub: a JPEG loses its EXIF, XMP, IPTC and comment, keeps its orientation beside JFIF, and its scan untouched', () => {
  const out = Buffer.from(scrubbed(new Uint8Array(jpeg(6)), 'image/jpeg'));
  for (const gone of ['GPS', 'xmpmeta', 'IPTC', 'taken at home', 'Home']) assert.equal(out.includes(gone), false, gone);
  assert.ok(out.subarray(-SCAN.length).equals(SCAN), 'the picture itself is unchanged');
  assert.ok(out.subarray(2, 4).equals(Buffer.from([0xff, 0xe0])), 'JFIF first');
  const app1 = out.indexOf(Buffer.from([0xff, 0xe1]));
  assert.ok(app1 > 4, 'the orientation after JFIF');
  assert.equal(exifOrientation(out.subarray(app1 + 10)), 6, 'a phone photo still stands upright');
  const upright = Buffer.from(scrubbed(new Uint8Array(jpeg(1)), 'image/jpeg'));
  assert.equal(upright.includes(Buffer.from([0xff, 0xe1])), false, 'an upright photo needs no EXIF at all');
  assert.equal(
    scrubPicture(new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03]), 'image/jpeg'),
    null,
    'a file that cannot be followed is refused',
  );
});

test('scrub: a PNG loses its text, time and EXIF chunks; a WebP its EXIF and XMP, with its flags and size set to match', () => {
  const chunk = (kind: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'ascii');
    Buffer.from(body).copy(out, 8);
    return out;
  };
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('tEXt', Buffer.from('Author\0Ann')),
    chunk('eXIf', Buffer.from('GPS')),
    chunk('tIME', Buffer.alloc(7)),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const cleanPng = Buffer.from(scrubbed(new Uint8Array(png), 'image/png'));
  for (const gone of ['tEXt', 'eXIf', 'tIME', 'Author']) assert.equal(cleanPng.includes(gone), false, gone);
  assert.ok(cleanPng.includes('IDAT') && cleanPng.includes('IEND'));
  const riff = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(kind, 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, Buffer.from(body), body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c | 0x10;
  const chunks = Buffer.concat([
    riff('VP8X', vp8x),
    riff('VP8 ', Buffer.from([9, 9, 9])),
    riff('EXIF', Buffer.from('GPS here')),
    riff('XMP ', Buffer.from('<xmp/>')),
  ]);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(chunks.length + 4, 4);
  head.write('WEBP', 8, 'ascii');
  const cleanWebp = Buffer.from(scrubbed(new Uint8Array(Buffer.concat([head, chunks])), 'image/webp'));
  assert.equal(cleanWebp.includes('GPS'), false);
  assert.equal(cleanWebp.includes('XMP '), false);
  assert.equal(cleanWebp.readUInt32LE(4), cleanWebp.length - 8, "the container's size matches what is left");
  assert.equal(cleanWebp[20] & 0x0c, 0, 'the header no longer claims EXIF or XMP');
  assert.equal(cleanWebp[20] & 0x10, 0x10, 'other flags are kept');
});

test("scrub: a JPEG keeps only what draws it - JFIF without its thumbnail, an ICC profile, Adobe's - and nothing after its end", () => {
  const thumb = Buffer.concat([
    Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\x02\x01', 'binary'),
    Buffer.from('THUMBTHUMBTHUMBTHUMB'),
  ]);
  const icc = Buffer.from('ICC_PROFILE\0\x01\x01colour', 'binary');
  const progressive = Buffer.from([0x55, 0xff, 0x00, 0x66, 0xff, 0xd3, 0x77]);
  const file = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, thumb),
    segment(0xe2, icc),
    segment(0xe2, Buffer.from('MPF\0thumbnail with GPS', 'binary')),
    segment(0xec, Buffer.from('Ducky camera notes', 'ascii')),
    segment(0xee, Buffer.from('Adobe\0\x64\0\0\0\0\x01', 'binary')),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    progressive,
    segment(0xc4, Buffer.alloc(20, 2)),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    SCAN,
    Buffer.from('trailer: a maker note, or another file with GPS'),
  ]);
  const out = Buffer.from(scrubbed(new Uint8Array(file), 'image/jpeg'));
  for (const gone of ['THUMB', 'MPF', 'Ducky', 'trailer', 'GPS']) assert.equal(out.includes(gone), false, gone);
  assert.ok(out.includes(icc) && out.includes('Adobe'), 'colour kept');
  assert.ok(out.includes(progressive), 'every scan kept, its restart markers with it');
  assert.ok(out.subarray(-SCAN.length).equals(SCAN), 'it ends at its end');
  assert.equal(out.readUInt16BE(4), 16, "JFIF's own segment, bare");
});

test('scrub: a PNG keeps only its picture chunks; a WebP only its own, and nothing past its size; a GIF loses comments, foreign blocks and its tail', () => {
  const chunk = (kind: string, body: Buffer) => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    out.write(kind, 4, 'ascii');
    Buffer.from(body).copy(out, 8);
    return out;
  };
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.alloc(13)),
    chunk('caBX', Buffer.from('signer: Ann')),
    chunk('gAMA', Buffer.alloc(4)),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
    Buffer.from('after the end'),
  ]);
  const cleanPng = Buffer.from(scrubbed(new Uint8Array(png), 'image/png'));
  for (const gone of ['caBX', 'Ann', 'after the end']) assert.equal(cleanPng.includes(gone), false, gone);
  assert.ok(cleanPng.includes('gAMA') && cleanPng.includes('IDAT'));

  const riff = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.write(kind, 0, 'ascii');
    head.writeUInt32LE(body.length, 4);
    return Buffer.concat([head, Buffer.from(body), body.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
  };
  const chunks = Buffer.concat([riff('VP8 ', Buffer.from([9, 9, 9])), riff('META', Buffer.from('camera owner'))]);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(chunks.length + 4, 4);
  head.write('WEBP', 8, 'ascii');
  const webp = Buffer.from(
    scrubbed(new Uint8Array(Buffer.concat([head, chunks, Buffer.from('tail GPS')])), 'image/webp'),
  );
  for (const gone of ['META', 'camera owner', 'tail']) assert.equal(webp.includes(gone), false, gone);
  assert.equal(webp.readUInt32LE(4), webp.length - 8);

  const sub = (data: Buffer) => Buffer.concat([Buffer.from([data.length]), Buffer.from(data), Buffer.from([0])]);
  const gif = Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from([1, 0, 1, 0, 0x80, 0, 0]),
    Buffer.alloc(6, 7),
    Buffer.from([0x21, 0xff]),
    sub(Buffer.from('NETSCAPE2.0', 'ascii')).subarray(0, -1),
    Buffer.from([3, 1, 0, 0, 0]),
    Buffer.from([0x21, 0xff]),
    sub(Buffer.from('XMP DataXMP', 'ascii')).subarray(0, -1),
    Buffer.from([8]),
    Buffer.from('GPS home'),
    Buffer.from([0]),
    Buffer.from([0x21, 0xfe]),
    sub(Buffer.from('taken at home', 'ascii')),
    Buffer.from([0x21, 0xf9, 4, 0, 0, 0, 0, 0]),
    Buffer.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2]),
    sub(Buffer.from([0x44, 0x01])),
    Buffer.from([0x3b]),
    Buffer.from('appended: GPS'),
  ]);
  const cleanGif = Buffer.from(scrubbed(new Uint8Array(gif), 'image/gif'));
  for (const gone of ['XMP', 'GPS', 'taken at home', 'appended']) assert.equal(cleanGif.includes(gone), false, gone);
  assert.ok(cleanGif.includes('NETSCAPE2.0'), 'its loop count kept');
  assert.equal(cleanGif.at(-1), 0x3b, 'it ends at its trailer');
  assert.equal(scrubPicture(new Uint8Array(gif.subarray(0, 40)), 'image/gif'), null, 'a GIF cut short is refused');
  assert.equal(scrubPicture(new Uint8Array([1, 2, 3]), 'image/tiff'), null, 'a kind the bot does not keep is refused');
});
