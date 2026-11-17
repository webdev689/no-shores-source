// The textures' transcendental maths, written out from fdlibm so a picture is the same bytes in every engine:
// ECMAScript lets each engine round Math.sin, Math.pow and their kin its own way. These are the algorithms V8 runs,
// so a picture is the bytes V8's own Math would paint, in every engine. Only + - * / and sqrt are used, which IEEE
// 754 rounds the same everywhere.

const words = new DataView(new ArrayBuffer(8));

/** The high 32 bits of a double, signed. */
function highWord(value: number): number {
  words.setFloat64(0, value);
  return words.getInt32(0);
}

/** The low 32 bits of a double, signed as fdlibm's int reads them. */
function lowWord(value: number): number {
  words.setFloat64(0, value);
  return words.getInt32(4);
}

/** The double made of two 32-bit words. */
function fromWords(high: number, low: number): number {
  words.setInt32(0, high);
  words.setInt32(4, low);
  return words.getFloat64(0);
}

/** The double with its low word cleared: the high part of a split. */
function highPart(value: number): number {
  return fromWords(highWord(value), 0);
}

const SIN_S1 = -1.66666666666666324348e-1;
const SIN_S2 = 8.33333333332248946124e-3;
const SIN_S3 = -1.98412698298579493134e-4;
const SIN_S4 = 2.75573137070700676789e-6;
const SIN_S5 = -2.50507602534068634195e-8;
const SIN_S6 = 1.58969099521155010221e-10;

/** sin on [-pi/4, pi/4], `tail` the reduced argument's low part (`hasTail` 0 when there is none). */
function kernelSin(x: number, tail: number, hasTail: number): number {
  if ((highWord(x) & 0x7fffffff) < 0x3e400000) return x;
  const zed = x * x;
  const cube = zed * x;
  const rest = SIN_S2 + zed * (SIN_S3 + zed * (SIN_S4 + zed * (SIN_S5 + zed * SIN_S6)));
  if (hasTail === 0) return x + cube * (SIN_S1 + zed * rest);
  return x - (zed * (0.5 * tail - cube * rest) - tail - cube * SIN_S1);
}

const COS_C1 = 4.16666666666666019037e-2;
const COS_C2 = -1.38888888888741095749e-3;
const COS_C3 = 2.48015872894767294178e-5;
const COS_C4 = -2.75573143513906633035e-7;
const COS_C5 = 2.0875723212981748279e-9;
const COS_C6 = -1.13596475577881948265e-11;

/** cos on [-pi/4, pi/4], `tail` the reduced argument's low part. */
function kernelCos(x: number, tail: number): number {
  const high = highWord(x) & 0x7fffffff;
  if (high < 0x3e400000) return 1;
  const zed = x * x;
  const rest = zed * (COS_C1 + zed * (COS_C2 + zed * (COS_C3 + zed * (COS_C4 + zed * (COS_C5 + zed * COS_C6)))));
  if (high < 0x3fd33333) return 1 - (0.5 * zed - (zed * rest - x * tail));
  const quarter = high > 0x3fe90000 ? 0.28125 : fromWords(high - 0x00200000, 0);
  const halfLess = 0.5 * zed - quarter;
  return 1 - quarter - (halfLess - (zed * rest - x * tail));
}

const NEAR_HALF_PI_MULTIPLES = [
  0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c, 0x4025fdbb, 0x402921fb, 0x402c463a,
  0x402f6a7a, 0x4031475c, 0x4032d97c, 0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a,
  0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c, 0x4043a28c, 0x40446b9c, 0x404534ac,
  0x4045fdbb, 0x4046c6cb, 0x40478fdb, 0x404858eb, 0x404921fb,
];
const INV_HALF_PI = 6.36619772367581382433e-1;
const HALF_PI_1 = 1.57079632673412561417;
const HALF_PI_1_TAIL = 6.07710050650619224932e-11;
const HALF_PI_2 = 6.0771005063039659766e-11;
const HALF_PI_2_TAIL = 2.02226624879595063154e-21;
const HALF_PI_3 = 2.0222662487111664558e-21;
const HALF_PI_3_TAIL = 8.47842766036889956997e-32;

