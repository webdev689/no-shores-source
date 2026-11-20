//! The basins' tests: each kind's shape on a made area, every basin holding its area's reach and room round its
//! buildings, and what stands on a terrace lifted onto its level.

use super::*;
use crate::areas::radius_of;
use crate::paths::Tier;
use crate::seat::{Placed, Seated, Tile};
use city::solids::{Material, Shape, Solid};
use land::pads::Pad;

const AT: [f64; 2] = [5000.0, 3000.0];

fn area(kind: AreaKind, radius: f64) -> Area {
    Area { kind, name: String::new(), at: AT, radius, leads_to: None }
}

fn building(middle: [f64; 2], half: f64) -> Seated {
    let footprint = [middle[0] - half, middle[1] - half, middle[0] + half, middle[1] + half];
    Seated {
        model: 1,
        at: [middle[0], middle[1], 10.0],
        yaw: 0.0,
        building: true,
        footprint,
        purpose: 0,
        open: false,
        grounded: false,
    }
}

fn prop(at: [f64; 2]) -> Seated {
    Seated { building: false, footprint: [at[0], at[1], at[0], at[1]], grounded: true, ..building(at, 0.0) }
}

fn draws() -> impl FnMut() -> f64 {
    let mut count = 0;
    move || {
        count += 1;
        land::exact::rand01(7, &[count])
    }
}

fn way(points: Vec<[f64; 2]>) -> Path {
    Path { tier: Tier::Track, points, crossings: Vec::new(), heights: Vec::new() }
}

/// How far a point lies off a basin's floors, metres: negative on them.
fn off_floor(basin: &Basin, at: [f64; 2]) -> f64 {
    basin
        .floors
        .iter()
        .map(|&[x1, y1, x2, y2, half]| off_line(at, [x1, y1], [x2, y2]) - half)
        .fold(f64::INFINITY, f64::min)
}

fn offset(east: f64, south: f64) -> [f64; 2] {
    [AT[0] + east, AT[1] + south]
}

#[test]
fn a_farm_basin_is_long() {
    // The farm's yards run east and west of its middle.
    let tiles = (0..12)
        .map(|step| {
            let at = offset(-55.0 + 10.0 * f64::from(step), if step % 2 == 0 { 4.0 } else { -4.0 });
            Tile { at, byte: 1, turns: 0, corners: [0.0; 4] }
        })
        .collect();
    let seating = Seating { tiles, ..Seating::default() };
    let basin = basin(&area(AreaKind::Farm, 95.0), &seating, &[], None, &mut draws());
    assert_eq!(basin.floors.len(), 1, "one straight-sided field");
    assert!(basin.long_over_short() >= 1.6, "{}", basin.long_over_short());
    let [x1, y1, x2, y2, _] = basin.floors[0];
    assert!((y2 - y1).abs() < 0.05 * (x2 - x1).abs(), "along its yards' run: {:?}", basin.floors[0]);
}

#[test]
fn a_mill_basin_runs_along_its_water() {
    let water = [0.6, 0.8];
    let basin = basin(&area(AreaKind::Mill, 48.0), &Seating::default(), &[], Some(water), &mut draws());
    let [x1, y1, x2, y2, _] = basin.floors[0];
    let length = distance([x1, y1], [x2, y2]);
    assert!(basin.long_over_short() >= 1.6, "{}", basin.long_over_short());
    assert!(((x2 - x1) * water[0] + (y2 - y1) * water[1]).abs() > 0.999 * length, "{:?}", basin.floors[0]);
}

#[test]
fn a_hamlet_basin_has_a_lobe_toward_each_block() {
    let blocks: Vec<Placed> = [offset(-60.0, -40.0), offset(80.0, -20.0), offset(-30.0, 85.0)]
        .into_iter()
        .map(|at| Placed { name: String::new(), at, turns: 0 })
        .collect();
    let seating = Seating { blocks: blocks.clone(), ..Seating::default() };
    let basin = basin(&area(AreaKind::Hamlet, 175.0), &seating, &[], None, &mut draws());
    assert_eq!(basin.lobes(), 3);
    let main = basin.floors[0][4];
    for block in &blocks {
        let toward = [(block.at[0] - AT[0]) / distance(block.at, AT), (block.at[1] - AT[1]) / distance(block.at, AT)];
        let lobe = basin.floors[1..].iter().find(|&&[_, _, x2, y2, _]| {
            let off = distance([x2, y2], AT);
            ((x2 - AT[0]) * toward[0] + (y2 - AT[1]) * toward[1]) / off > 0.99
        });
        let lobe = lobe.unwrap_or_else(|| panic!("no lobe toward the block at {:?}", block.at));
        assert!(distance([lobe[2], lobe[3]], AT) + lobe[4] > main + 40.0, "it stands out of the bowl: {lobe:?}");
    }
}

