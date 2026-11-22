//! Where a layout's players stand as they join and stand again: round its landing or its way in, each on walkable
//! ground in its section, clear of everything a body runs into there (a gate's arch stands on its way in).

/// The spawns tried first, from the anchor, east and south: on it, and six metres either side of it.
const FIRST: [[f64; 2]; 3] = [[0.0, 0.0], [6.0, 3.0], [-6.0, 3.0]];
/// Then rings round the anchor this far apart, as many as RINGS, each tried at BEARINGS bearings from north, metres.
const RING_STEP_M: f64 = 2.0;
const RINGS: u32 = 8;
const BEARINGS: u32 = 16;
/// How many spawns a layout keeps.
const SPAWNS: usize = 3;

/// Up to three spawns round `at`, each a point where a body `stands`: the first three tried that do, nearest the
/// anchor first after the usual three; `at` alone where none does.
pub(crate) fn round(at: [f64; 2], stands: &dyn Fn([f64; 2]) -> bool) -> Vec<[f64; 2]> {
    let rings = (1..=RINGS).flat_map(|ring| {
        (0..BEARINGS).map(move |bearing| {
            let turn = f64::from(bearing) * std::f64::consts::TAU / f64::from(BEARINGS);
            let distance = f64::from(ring) * RING_STEP_M;
            [libm::sin(turn) * distance, -libm::cos(turn) * distance]
        })
    });
    let found: Vec<[f64; 2]> = FIRST
        .into_iter()
        .chain(rings)
        .map(|[east, south]| [at[0] + east, at[1] + south])
        .filter(|&point| stands(point))
        .take(SPAWNS)
        .collect();
    if found.is_empty() { vec![at] } else { found }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_usual_three_stand_where_they_are_clear_and_one_boxed_in_moves_to_the_nearest_clear_ground() {
        let at = [100.0, 200.0];
        assert_eq!(round(at, &|_| true), vec![[100.0, 200.0], [106.0, 203.0], [94.0, 203.0]]);
        // An arch three metres deep across the anchor, as a gate's stands on its way in.
        let clear = |[x, y]: [f64; 2]| !((97.0..103.0).contains(&x) && (198.5..201.5).contains(&y));
        let spawns = round(at, &clear);
        assert_eq!(spawns[..2], [[106.0, 203.0], [94.0, 203.0]]);
        assert!(clear(spawns[2]) && (spawns[2][1] - 200.0).abs() <= 2.0 * RING_STEP_M, "{spawns:?}");
        assert_eq!(round(at, &|_| false), vec![at], "the anchor where nothing stands clear");
    }
}