/** x less the nearest multiple n of pi/2, as a head and tail: [n, head, tail]. Only |x| up to 2^19 pi/2. */
function reduceHalfPi(x: number): [number, number, number] {
  const signedHigh = highWord(x);
  const high = signedHigh & 0x7fffffff;
  if (high < 0x4002d97c) {
    const sign = signedHigh > 0 ? 1 : -1;
    let zed = x - sign * HALF_PI_1;
    if (high !== 0x3ff921fb) {
      const head = zed - sign * HALF_PI_1_TAIL;
      return [sign, head, zed - head - sign * HALF_PI_1_TAIL];
    }
    zed -= sign * HALF_PI_2;
    const head = zed - sign * HALF_PI_2_TAIL;
    return [sign, head, zed - head - sign * HALF_PI_2_TAIL];
  }
  const size = Math.abs(x);
  const n = Math.trunc(size * INV_HALF_PI + 0.5);
  let rest = size - n * HALF_PI_1;
  let less = n * HALF_PI_1_TAIL;
  let head = rest - less;
  if (n >= 32 || high === NEAR_HALF_PI_MULTIPLES[n - 1]) {
    const exponent = high >> 20;
    if (exponent - ((highWord(head) >> 20) & 0x7ff) > 16) {
      let before = rest;
      less = n * HALF_PI_2;
      rest = before - less;
      less = n * HALF_PI_2_TAIL - (before - rest - less);
      head = rest - less;
      if (exponent - ((highWord(head) >> 20) & 0x7ff) > 49) {
        before = rest;
        less = n * HALF_PI_3;
        rest = before - less;
        less = n * HALF_PI_3_TAIL - (before - rest - less);
        head = rest - less;
      }
    }
  }
  const tail = rest - head - less;
  return signedHigh < 0 ? [-n, -head, -tail] : [n, head, tail];
}

/** Beyond this the reduction needs fdlibm's long division by pi, which no recipe reaches. */
const LARGEST_REDUCED = 0x413921fb;

/** fdlibm's sin. */
export function sin(x: number): number {
  const high = highWord(x) & 0x7fffffff;
  if (high <= 0x3fe921fb) return kernelSin(x, 0, 0);
  if (high >= 0x7ff00000) return x - x;
  // shortcut: |x| past 2^19 pi/2 falls back to the engine's sin; port fdlibm's __kernel_rem_pio2 if a recipe needs it.
  if (high > LARGEST_REDUCED) return Math.sin(x);
  const [n, head, tail] = reduceHalfPi(x);
  switch (n & 3) {
    case 0:
      return kernelSin(head, tail, 1);
    case 1:
      return kernelCos(head, tail);
    case 2:
      return -kernelSin(head, tail, 1);
    default:
      return -kernelCos(head, tail);
  }
}

/** fdlibm's cos. */
export function cos(x: number): number {
  const high = highWord(x) & 0x7fffffff;
  if (high <= 0x3fe921fb) return kernelCos(x, 0);
  if (high >= 0x7ff00000) return x - x;
  // shortcut: as in sin, a huge argument takes the engine's cos.
  if (high > LARGEST_REDUCED) return Math.cos(x);
  const [n, head, tail] = reduceHalfPi(x);
  switch (n & 3) {
    case 0:
      return kernelCos(head, tail);
    case 1:
      return -kernelSin(head, tail, 1);
    case 2:
      return -kernelCos(head, tail);
    default:
      return kernelSin(head, tail, 1);
  }
}