#[test]
fn a_graveyard_has_a_terrace() {
    // Its graves stand all over its reach, its buildings in the middle, and a way runs in from the north.
    let props = (0..200)
        .map(|grave| {
            let (sine, cosine) = sin_cos(f64::from(grave) * 2.4);
            let out = 8.0 + 72.0 * f64::from(grave) / 200.0;
            prop(offset(sine * out, -cosine * out))
        })
        .collect();
    let buildings = vec![building(offset(-15.0, 10.0), 5.0), building(offset(18.0, -6.0), 4.0)];
    let seating = Seating { props, buildings, ..Seating::default() };
    let path = way(vec![offset(0.0, -400.0), offset(0.0, -8.0)]);
    let basin = basin(&area(AreaKind::Graveyard, 65.0), &seating, std::slice::from_ref(&path), None, &mut draws());
    let shelves: Vec<&[f64; 7]> = basin.terraces.iter().filter(|terrace| terrace[5] == terrace[6]).collect();
    assert!(!shelves.is_empty(), "{basin:?}");
    for shelf in shelves {
        let [x1, y1, x2, y2, half, level, _] = *shelf;
        assert!(level > 0.0);
        for end in [[x1, y1], [x2, y2]] {
            assert!(off_floor(&basin, end) < -half, "the shelf at {end:?} lies inside its bowl");
        }
        assert!(
            path.points.windows(2).all(|pair| segments_apart([[x1, y1], [x2, y2]], [pair[0], pair[1]]) > half + 2.0)
        );
        let ramp = basin
            .terraces
            .iter()
            .find(|ramp| ramp[5] == 0.0 && off_line([ramp[2], ramp[3]], [x1, y1], [x2, y2]) < half);
        let ramp = ramp.unwrap_or_else(|| panic!("a ramp up to {shelf:?}"));
        assert_eq!(ramp[6], level, "the ramp rises to the shelf's level");
        assert!(off_line([ramp[0], ramp[1]], [x1, y1], [x2, y2]) > half + 2.0, "its foot is on the floor");
        assert!(off_floor(&basin, [ramp[0], ramp[1]]) < -ramp[4]);
    }
}

#[test]
fn a_keep_and_a_camp_stand_on_a_platform_their_ways_ramp_up_to() {
    let path = way(vec![offset(30.0, -400.0), offset(0.0, -120.0), offset(0.0, -3.0)]);
    let buildings = vec![building(offset(-20.0, 12.0), 8.0), building(offset(14.0, -4.0), 6.0)];
    for (kind, seating) in
        [(AreaKind::Keep, Seating { buildings, ..Seating::default() }), (AreaKind::Camp, Seating::default())]
    {
        let basin = basin(&area(kind, radius_of(kind, 1)), &seating, std::slice::from_ref(&path), None, &mut draws());
        let platform = basin.terraces[0];
        assert_eq!([platform[0], platform[1], platform[5]], [AT[0], AT[1], platform[6]], "{kind:?}: a level platform");
        assert!(platform[5] > 0.0);
        for &[west, north, east, south] in seating.buildings.iter().map(|building| &building.footprint) {
            for corner in [[west, north], [east, north], [east, south], [west, south]] {
                assert!(distance(corner, AT) < platform[4], "{kind:?}: the keep stands on its platform");
            }
        }
        let ramps: Vec<&[f64; 7]> = basin.terraces[1..].iter().collect();
        assert_eq!(ramps.len(), 1, "{kind:?}: one way in, one ramp: {ramps:?}");
        let [x1, y1, x2, y2, _, from, to] = *ramps[0];
        assert_eq!((from, to), (0.0, platform[5]));
        assert!(distance([x1, y1], AT) > platform[4] + 10.0 && distance([x2, y2], AT) < platform[4], "{kind:?}");
        for end in [[x1, y1], [x2, y2]] {
            assert!(
                path.points.windows(2).any(|pair| off_line(end, pair[0], pair[1]) < 0.5),
                "{kind:?}: along its way"
            );
        }
        let rise = to * TALLEST_LEVEL_M / distance([x1, y1], [x2, y2]);
        assert!(rise <= RAMP_STEEPEST + 1e-9, "{kind:?}: a ramp of {rise}");
    }
}

