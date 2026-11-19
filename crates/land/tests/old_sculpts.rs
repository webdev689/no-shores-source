//! A sculpt written before outcrops had shapes, each outcrop four numbers, still reads: each outcrop a mesa at angle
//! 0, raising the land as that mesa does. The fixture holds such a sculpt and the heights the code it was written
//! with gave on a 2 m grid over its outcrops, its basin's edge and a climb; where no outcrop reaches, the land is
//! still those heights to the bit.

use land::sculpts::{Outcrop, Sculpt, Sculpts, Shape};
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

/// The fixture's outcrops as written, four numbers each.
#[derive(Deserialize)]
struct Written {
    sculpts: Vec<Plain>,
}

#[derive(Deserialize)]
struct Plain {
    outcrops: Vec<[f64; 4]>,
}

#[test]
fn an_old_sculpt_reads_its_outcrops_as_mesas_and_keeps_its_land_off_them() {
    let text = include_str!("fixtures/sculpt_v1.json");
    let fixture: Fixture = serde_json::from_str(text).expect("the fixture reads as a sculpt");
    let written: Written = serde_json::from_str(text).expect("its outcrops are four numbers each");
    let mut mesas = fixture.sculpts.clone();
    mesas[0].outcrops = written.sculpts[0]
        .outcrops
        .iter()
        .map(|&[x, y, radius, tall]| Outcrop { at: [x, y], radius, tall, shape: Shape::Mesa, angle: 0.0 })
        .collect();
    assert_eq!(fixture.sculpts, mesas, "each outcrop reads as a mesa at angle 0");
    let reaches: Vec<[f64; 4]> = mesas[0].outcrops.iter().map(Outcrop::reach).collect();
    let (read, mesas) = (Sculpts::from(fixture.sculpts), Sculpts::from(mesas));
    let (mut kept, mut moved) = (0, 0);
    for (row, heights) in (0_u32..).zip(&fixture.heights) {
        for (column, &height) in (0_u32..).zip(heights) {
            let x = fixture.west + f64::from(column) * fixture.step;
            let y = fixture.north + f64::from(row) * fixture.step;
            let now = read.raise(x, y, 1000.0);
            assert_eq!(now.to_bits(), mesas.raise(x, y, 1000.0).to_bits(), "it raises the land as its mesas do");
            let off = reaches.iter().all(|&[west, north, east, south]| x < west || x > east || y < north || y > south);
            if off {
                assert_eq!(
                    now.to_bits(),
                    height.to_bits(),
                    "{now} m at {x},{y}, off every outcrop, where it was {height} m"
                );
                kept += 1;
            } else if now.to_bits() != height.to_bits() {
                moved += 1;
            }
        }
    }
    assert!(kept > 1000 && moved > 100, "most of the grid is off the outcrops ({kept}), and the mesas moved ({moved})");
}