const LN2_HIGH = 6.9314718036912381649e-1;
const LN2_LOW = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const EXP_P1 = 1.66666666666666019037e-1;
const EXP_P2 = -2.77777777770155933842e-3;
const EXP_P3 = 6.61375632143793436117e-5;
const EXP_P4 = -1.6533902205465251539e-6;
const EXP_P5 = 4.13813679705723846039e-8;
const TWO_TO_MINUS_1000 = 9.3326361850321887899e-302;

/** fdlibm's exp. */
export function exp(x: number): number {
  const signedHigh = highWord(x);
  const negative = (signedHigh >>> 31) & 1;
  const high = signedHigh & 0x7fffffff;
  if (high >= 0x40862e42) {
    if (high >= 0x7ff00000) {
      if (((high & 0xfffff) | lowWord(x)) !== 0) return x + x;
      return negative === 0 ? x : 0;
    }
    if (x > 7.09782712893383973096e2) return Infinity;
    if (x < -7.4513321910194110842e2) return 0;
  }
  let k = 0;
  let head = 0;
  let low = 0;
  let reduced = x;
  if (high > 0x3fd62e42) {
    if (high < 0x3ff0a2b2) {
      // V8 answers exp(1) with E itself, which the reduction below misses by its last bit
      if (x === 1) return Math.E;
      head = x - (negative ? -LN2_HIGH : LN2_HIGH);
      low = negative ? -LN2_LOW : LN2_LOW;
      k = 1 - negative - negative;
    } else {
      k = Math.trunc(INV_LN2 * x + (negative ? -0.5 : 0.5));
      head = x - k * LN2_HIGH;
      low = k * LN2_LOW;
    }
    reduced = head - low;
  } else if (high < 0x3e300000) {
    return 1 + x;
  }
  const square = reduced * reduced;
  const curve =
    reduced - square * (EXP_P1 + square * (EXP_P2 + square * (EXP_P3 + square * (EXP_P4 + square * EXP_P5))));
  if (k === 0) return 1 - ((reduced * curve) / (curve - 2) - reduced);
  const scaled = 1 - (low - (reduced * curve) / (2 - curve) - head);
  if (k === 1024) return scaled * 2 * 8.988465674311579539e307;
  if (k >= -1021) return fromWords(highWord(scaled) + (k << 20), lowWord(scaled));
  return fromWords(highWord(scaled) + ((k + 1000) << 20), lowWord(scaled)) * TWO_TO_MINUS_1000;
}

const LOG_LG1 = 6.66666666666673513e-1;
const LOG_LG2 = 3.999999999940941908e-1;
const LOG_LG3 = 2.857142874366239149e-1;
const LOG_LG4 = 2.222219843214978396e-1;
const LOG_LG5 = 1.818357216161805012e-1;
const LOG_LG6 = 1.531383769920937332e-1;
const LOG_LG7 = 1.479819860511658591e-1;
const TWO_TO_54 = 1.8014398509481984e16;