#[test]
fn a_wilds_basin_is_a_cluster() {
    for seed in 0..20 {
        let mut draw = {
            let mut count = 0;
            move || {
                count += 1;
                land::exact::rand01(seed, &[count])
            }
        };
        let basin = basin(&area(AreaKind::Wilds, 65.0), &Seating::default(), &[], None, &mut draw);
        assert!((3..=5).contains(&basin.lobes()), "{}", basin.lobes());
        let main = basin.floors[0][4];
        for &[x, y, _, _, radius] in &basin.floors[1..] {
            assert!(distance([x, y], AT) + radius > main + 8.0, "each bowl stands out of the main one");
            assert!(distance([x, y], AT) - radius < main - 8.0, "and overlaps it");
        }
        let sizes: Vec<f64> = basin.floors[1..].iter().map(|floor| floor[4]).collect();
        let spread = sizes.iter().fold(0.0_f64, |most, &size| most.max(size))
            - sizes.iter().fold(f64::INFINITY, |least, &size| least.min(size));
        assert!(spread > 2.0, "of different sizes: {sizes:?}");
    }
}

#[test]
fn a_ruins_basin_is_broken_by_spurs_of_rock() {
    let basin = basin(&area(AreaKind::Ruin, 75.0), &Seating::default(), &[], None, &mut draws());
    let main = basin.floors[0][4];
    // Round its rim, rock comes in between its capsules: the floor's reach at each bearing rises and falls.
    let reach: Vec<f64> = (0..72)
        .map(|step| {
            let (sine, cosine) = sin_cos(f64::from(step) * TAU / 72.0);
            let mut out = 0.0;
            while off_floor(&basin, offset(sine * out, -cosine * out)) <= 0.0 {
                out += 1.0;
            }
            out
        })
        .collect();
    let spurs =
        (0..72).filter(|&step| reach[step] < reach[(step + 71) % 72] && reach[step] <= reach[(step + 1) % 72]).count();
    assert!(spurs >= 5, "{spurs} spurs: {reach:?}");
    assert!(reach.iter().fold(f64::INFINITY, |least, &out| least.min(out)) >= main - 1.0, "none runs into its reach");
    assert!(reach.iter().fold(0.0_f64, |most, &out| most.max(out)) > main + 30.0);
}

#[test]
fn every_basin_holds_its_area_and_its_pieces() {
    use AreaKind::*;
    let kinds = [
        Landing, Hamlet, Farm, Hulks, Ruin, Keep, Graveyard, Coven, Shrine, Bones, Camp, Wilds, Arena, Tower,
        Lighthouse, Dock, Wreck, Mill, Causeway, Quarry, Cave, Entrance, Gate,
    ];
    let path = way(vec![offset(-300.0, 20.0), offset(0.0, 0.0)]);
    for kind in kinds {
        let made = area(kind, radius_of(kind, 3));
        let radius = made.radius;
        // A building at the reach's edge, one off its middle, and the block they stand in.
        let buildings = vec![building(offset(radius * 0.85, 10.0), 7.0), building(offset(-10.0, -radius * 0.4), 5.0)];
        let blocks = vec![Placed { name: String::new(), at: offset(radius * 0.3, 0.0), turns: 0 }];
        let seating = Seating { buildings, blocks, ..Seating::default() };
        for water in [None, Some([0.0, 1.0])] {
            let basin = basin(&made, &seating, std::slice::from_ref(&path), water, &mut draws());
            for step in 0..48 {
                let (sine, cosine) = sin_cos(f64::from(step) * TAU / 48.0);
                for share in [0.0, 0.5, 1.0] {
                    let at = offset(sine * radius * share, -cosine * radius * share);
                    assert!(off_floor(&basin, at) <= 1e-9, "{kind:?}: its reach at {at:?} is off its floor");
                }
            }
            for building in &seating.buildings {
                let [west, north, east, south] = building.footprint;
                for corner in [[west, north], [east, north], [east, south], [west, south]] {
                    let off = off_floor(&basin, corner);
                    assert!(off <= -BASIN_ROOM_M + 1e-9, "{kind:?}: {off:.1} m of room round {corner:?}");
                }
            }
        }
    }
}

