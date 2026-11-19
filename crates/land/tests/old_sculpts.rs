//! A sculpt written before outcrops had shapes, each outcrop four numbers, still raises the land to the bit as it did:
//! the fixture holds such a sculpt and the heights its code gave on a 2 m grid over its outcrops, its basin's edge
//! and a climb.

use land::sculpts::{Sculpt, Sculpts};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fixture {
    sculpts: Vec<Sculpt>,
    west: f64,
    north: f64,
    step: f64,
    /// Row by row from the north-west corner.
    heights: Vec<Vec<f64>>,
}

#[test]
fn old_sculpts_raise_the_land_as_before() {
    let fixture: Fixture =
        serde_json::from_str(include_str!("fixtures/sculpt_v1.json")).expect("the fixture reads as a sculpt");
    let sculpts = Sculpts::from(fixture.sculpts);
    let mut checked = 0;
    for (row, heights) in (0_u32..).zip(&fixture.heights) {
        for (column, &height) in (0_u32..).zip(heights) {
            let x = fixture.west + f64::from(column) * fixture.step;
            let y = fixture.north + f64::from(row) * fixture.step;
            let now = sculpts.raise(x, y, 1000.0);
            assert_eq!(now.to_bits(), height.to_bits(), "{now} m at {x},{y}, where it was {height} m");
            checked += 1;
        }
    }
    assert_eq!(checked, 61 * 51, "every point of the grid");
}
