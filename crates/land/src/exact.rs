//! Exact maths for the land: hashing, noise and smooth steps built from + - * / and square root alone, so the
//! server and a browser agree on every height to the bit (the Agree to the Bit rule).

/// FNV-1a (64-bit) over numbers' bits, in order: the same numbers give the same fingerprint on every machine, so the
/// server and a browser can be held to the same bits.
#[must_use]
pub fn fingerprint(numbers: impl IntoIterator<Item = f64>) -> u64 {
    numbers.into_iter().fold(0xcbf2_9ce4_8422_2325, |hash: u64, number| {
        let bytes = number.to_bits().to_le_bytes();
        bytes.iter().fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    })
}

/// Mixes whole numbers into one 32-bit hash.
#[must_use]
pub fn hash32(numbers: &[i64]) -> u32 {
    let mut hash: u32 = 0x811c_9dc5;
    for &number in numbers {
        hash ^= number as u32;
        hash = hash.wrapping_mul(0x0100_0193);
        hash ^= hash >> 15;
        hash = hash.wrapping_mul(0x2c1b_3c6d);
        hash ^= hash >> 12;
    }
    hash
}

/// A uniform number in [0, 1) from a seed and whole numbers.
#[must_use]
pub fn rand01(seed: u32, numbers: &[i64]) -> f64 {
    let mut all = Vec::with_capacity(numbers.len() + 1);
    all.push(i64::from(seed));
    all.extend_from_slice(numbers);
    f64::from(hash32(&all)) / 4_294_967_296.0
}

/// A child seed: a stage's or a feature's own stream off a parent seed.
#[must_use]
pub fn seed_of(seed: u32, salt: &str) -> u32 {
    salt.bytes().fold(seed, |hash, byte| hash32(&[i64::from(hash), i64::from(byte)]))
}

#[must_use]
pub fn clamp(value: f64, low: f64, high: f64) -> f64 {
    if value < low {
        low
    } else if value > high {
        high
    } else {
        value
    }
}

#[must_use]
pub fn lerp(from: f64, to: f64, fraction: f64) -> f64 {
    from + (to - from) * fraction
}

/// 0 below `low`, 1 above `high`, the cubic step between.
#[must_use]
pub fn smooth(low: f64, high: f64, value: f64) -> f64 {
    let fraction = clamp((value - low) / (high - low), 0.0, 1.0);
    fraction * fraction * (3.0 - 2.0 * fraction)
}

const DIAGONAL: f64 = std::f64::consts::FRAC_1_SQRT_2;
const GRADIENT_X: [f64; 12] = [1.0, -1.0, 0.0, 0.0, DIAGONAL, -DIAGONAL, DIAGONAL, -DIAGONAL, 1.0, -1.0, 0.0, 0.0];
const GRADIENT_Y: [f64; 12] = [0.0, 0.0, 1.0, -1.0, DIAGONAL, DIAGONAL, -DIAGONAL, -DIAGONAL, 0.0, 0.0, 1.0, -1.0];

fn fade(fraction: f64) -> f64 {
    fraction * fraction * fraction * (fraction * (fraction * 6.0 - 15.0) + 10.0)
}

/// Seeded gradient noise in about [-1, 1] with no period: the lattice is hashed, not tabled.
#[must_use]
pub fn noise2(seed: u32, x: f64, y: f64) -> f64 {
    let (cell_x, cell_y) = (x.floor(), y.floor());
    let (fraction_x, fraction_y) = (x - cell_x, y - cell_y);
    let dot = |i: i64, j: i64| {
        let gradient = (hash32(&[i64::from(seed), cell_x as i64 + i, cell_y as i64 + j]) % 12) as usize;
        GRADIENT_X[gradient] * (fraction_x - i as f64) + GRADIENT_Y[gradient] * (fraction_y - j as f64)
    };
    let (ease_x, ease_y) = (fade(fraction_x), fade(fraction_y));
    let top = lerp(dot(0, 0), dot(1, 0), ease_x);
    let bottom = lerp(dot(0, 1), dot(1, 1), ease_x);
    lerp(top, bottom, ease_y) * std::f64::consts::SQRT_2
}