/** fdlibm's natural log. */
export function log(value: number): number {
  let x = value;
  let high = highWord(x);
  let k = 0;
  if (high < 0x00100000) {
    if (((high & 0x7fffffff) | lowWord(x)) === 0) return -Infinity;
    if (high < 0) return NaN;
    k -= 54;
    x *= TWO_TO_54;
    high = highWord(x);
  }
  if (high >= 0x7ff00000) return x + x;
  k += (high >> 20) - 1023;
  high &= 0x000fffff;
  let index = (high + 0x95f64) & 0x100000;
  x = fromWords(high | (index ^ 0x3ff00000), lowWord(x));
  k += index >> 20;
  const fraction = x - 1;
  if ((0x000fffff & (2 + high)) < 3) {
    if (fraction === 0) return k === 0 ? 0 : k * LN2_HIGH + k * LN2_LOW;
    const rest = fraction * fraction * (0.5 - 0.33333333333333333 * fraction);
    if (k === 0) return fraction - rest;
    return k * LN2_HIGH - (rest - k * LN2_LOW - fraction);
  }
  const ratio = fraction / (2 + fraction);
  const zed = ratio * ratio;
  index = high - 0x6147a;
  const fourth = zed * zed;
  const other = 0x6b851 - high;
  const evens = fourth * (LOG_LG2 + fourth * (LOG_LG4 + fourth * LOG_LG6));
  const odds = zed * (LOG_LG1 + fourth * (LOG_LG3 + fourth * (LOG_LG5 + fourth * LOG_LG7)));
  index |= other;
  const rest = odds + evens;
  if (index > 0) {
    const halfSquare = 0.5 * fraction * fraction;
    if (k === 0) return fraction - (halfSquare - ratio * (halfSquare + rest));
    return k * LN2_HIGH - (halfSquare - (ratio * (halfSquare + rest) + k * LN2_LOW) - fraction);
  }
  if (k === 0) return fraction - ratio * (fraction - rest);
  return k * LN2_HIGH - (ratio * (fraction - rest) - k * LN2_LOW - fraction);
}

const ATAN_HIGH = [
  4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.570796326794896558,
];
const ATAN_LOW = [
  2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17,
];
const ATAN_TERMS = [
  3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.1111110405462355788e-1,
  9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2,
  4.97687799461593236017e-2, -3.6531572744216915527e-2, 1.62858201153657823623e-2,
];

/** fdlibm's atan. */
function atan(value: number): number {
  const signedHigh = highWord(value);
  const high = signedHigh & 0x7fffffff;
  let x = value;
  let id: number;
  if (high >= 0x44100000) {
    if (high > 0x7ff00000 || (high === 0x7ff00000 && lowWord(value) !== 0)) return value + value;
    return signedHigh > 0 ? ATAN_HIGH[3] + ATAN_LOW[3] : -ATAN_HIGH[3] - ATAN_LOW[3];
  }
  if (high < 0x3fdc0000) {
    if (high < 0x3e200000) return value;
    id = -1;
  } else {
    x = Math.abs(x);
    if (high < 0x3ff30000) {
      if (high < 0x3fe60000) {
        id = 0;
        x = (2 * x - 1) / (2 + x);
      } else {
        id = 1;
        x = (x - 1) / (x + 1);
      }
    } else if (high < 0x40038000) {
      id = 2;
      x = (x - 1.5) / (1 + 1.5 * x);
    } else {
      id = 3;
      x = -1 / x;
    }
  }
  const terms = ATAN_TERMS;
  const zed = x * x;
  const fourth = zed * zed;
  const odds =
    zed *
    (terms[0] +
      fourth * (terms[2] + fourth * (terms[4] + fourth * (terms[6] + fourth * (terms[8] + fourth * terms[10])))));
  const evens =
    fourth * (terms[1] + fourth * (terms[3] + fourth * (terms[5] + fourth * (terms[7] + fourth * terms[9]))));
  if (id < 0) return x - x * (odds + evens);
  const angle = ATAN_HIGH[id] - (x * (odds + evens) - ATAN_LOW[id] - x);
  return signedHigh < 0 ? -angle : angle;
}

const PI_LOW = 1.2246467991473531772e-16;
const HALF_PI = 1.570796326794896558;
const QUARTER_PI = 7.85398163397448279e-1;

