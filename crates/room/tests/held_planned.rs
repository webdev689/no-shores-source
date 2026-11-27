//! Nothing in Saltmere's patrol zone, the Saltgrass Downs, hangs in the air: every solid is held by the carved ground,
//! by what it rests on, by what it hangs from if it is small, or as a thin deck laid on from another that is held.

use land::ground::Ground;
use layout::Layout;
use std::path::Path;
use std::sync::OnceLock;

const ZONES: [&str; 1] = ["saltgrass-downs"];

/// Continent 1's layouts as the bake settles them, and its ground as they leave it.
fn laid_one() -> &'static (Vec<Layout>, Ground) {
    static LAID: OnceLock<(Vec<Layout>, Ground)> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read =
            |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent =
            world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        (layouts, landmass.surface)
    })
}

fn zone(id: &str) -> &'static Layout {
    laid_one().0.iter().find(|laid| laid.id == id).expect("the zone lays out")
}

/// Each of a zone's solids that nothing holds up: held is what the carved ground reaches under its footprint, what
/// rests on a held solid, a piece no bigger than a metre that hangs from one just over it (a rack's bundles), and a
/// deck no thicker than 0.6 m laid on at the level of a held deck it touches (a footbridge between its piles).
fn hanging(laid: &Layout, ground: &Ground) -> Vec<String> {
    // Each solid's box: west, north, east, south, bottom, top.
    let boxes: Vec<[f64; 6]> = laid.seating.solids.iter().map(city::solids::Solid::bounds).collect();
    // The ground's highest point under a footprint, sampled every half metre.
    let highest = |&[west, north, east, south, _, _]: &[f64; 6]| {
        let (columns, rows) =
            (((east - west) / 0.5).ceil().max(1.0) as i32, ((south - north) / 0.5).ceil().max(1.0) as i32);
        let mut highest = f64::NEG_INFINITY;
        for column in 0..=columns {
            for row in 0..=rows {
                let x = west + (east - west) * f64::from(column) / f64::from(columns);
                let y = north + (south - north) * f64::from(row) / f64::from(rows);
                highest = highest.max(ground.height_at(x, y));
            }
        }
        highest
    };
    let lows: Vec<f64> = boxes.iter().map(highest).collect();
    let mut held: Vec<bool> = boxes.iter().zip(&lows).map(|(bounds, low)| *low >= bounds[4] - 0.3).collect();
    // The solids whose footprints come within 5 cm of each other's, found through 8 m cells.
    let cell = |at: f64| (at / 8.0).floor() as i64;
    let cells_of = |bounds: [f64; 6]| {
        let columns = cell(bounds[0] - 0.05)..=cell(bounds[2] + 0.05);
        columns.flat_map(move |column| (cell(bounds[1] - 0.05)..=cell(bounds[3] + 0.05)).map(move |row| (column, row)))
    };
    let mut cells: std::collections::HashMap<(i64, i64), Vec<usize>> = std::collections::HashMap::new();
    for (index, bounds) in boxes.iter().enumerate() {
        for key in cells_of(*bounds) {
            cells.entry(key).or_default().push(index);
        }
    }
    let near = |bounds: &[f64; 6]| {
        let mut found: Vec<usize> =
            cells_of(*bounds).flat_map(|key| cells.get(&key).into_iter().flatten().copied()).collect();
        found.sort_unstable();
        found.dedup();
        found
    };
    let overlap = |first: &[f64; 6], second: &[f64; 6], by: f64| {
        first[0] < second[2] + by && second[0] < first[2] + by && first[1] < second[3] + by && second[1] < first[3] + by
    };
    let thin = |bounds: &[f64; 6]| bounds[5] - bounds[4] <= 0.6;
    let small =
        |bounds: &[f64; 6]| (bounds[2] - bounds[0]).max(bounds[3] - bounds[1]).max(bounds[5] - bounds[4]) <= 1.0;
    loop {
        let mut grew = false;
        for (index, piece) in boxes.iter().enumerate() {
            if held[index] {
                continue;
            }
            let holds = near(piece).into_iter().any(|other| {
                let by = &boxes[other];
                let under = overlap(by, piece, 0.0) && by[4] < piece[4] - 0.05 && by[5] >= piece[4] - 0.1;
                let over = small(piece) && overlap(by, piece, 0.0) && (by[4] - piece[5]).abs() <= 0.1;
                let beside = thin(piece) && thin(by) && overlap(by, piece, 0.05) && (by[4] - piece[4]).abs() <= 0.1;
                held[other] && other != index && (under || over || beside)
            });
            if holds {
                held[index] = true;
                grew = true;
            }
        }
        if !grew {
            break;
        }
    }
    let solids = laid.seating.solids.iter().zip(&boxes).zip(&lows).zip(&held);
    solids
        .filter(|(_, held)| !**held)
        .map(|(((solid, bounds), low), _)| {
            let (shape, material, at, size) = (solid.shape, solid.material, solid.at, solid.size);
            let over = bounds[4] - low;
            format!("{}: a {shape:?} of {material:?} at {at:?}, {size:?} m, {over:.1} m over the ground", laid.id)
        })
        .collect()
}

#[test]
fn nothing_in_saltmere_hangs_in_the_air() {
    let ground = &laid_one().1;
    let hung: Vec<String> = ZONES.iter().flat_map(|id| hanging(zone(id), ground)).collect();
    assert!(hung.is_empty(), "{} hang: {hung:#?}", hung.len());
}
