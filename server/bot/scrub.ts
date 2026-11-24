// A picture with what it says about where and by whom it was taken taken out, before anyone can fetch it. Each kind
// keeps only what draws it: a JPEG its scans and colour (its orientation kept, so a phone photo stands upright), a PNG
// and a WebP their picture chunks, a GIF its frames and loop count. Nothing after a file's end is kept, and the pixels
// are never touched. A file whose structure cannot be followed is refused.

const joined = (parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0);
  return out;
};

/**
 * The orientation an EXIF block names (1 to 8), or 0 for none: IFD0's tag 0x0112. `exif` is the APP1 segment's body
 * after its "Exif\0\0".
 */
export function exifOrientation(exif: Uint8Array): number {
  if (exif.length < 8) return 0;
  const view = new DataView(exif.buffer, exif.byteOffset, exif.byteLength);
  const little = exif[0] === 0x49 && exif[1] === 0x49;
  if (!little && !(exif[0] === 0x4d && exif[1] === 0x4d)) return 0;
  const first = view.getUint32(4, little);
  if (first + 2 > exif.length) return 0;
  const entries = view.getUint16(first, little);
  for (let i = 0; i < entries; i++) {
    const entry = first + 2 + i * 12;
    if (entry + 12 > exif.length) return 0;
    if (view.getUint16(entry, little) === 0x0112) {
      const value = view.getUint16(entry + 8, little);
      return value >= 1 && value <= 8 ? value : 0;
    }
  }
  return 0;
}

/** A fresh APP1 segment holding only an orientation. */
function orientationSegment(orientation: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
  ];
  const body = [
    ...[0x45, 0x78, 0x69, 0x66, 0x00, 0x00],
    ...tiff,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ];
  const size = body.length + 2;
  return new Uint8Array([0xff, 0xe1, size >> 8, size & 255, ...body]);
}

/** The ASCII at the start of a segment or chunk. */
const ascii = (bytes: Uint8Array, count: number) => String.fromCharCode(...bytes.subarray(0, count));

/**
 * Whether a JPEG's APPn segment draws the picture: JFIF's own, an ICC colour profile, Adobe's colour transform. Every
 * other is a maker's, a camera's or an editor's notes (EXIF, XMP, IPTC, MPF thumbnails), and goes.
 */
const jpegDraws = (marker: number, body: Uint8Array) =>
  (marker === 0xe0 && ascii(body, 5) === 'JFIF\0') ||
  (marker === 0xe2 && ascii(body, 12) === 'ICC_PROFILE\0') ||
  (marker === 0xee && ascii(body, 5) === 'Adobe');

/** JFIF's own segment with no thumbnail, which can be a picture of its own. */
function jfifBare(body: Uint8Array): Uint8Array | null {
  if (body.length < 14) return null;
  const out = new Uint8Array(18);
  out.set([0xff, 0xe0, 0x00, 0x10]);
  out.set(body.subarray(0, 12), 4);
  return out;
}

/** A JPEG without its metadata segments or anything after its end, or null where they cannot be followed. */
function scrubJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const parts = [bytes.subarray(0, 2)];
  let orientation = 0;
  let offset = 2;
  const done = () => {
    // after JFIF's own segment where there is one, where readers look for EXIF
    const place = parts[1]?.[0] === 0xff && parts[1]?.[1] === 0xe0 ? 2 : 1;
    if (orientation > 1) parts.splice(place, 0, orientationSegment(orientation));
    return joined(parts);
  };
  while (offset + 2 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // the end: what follows it (a maker's trailer, another file) is not the picture
    if (marker === 0xd9) {
      parts.push(bytes.subarray(offset, offset + 2));
      return done();
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      parts.push(bytes.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) return null;
    const end = offset + 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
    if (end > bytes.length) return null;
    const body = bytes.subarray(offset + 4, end);
    if (marker === 0xe1) {
      // EXIF or XMP: only the orientation is kept, rewritten on its own
      if (ascii(body, 6) === 'Exif\0\0') orientation = exifOrientation(body.subarray(6)) || orientation;
    } else if (marker >= 0xe0 && marker <= 0xef) {
      if (jpegDraws(marker, body)) {
        const kept = marker === 0xe0 ? jfifBare(body) : bytes.subarray(offset, end);
        if (!kept) return null;
        parts.push(kept);
      }
    } else if (marker !== 0xfe) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (marker === 0xda) {
      // a scan's coded data runs to the next marker that is not a stuffed byte or a restart
      let next = offset;
      while (
        next + 1 < bytes.length &&
        !(bytes[next] === 0xff && bytes[next + 1] !== 0x00 && !(bytes[next + 1] >= 0xd0 && bytes[next + 1] <= 0xd7))
      )
        next++;
      if (next + 1 >= bytes.length) {
        // no end marker: the scan is kept as it came, and the file ends with it
        parts.push(bytes.subarray(offset));
        return done();
      }
      parts.push(bytes.subarray(offset, next));
      offset = next;
    }
  }
  return null;
}