/** fdlibm's atan2: the angle of (x, y) from the x axis. */
export function atan2(y: number, x: number): number {
  if (Number.isNaN(x) || Number.isNaN(y)) return x + y;
  const highX = highWord(x);
  const highY = highWord(y);
  const sizeX = highX & 0x7fffffff;
  const sizeY = highY & 0x7fffffff;
  if (((highX - 0x3ff00000) | lowWord(x)) === 0) return atan(y);
  const quadrant = ((highY >>> 31) & 1) | ((highX >>> 30) & 2);
  if ((sizeY | lowWord(y)) === 0) {
    if (quadrant <= 1) return y;
    return quadrant === 2 ? Math.PI : -Math.PI;
  }
  if ((sizeX | lowWord(x)) === 0) return highY < 0 ? -HALF_PI : HALF_PI;
  if (sizeX === 0x7ff00000) {
    if (sizeY === 0x7ff00000) return [QUARTER_PI, -QUARTER_PI, 3 * QUARTER_PI, -3 * QUARTER_PI][quadrant];
    return [0, -0, Math.PI, -Math.PI][quadrant];
  }
  if (sizeY === 0x7ff00000) return highY < 0 ? -HALF_PI : HALF_PI;
  const exponents = (sizeY - sizeX) >> 20;
  let angle: number;
  let turn = quadrant;
  if (exponents > 60) {
    angle = HALF_PI + 0.5 * PI_LOW;
    turn &= 1;
  } else if (highX < 0 && exponents < -60) angle = 0;
  else angle = atan(Math.abs(y / x));
  switch (turn) {
    case 0:
      return angle;
    case 1:
      return -angle;
    case 2:
      return Math.PI - (angle - PI_LOW);
    default:
      return angle - PI_LOW - Math.PI;
  }
}

/** Math.hypot as V8 computes it: each side scaled by the largest, their squares summed with Kahan's compensation.
 *  Two sides, or three when `third` is given (a third side of 0 is not the same sum). */
export function hypot(first: number, second: number, third?: number): number {
  const sizeA = Math.abs(first);
  const sizeB = Math.abs(second);
  const sizeC = third === undefined ? 0 : Math.abs(third);
  let largest = 0;
  if (sizeA > largest) largest = sizeA;
  if (sizeB > largest) largest = sizeB;
  if (sizeC > largest) largest = sizeC;
  if (largest === Infinity) return Infinity;
  if (Number.isNaN(sizeA) || Number.isNaN(sizeB) || Number.isNaN(sizeC)) return NaN;
  if (largest === 0) return 0;
  let sum = 0;
  let compensation = 0;
  for (let side = 0; side < (third === undefined ? 2 : 3); side++) {
    const scaled = (side === 0 ? sizeA : side === 1 ? sizeB : sizeC) / largest;
    const summand = scaled * scaled - compensation;
    const next = sum + summand;
    compensation = next - sum - summand;
    sum = next;
  }
  return Math.sqrt(sum) * largest;
}

const POW_BP = [1, 1.5];
const POW_DP_HIGH = [0, 5.84962487220764160156e-1];
const POW_DP_LOW = [0, 1.35003920212974897128e-8];
const TWO_TO_53 = 9007199254740992;
const POW_L1 = 5.99999999999994648725e-1;
const POW_L2 = 4.28571428578550184252e-1;
const POW_L3 = 3.33333329818377432918e-1;
const POW_L4 = 2.72728123808534006489e-1;
const POW_L5 = 2.30660745775561754067e-1;
const POW_L6 = 2.06975017800338417784e-1;
const LG2 = 6.93147180559945286227e-1;
const LG2_HIGH = 6.93147182464599609375e-1;
const LG2_LOW = -1.90465429995776804525e-9;
const OVERFLOW_TAIL = 8.0085662595372944372e-17;
const TWO_OVER_3LN2 = 9.61796693925975554329e-1;
const TWO_OVER_3LN2_HIGH = 9.61796700954437255859e-1;
const TWO_OVER_3LN2_LOW = -7.02846165095275826516e-9;
const INV_LN2_HIGH = 1.44269502162933349609;
const INV_LN2_LOW = 1.92596299112661746887e-8;
const HUGE = 1.0e300;
const TINY = 1.0e-300;