#[test]
fn what_stands_on_a_terrace_is_lifted_with_it() {
    let house = building(offset(0.0, 0.0), 5.0);
    let plinth = Solid::upright(Shape::Block, [AT[0], AT[1], 9.0], [10.3, 10.3, 1.0], Material::Stone);
    let room = Solid::upright(Shape::Block, [AT[0] + 2.0, AT[1], 10.0], [3.0, 0.2, 2.5], Material::Plaster);
    let lantern = Solid::upright(Shape::Block, [AT[0] + 14.0, AT[1], 10.0], [0.2, 0.2, 2.0], Material::Timber);
    let far = Solid::upright(Shape::Block, [AT[0] + 60.0, AT[1], 10.0], [0.2, 0.2, 2.0], Material::Timber);
    let mut seating = Seating {
        buildings: vec![house.clone()],
        pads: vec![Pad::flat(house.footprint, 10.0)],
        solids: vec![plinth, lantern, far],
        rooms: vec![room],
        // A wall inside the house, and a door's step just outside it on the platform.
        walls: vec![
            [AT[0] - 4.0, AT[1] - 4.0, AT[0] + 4.0, AT[1] - 3.8, 12.5, 10.0],
            [AT[0] + 5.5, AT[1] - 1.0, AT[0] + 6.5, AT[1] + 1.0, 10.3, 9.0],
        ],
        props: vec![prop(offset(-15.0, 3.0)), prop(offset(0.0, 50.0))],
        ..Seating::default()
    };
    let platform = [AT[0], AT[1], AT[0], AT[1], 20.0, 0.2, 0.2];
    // The carving raises the land 4 m on the platform, and 3 m a little off its middle.
    let raised = |at: [f64; 2]| {
        if distance(at, AT) < 1.0 {
            4.0
        } else if distance(at, AT) < 22.0 {
            3.0
        } else {
            0.0
        }
    };
    seat_on_terraces(&mut seating, &[platform], &raised, &|at| distance(at, AT) < 22.0);
    assert_eq!(seating.buildings[0].at[2], 14.0, "the house by the raise at its middle");
    assert_eq!(seating.pads[0].level, 14.0);
    assert_eq!(
        seating.solids.iter().map(|solid| solid.at[2]).collect::<Vec<_>>(),
        [13.0, 13.0, 10.0],
        "its plinth with it, a lantern by its own"
    );
    assert_eq!(seating.rooms[0].at[2], 14.0, "its rooms with it");
    assert_eq!([seating.walls[0][4], seating.walls[0][5]], [16.5, 14.0]);
    assert_eq!([seating.walls[1][4], seating.walls[1][5]], [13.3, 12.0], "a door's step by the land under it");
    assert_eq!(seating.props.iter().map(|prop| prop.at[2]).collect::<Vec<_>>(), [13.0, 10.0]);
}

#[test]
fn headstones_keep_out_of_what_stands_on_their_shelf() {
    let shelf = [AT[0] - 20.0, AT[1], AT[0] + 20.0, AT[1], SHELF_HALF_M, SHELF_SHARE, SHELF_SHARE];
    let ramp = [offset(44.0, 0.0), offset(18.0, 0.0)];
    let chapel = building(offset(-4.0, 6.0), 4.5);
    let lantern = Solid::upright(Shape::Block, [AT[0] + 5.0, AT[1] - 8.5, 0.0], [0.4, 0.4, 2.0], Material::Timber);
    let seating = Seating {
        buildings: vec![chapel],
        props: vec![Seated {
            footprint: [AT[0] + 9.5, AT[1] + 4.0, AT[0] + 10.5, AT[1] + 5.0],
            ..prop(offset(10.0, 4.5))
        }],
        solids: vec![lantern],
        ..Seating::default()
    };
    let stones = headstones(shelf, &[ramp], &seating, &mut draws());
    assert!(stones.len() > 20, "{} headstones", stones.len());
    let standing: Vec<[f64; 4]> = seating
        .buildings
        .iter()
        .chain(&seating.props)
        .map(|seated| seated.footprint)
        .chain(seating.solids.iter().map(|solid| {
            let [west, north, east, south, ..] = solid.bounds();
            [west, north, east, south]
        }))
        .collect();
    for stone in &stones {
        let [west, north, east, south, ..] = stone.bounds();
        for print in &standing {
            let meets = print[0] < east && print[2] > west && print[1] < south && print[3] > north;
            assert!(!meets, "a headstone at {:?} stands in {print:?}", stone.at);
        }
        assert!(
            off_line([stone.at[0], stone.at[1]], ramp[0], ramp[1]) > RAMP_HALF_M,
            "a headstone on the ramp at {:?}",
            stone.at
        );
    }
}