/** The PNG chunks that draw a picture or an animation. Every other ancillary chunk is notes about it, and goes. */
const PNG_DRAWS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP',
  'cICP',
  'mDCv',
  'cLLi',
  'sBIT',
  'bKGD',
  'hIST',
  'pHYs',
  'sPLT',
  'acTL',
  'fcTL',
  'fdAT',
]);

/** A PNG with only the chunks that draw it, ending at its end, or null. */
function scrubPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const end = offset + 12 + view.getUint32(offset);
    if (end > bytes.length) return null;
    const kind = ascii(bytes.subarray(offset + 4), 4);
    // a critical chunk this list does not know cannot be dropped, or the picture is not the picture
    if (PNG_DRAWS.has(kind) || !(kind.charCodeAt(0) & 0x20)) parts.push(bytes.subarray(offset, end));
    if (kind === 'IEND') return joined(parts);
    offset = end;
  }
  return null;
}

/** The WebP chunks that draw a picture or an animation. EXIF, XMP and any other go. */
const WEBP_DRAWS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

/** A WebP with only the chunks that draw it, its header's flags and size set to match, or null. */
function scrubWebp(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts = [];
  // the RIFF's own size says where the file ends: anything after it is not the picture
  const last = Math.min(bytes.length, 8 + view.getUint32(4, true));
  let offset = 12;
  while (offset + 8 <= last) {
    const size = view.getUint32(offset + 4, true);
    const end = offset + 8 + size + (size % 2);
    if (end > last + (size % 2)) return null;
    const kind = ascii(bytes.subarray(offset), 4);
    if (kind === 'VP8X') {
      const chunk = bytes.slice(offset, Math.min(end, last));
      chunk[8] &= ~0x0c;
      parts.push(chunk);
    } else if (WEBP_DRAWS.has(kind)) parts.push(bytes.subarray(offset, Math.min(end, last)));
    offset = end;
  }
  const body = joined(parts);
  const head = new Uint8Array(12);
  head.set(bytes.subarray(0, 12));
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  return joined([head, body]);
}

/** A GIF application block that draws: the loop count an animation keeps. */
const GIF_LOOPS = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);

/**
 * A GIF without its comments, any application block but its loop count, and anything after its end, or null where
 * its blocks cannot be followed.
 */
function scrubGif(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes.length < 13) return null;
  const table = (flags: number) => (flags & 0x80 ? 3 * (1 << ((flags & 7) + 1)) : 0);
  let offset = 13 + table(bytes[10]);
  const parts = [bytes.subarray(0, offset)];
  /** The end of a run of sub-blocks starting at `from`, or -1. */
  const blocksEnd = (from: number) => {
    let i = from;
    while (i < bytes.length && bytes[i] !== 0) i += bytes[i] + 1;
    return i < bytes.length ? i + 1 : -1;
  };
  while (offset < bytes.length) {
    const kind = bytes[offset];
    if (kind === 0x3b) {
      parts.push(bytes.subarray(offset, offset + 1));
      return joined(parts);
    }
    if (kind === 0x2c) {
      if (offset + 10 > bytes.length) return null;
      const data = offset + 10 + table(bytes[offset + 9]) + 1;
      const end = blocksEnd(data);
      if (end < 0) return null;
      parts.push(bytes.subarray(offset, end));
      offset = end;
    } else if (kind === 0x21) {
      if (offset + 2 > bytes.length) return null;
      const label = bytes[offset + 1];
      const end = blocksEnd(offset + 2);
      if (end < 0) return null;
      const app = label === 0xff && bytes[offset + 2] === 11 ? ascii(bytes.subarray(offset + 3), 11) : '';
      if (label !== 0xfe && (label !== 0xff || GIF_LOOPS.has(app))) parts.push(bytes.subarray(offset, end));
      offset = end;
    } else return null;
  }
  return null;
}

/** A picture's bytes with its metadata taken out, or null when its structure cannot be followed. */
export function scrubPicture(bytes: Uint8Array, type: string): Uint8Array<ArrayBuffer> | null {
  if (type === 'image/jpeg') return scrubJpeg(bytes);
  if (type === 'image/png') return scrubPng(bytes);
  if (type === 'image/webp') return scrubWebp(bytes);
  if (type === 'image/gif') return scrubGif(bytes);
  return null;
}