/** Whether y is an odd integer (1), an even one (2) or neither (0), read from its words as fdlibm reads them. */
function integerKind(highY: number, lowY: number): number {
  const sizeY = highY & 0x7fffffff;
  if (sizeY >= 0x43400000) return 2;
  if (sizeY < 0x3ff00000) return 0;
  const exponent = (sizeY >> 20) - 0x3ff;
  if (exponent > 20) {
    const whole = lowY >>> (52 - exponent);
    return (whole << (52 - exponent)) >>> 0 === lowY >>> 0 ? 2 - (whole & 1) : 0;
  }
  if (lowY !== 0) return 0;
  const whole = sizeY >> (20 - exponent);
  return whole << (20 - exponent) === sizeY ? 2 - (whole & 1) : 0;
}

/** log2 of |x| (x finite, not 0 or 1) as a head and tail, the head's low word clear. */
function log2Split(size: number, sizeHigh: number, sizeY: number): [number, number] {
  if (sizeY > 0x41e00000) {
    // |y| past 2^31 with x near 1: a short series for log(x) is enough
    const near = size - 1;
    const series = near * near * (0.5 - near * (0.3333333333333333333333 - near * 0.25));
    const upper = INV_LN2_HIGH * near;
    const lower = near * INV_LN2_LOW - series * INV_LN2;
    const head = highPart(upper + lower);
    return [head, lower - (head - upper)];
  }
  let x = size;
  let high = sizeHigh;
  let n = 0;
  if (high < 0x00100000) {
    x *= TWO_TO_53;
    n -= 53;
    high = highWord(x);
  }
  n += (high >> 20) - 0x3ff;
  const mantissa = high & 0x000fffff;
  high = mantissa | 0x3ff00000;
  let k: number;
  if (mantissa <= 0x3988e) k = 0;
  else if (mantissa < 0xbb67a) k = 1;
  else {
    k = 0;
    n += 1;
    high -= 0x00100000;
  }
  x = fromWords(high, lowWord(x));
  const above = x - POW_BP[k];
  const inverse = 1 / (x + POW_BP[k]);
  const ratio = above * inverse;
  const ratioHead = highPart(ratio);
  let sumHead = fromWords(((high >> 1) | 0x20000000) + 0x00080000 + (k << 18), 0);
  let sumTail = x - (sumHead - POW_BP[k]);
  const ratioTail = inverse * (above - ratioHead * sumHead - ratioHead * sumTail);
  let square = ratio * ratio;
  let rest =
    square *
    square *
    (POW_L1 + square * (POW_L2 + square * (POW_L3 + square * (POW_L4 + square * (POW_L5 + square * POW_L6)))));
  rest += ratioTail * (ratioHead + ratio);
  square = ratioHead * ratioHead;
  sumHead = highPart(3 + square + rest);
  sumTail = rest - (sumHead - 3 - square);
  const upper = ratioHead * sumHead;
  const lower = ratioTail * sumHead + sumTail * ratio;
  const productHead = highPart(upper + lower);
  const productTail = lower - (productHead - upper);
  const zedHead = TWO_OVER_3LN2_HIGH * productHead;
  const zedTail = TWO_OVER_3LN2_LOW * productHead + productTail * TWO_OVER_3LN2 + POW_DP_LOW[k];
  const whole = n;
  const head = highPart(zedHead + zedTail + POW_DP_HIGH[k] + whole);
  return [head, zedTail - (head - whole - POW_DP_HIGH[k] - zedHead)];
}