/// A fractal sum of `octaves` noise layers, each twice the frequency and half the weight, in about [-1, 1].
#[must_use]
pub fn fbm(seed: u32, x: f64, y: f64, octaves: u32) -> f64 {
    let (mut sum, mut amplitude, mut norm, mut frequency) = (0.0, 1.0, 0.0, 1.0);
    for octave in 0..octaves {
        sum += amplitude * noise2(seed.wrapping_add(octave.wrapping_mul(7919)), x * frequency, y * frequency);
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    sum / norm
}

/// Ridged fractal noise in [0, 1]: sharp crests where the noise crosses zero, the shape of a ridge's spine.
#[must_use]
pub fn ridged(seed: u32, x: f64, y: f64, octaves: u32) -> f64 {
    let (mut sum, mut amplitude, mut norm, mut frequency, mut weight) = (0.0, 1.0, 0.0, 1.0, 1.0);
    for octave in 0..octaves {
        let crest = 1.0 - noise2(seed.wrapping_add(octave.wrapping_mul(104_729)), x * frequency, y * frequency).abs();
        let shaped = crest * crest * weight;
        weight = clamp(shaped * 2.0, 0.0, 1.0);
        sum += amplitude * shaped;
        norm += amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    sum / norm
}

/// fdlibm's kernels for sine and cosine on a quarter turn about zero, and the quarter turn split in two so the
/// reduction keeps its precision. Written as bits, so the constants are exactly fdlibm's.
const SINE: [f64; 6] = [
    f64::from_bits(0xBFC5_5555_5555_5549),
    f64::from_bits(0x3F81_1111_1110_F8A6),
    f64::from_bits(0xBF2A_01A0_19C1_61D5),
    f64::from_bits(0x3EC7_1DE3_57B1_FE7D),
    f64::from_bits(0xBE5A_E5E6_8A2B_9CEB),
    f64::from_bits(0x3DE5_D93A_5ACF_D57C),
];
const COSINE: [f64; 6] = [
    f64::from_bits(0x3FA5_5555_5555_554C),
    f64::from_bits(0xBF56_C16C_16C1_5177),
    f64::from_bits(0x3EFA_01A0_19CB_1590),
    f64::from_bits(0xBE92_7E4F_809C_52AD),
    f64::from_bits(0x3E21_EE9E_BDB4_B1C4),
    f64::from_bits(0xBDA8_FAE9_BE88_38D4),
];
const QUARTER_HIGH: f64 = f64::from_bits(0x3FF9_21FB_5440_0000);
const QUARTER_LOW: f64 = f64::from_bits(0x3DD0_B461_1A62_6331);

/// Sine and cosine of an angle in radians, to within an ulp or two, from + - * / alone: the platform's own may round
/// its own way.
#[must_use]
pub fn sin_cos(angle: f64) -> (f64, f64) {
    let quarters = (angle * std::f64::consts::FRAC_2_PI).round();
    let rest = (angle - quarters * QUARTER_HIGH) - quarters * QUARTER_LOW;
    let square = rest * rest;
    let sine_tail = SINE[1] + square * (SINE[2] + square * (SINE[3] + square * (SINE[4] + square * SINE[5])));
    let sine = rest + square * rest * (SINE[0] + square * sine_tail);
    let cosine_tail = COSINE[0]
        + square
            * (COSINE[1] + square * (COSINE[2] + square * (COSINE[3] + square * (COSINE[4] + square * COSINE[5]))));
    let cosine = 1.0 - 0.5 * square + square * square * cosine_tail;
    match (quarters as i64).rem_euclid(4) {
        0 => (sine, cosine),
        1 => (cosine, -sine),
        2 => (-sine, -cosine),
        _ => (-cosine, sine),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fingerprint_tells_one_bit_apart() {
        assert_eq!(fingerprint([1.0, 2.0, 3.0]), fingerprint(vec![1.0, 2.0, 3.0]));
        assert_ne!(fingerprint([1.0, 2.0, 3.0]), fingerprint([1.0, 2.0, f64::from_bits(3.0_f64.to_bits() + 1)]));
    }

    #[test]
    #[expect(clippy::disallowed_methods, reason = "the test holds the exact sine to the platform's")]
    fn sine_and_cosine_match_the_platform_to_an_ulp_or_two() {
        for step in -20_000..20_000 {
            let angle = f64::from(step) * 0.013_7 + f64::from(step % 7) * 1e-3;
            let (sine, cosine) = sin_cos(angle);
            assert!((sine - angle.sin()).abs() <= 4.0 * f64::EPSILON, "sin {angle}: {sine} {}", angle.sin());
            assert!((cosine - angle.cos()).abs() <= 4.0 * f64::EPSILON, "cos {angle}: {cosine} {}", angle.cos());
        }
        let far = 3_456_789.123;
        assert!((sin_cos(far).0 - far.sin()).abs() < 1e-9);
        assert_eq!(sin_cos(0.0), (0.0, 1.0));
    }

    #[test]
    fn noise_is_bounded_and_repeats_for_the_same_seed() {
        for step in 0..2000 {
            let (x, y) = (f64::from(step) * 0.37, f64::from(step) * -0.21);
            let value = noise2(7, x, y);
            assert!((-1.5..=1.5).contains(&value), "{value}");
            assert_eq!(value.to_bits(), noise2(7, x, y).to_bits());
            assert!((0.0..=1.0).contains(&ridged(3, x, y, 4)));
        }
        assert_ne!(noise2(1, 0.5, 0.5).to_bits(), noise2(2, 0.5, 0.5).to_bits());
    }

    #[test]
    fn seeds_and_steps_behave() {
        assert_ne!(seed_of(1, "relief"), seed_of(1, "erosion"));
        assert!((0.0..1.0).contains(&rand01(9, &[1, -2])));
        assert!(smooth(0.0, 1.0, -1.0).abs() < f64::EPSILON && (smooth(0.0, 1.0, 2.0) - 1.0).abs() < f64::EPSILON);
    }
}
