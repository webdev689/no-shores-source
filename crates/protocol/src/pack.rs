//! Other figures' numbers as they cross small: each in thousandths, a whole number zigzagged into a varint, its x and
//! y measured from the room's middle, so the numbers that stand near nothing take a byte or two. A whole number crosses
//! exactly at any size; any other within half a thousandth, which no screen shows. The player a snapshot is for has
//! their own numbers whole (they predict from them), so packing is only ever for drawing others.

/// A number that is not one crosses as the largest varint, which no thousandths reach.
const NOT_A_NUMBER: u64 = u64::MAX;
/// The most thousandths a number crosses as, either way: far past any place or count the rooms hold.
const MOST: f64 = 4.0e18;

fn zigzag(whole: i64) -> u64 {
    ((whole << 1) ^ (whole >> 63)) as u64
}

fn unzigzag(zigzagged: u64) -> i64 {
    ((zigzagged >> 1) as i64) ^ -((zigzagged & 1) as i64)
}

fn put(bytes: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        bytes.push((value as u8) | 0x80);
        value >>= 7;
    }
    bytes.push(value as u8);
}

/// Each of `numbers` as it crosses, before it is written: in thousandths, zigzagged, the first two (x and y) less the
/// room's middle `origin`. Two numbers that cross alike are equal here.
#[must_use]
pub fn quantized(numbers: &[f64], origin: [f64; 2]) -> Vec<u64> {
    numbers
        .iter()
        .enumerate()
        .map(|(index, &number)| {
            let from = origin.get(index).copied().unwrap_or_default();
            if number.is_nan() {
                NOT_A_NUMBER
            } else {
                zigzag(((number - from) * 1000.0).round().clamp(-MOST, MOST) as i64)
            }
        })
        .collect()
}

/// `values` (from `quantized`) written, a varint each.
#[must_use]
pub fn varints(values: &[u64]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(values.len() * 2);
    for &value in values {
        put(&mut bytes, value);
    }
    bytes
}

/// `numbers` packed, the first two (x and y) less the room's middle `origin`.
#[must_use]
pub fn pack(numbers: &[f64], origin: [f64; 2]) -> Vec<u8> {
    varints(&quantized(numbers, origin))
}

/// Of `now`, only the values that differ from `base`, written, and a bit set for each, the first value's the lowest
/// bit of the first byte; every bit set when the two are not as long.
#[must_use]
pub fn masked(now: &[u64], base: &[u64]) -> (Vec<u8>, Vec<u8>) {
    let mut bits = vec![0_u8; now.len().div_ceil(8)];
    let mut changed = Vec::new();
    for (index, value) in now.iter().enumerate() {
        if base.len() != now.len() || base.get(index) != Some(value) {
            bits[index / 8] |= 1 << (index % 8);
            changed.push(*value);
        }
    }
    (varints(&changed), bits)
}

/// The numbers `bytes` packs, `count` of them, or nothing when they do not read as so many.
#[must_use]
pub fn unpack(bytes: &[u8], count: usize, origin: [f64; 2]) -> Option<Vec<f64>> {
    let mut numbers = Vec::with_capacity(count);
    let mut value = 0_u64;
    let mut shift = 0_u32;
    for &byte in bytes {
        if shift >= 64 {
            return None;
        }
        value |= u64::from(byte & 0x7f) << shift;
        shift += 7;
        if byte & 0x80 == 0 {
            let from = origin.get(numbers.len()).copied().unwrap_or_default();
            numbers.push(if value == NOT_A_NUMBER { f64::NAN } else { unzigzag(value) as f64 / 1000.0 + from });
            (value, shift) = (0, 0);
        }
    }
    (numbers.len() == count && shift == 0).then_some(numbers)
}

/// The room's middle, as packing measures x and y from it: a node's rect's middle, floored to whole metres as a
/// browser floors it too, or the world's own middle for a course.
#[must_use]
pub fn middle_of(bounds: Option<[f64; 4]>) -> [f64; 2] {
    bounds.map_or([0.0, 0.0], |[west, north, east, south]| {
        [((west + east) / 2.0).floor(), ((north + south) / 2.0).floor()]
    })
}

#[cfg(test)]
mod tests {
    use super::{middle_of, pack, unpack};

    #[test]
    fn numbers_cross_within_half_a_thousandth_and_whole_numbers_exactly() {
        let numbers = [1534.25678, -812.0004, 0.0, -0.0006, 16_777_215.0, 3.0e9, f64::NAN, 0.1 + 0.2];
        let origin = [1500.0, -800.0];
        let back = unpack(&pack(&numbers, origin), numbers.len(), origin).unwrap_or_default();
        assert_eq!(back.len(), numbers.len());
        for (sent, read) in numbers.iter().zip(&back) {
            if sent.is_nan() {
                assert!(read.is_nan());
            } else {
                assert!((sent - read).abs() <= 0.0005 + 1e-9, "{sent} crossed as {read}");
            }
        }
        assert_eq!(back[4], 16_777_215.0, "an arms code crosses exactly");
        assert_eq!(back[5], 3.0e9, "a whole number past 32 bits too");
    }

    #[test]
    fn what_stands_near_the_room_takes_few_bytes() {
        let packed = pack(&[1501.5, -799.5, 12.0, 0.0, 1.0], [1500.0, -800.0]);
        assert!(packed.len() <= 12, "{} bytes", packed.len());
        assert_eq!(pack(&[0.0; 10], [0.0, 0.0]).len(), 10, "a zero is one byte");
    }

    #[test]
    fn only_the_values_that_changed_are_written_with_a_bit_each() {
        let base = super::quantized(&[1.0, 2.0, 3.0, f64::NAN, 5.0, 6.0, 7.0, 8.0, 9.0], [0.0, 0.0]);
        let now = super::quantized(&[1.0, 2.0004, 3.5, f64::NAN, 5.0, 6.0, 7.0, 8.0, -9.0], [0.0, 0.0]);
        let (bytes, bits) = super::masked(&now, &base);
        assert_eq!(bits, [0b0000_0100, 0b0000_0001], "2.0004 crosses as 2.0, and a NaN that stays is no change");
        assert_eq!(unpack(&bytes, 2, [0.0, 0.0]).unwrap_or_default(), [3.5, -9.0]);
    }

    #[test]
    fn bytes_that_are_not_so_many_numbers_do_not_read() {
        let packed = pack(&[1.0, 2.0, 3.0], [0.0, 0.0]);
        assert!(unpack(&packed, 2, [0.0, 0.0]).is_none());
        assert!(unpack(&packed[..packed.len() - 1], 3, [0.0, 0.0]).is_none());
        assert!(unpack(&[0xff; 12], 1, [0.0, 0.0]).is_none(), "a varint past 64 bits");
    }

    #[test]
    fn the_room_middle_is_its_rect_middle_in_whole_metres() {
        assert_eq!(middle_of(Some([-300.0, -301.0, 300.4, 300.0])), [0.0, -1.0]);
        assert_eq!(middle_of(Some([-301.0, 0.0, 300.0, 2.0])), [-1.0, 1.0]);
        assert_eq!(middle_of(None), [0.0, 0.0]);
    }
}