/** fdlibm's pow. */
export function pow(x: number, y: number): number {
  const highX = highWord(x);
  const lowX = lowWord(x);
  const highY = highWord(y);
  const lowY = lowWord(y);
  const sizeX = highX & 0x7fffffff;
  const sizeY = highY & 0x7fffffff;
  if ((sizeY | lowY) === 0) return 1;
  if (Number.isNaN(x) || Number.isNaN(y)) return x + y;
  const yKind = highX < 0 ? integerKind(highY, lowY) : 0;
  if (lowY === 0) {
    if (sizeY === 0x7ff00000) {
      if (((sizeX - 0x3ff00000) | lowX) === 0) return y - y;
      if (sizeX >= 0x3ff00000) return highY >= 0 ? y : 0;
      return highY < 0 ? -y : 0;
    }
    if (sizeY === 0x3ff00000) return highY < 0 ? 1 / x : x;
    if (highY === 0x40000000) return x * x;
    if (highY === 0x3fe00000 && highX >= 0) return Math.sqrt(x);
  }
  const size = Math.abs(x);
  if (lowX === 0 && (sizeX === 0x7ff00000 || sizeX === 0 || sizeX === 0x3ff00000)) {
    let result = highY < 0 ? 1 / size : size;
    if (highX < 0) {
      if (((sizeX - 0x3ff00000) | yKind) === 0) result = NaN;
      else if (yKind === 1) result = -result;
    }
    return result;
  }
  const notNegative = (highX >> 31) + 1;
  if ((notNegative | yKind) === 0) return NaN;
  const sign = (notNegative | (yKind - 1)) === 0 ? -1 : 1;
  if (sizeY > 0x41e00000) {
    if (sizeY > 0x43f00000) {
      if (sizeX <= 0x3fefffff) return highY < 0 ? Infinity : 0;
      if (sizeX >= 0x3ff00000) return highY > 0 ? Infinity : 0;
    }
    if (sizeX < 0x3fefffff) return highY < 0 ? sign * HUGE * HUGE : sign * TINY * TINY;
    if (sizeX > 0x3ff00000) return highY > 0 ? sign * HUGE * HUGE : sign * TINY * TINY;
  }
  const [logHead, logTail] = log2Split(size, sizeX, sizeY);
  const yHead = highPart(y);
  const productTail = (y - yHead) * logHead + y * logTail;
  let productHead = yHead * logHead;
  let zed = productTail + productHead;
  let high = highWord(zed);
  const low = lowWord(zed);
  if (high >= 0x40900000) {
    if (((high - 0x40900000) | low) !== 0) return sign * HUGE * HUGE;
    if (productTail + OVERFLOW_TAIL > zed - productHead) return sign * HUGE * HUGE;
  } else if ((high & 0x7fffffff) >= 0x4090cc00) {
    if (((high - 0xc090cc00) | low) !== 0) return sign * TINY * TINY;
    if (productTail <= zed - productHead) return sign * TINY * TINY;
  }
  const magnitude = high & 0x7fffffff;
  let k = (magnitude >> 20) - 0x3ff;
  let n = 0;
  if (magnitude > 0x3fe00000) {
    n = high + (0x00100000 >> (k + 1));
    k = ((n & 0x7fffffff) >> 20) - 0x3ff;
    const whole = fromWords(n & ~(0x000fffff >> k), 0);
    n = ((n & 0x000fffff) | 0x00100000) >> (20 - k);
    if (high < 0) n = -n;
    productHead -= whole;
  }
  const head = highPart(productTail + productHead);
  const upper = head * LG2_HIGH;
  const lower = (productTail - (head - productHead)) * LG2 + head * LG2_LOW;
  zed = upper + lower;
  const tail = lower - (zed - upper);
  const square = zed * zed;
  const curve = zed - square * (EXP_P1 + square * (EXP_P2 + square * (EXP_P3 + square * (EXP_P4 + square * EXP_P5))));
  // V8 divides by the whole difference here where fdlibm subtracts after dividing; V8's is the one to match
  const rest = (zed * curve) / (curve - 2 - (tail + zed * tail));
  zed = 1 - (rest - zed);
  high = highWord(zed) + (n << 20);
  // a subnormal result: one exact step and one rounding, as scalbn rounds it
  if (high >> 20 <= 0) return sign * zed * fromWords((n + 1623) << 20, 0) * fromWords(423 << 20, 0);
  return sign * fromWords(high, lowWord(zed));
}
