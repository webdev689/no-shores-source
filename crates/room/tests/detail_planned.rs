//! The detail of Saltmere's three zones as the bake plans them: each zone's outcrops in the shape its brief names, no
//! outcrop a spire the close-up would draw as a point or burying what stands, a whaleback's long ends clad in fallen
//! rock, and every run its brief asks for still found; continent 1's basins shaped by their kinds, what stands on a
//! terrace on its level; no claim holding a mass of rock that nothing reaches; the Gullwing Vale's river in its
//! section, carried there by wings that touch no other node; the climates with no hint, the swamp's and the
//! desert's, keeping their outcrops under their massif and off their ways; and what continent 1 plants standing on
//! its floor, clear of every way, yard, run, building and solid.

use city::solids::{Material, Shape as SolidShape};
use land::ground::Ground;
use land::sculpts::{BAND_M, Outcrop, Sculpt, Sculpts, Shape};
use layout::Layout;
use layout::basins::Basin;
use layout::brief::AreaKind;
use layout::paths::{off_line, segments_apart};
use std::path::Path;
use std::sync::OnceLock;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// A continent's layouts as the bake settles them, its biome's key, and its ground as they leave it.
fn settled(id: &str) -> (Vec<Layout>, Option<&'static str>, Ground) {
    settled_by(id, &|_| {})
}

/// A continent's layouts as the bake settles them with its briefs changed, its biome's key, and its ground.
fn settled_by(id: &str, change: &dyn Fn(&mut layout::brief::Briefs)) -> (Vec<Layout>, Option<&'static str>, Ground) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
    let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
    let mut builders = bake::builders(&root).expect("the builders read");
    change(&mut builders.briefs);
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let biome = landmass.biome.map(|biome| biome.key);
    let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
    (layouts, biome, landmass.surface)
}

fn laid_one() -> &'static (Vec<Layout>, Option<&'static str>, Ground) {
    static LAID: OnceLock<(Vec<Layout>, Option<&'static str>, Ground)> = OnceLock::new();
    LAID.get_or_init(|| settled("continent-1"))
}

fn continent_one() -> &'static [Layout] {
    &laid_one().0
}

fn zone(id: &str) -> &'static Layout {
    continent_one().iter().find(|laid| laid.id == id).expect("the zone lays out")
}

#[test]
fn saltmeres_three_zones_take_three_rock_shapes() {
    let wanted = [Shape::Whaleback, Shape::Knoll, Shape::Tor];
    for (id, shape) in ZONES.into_iter().zip(wanted) {
        let outcrops = &zone(id).sculpt.outcrops;
        assert!(!outcrops.is_empty(), "{id} has outcrops");
        let shapes: Vec<Shape> = outcrops.iter().map(|outcrop| outcrop.shape).collect();
        assert!(shapes.iter().all(|&each| each == shape), "{id}'s outcrops are {shape:?}: {shapes:?}");
    }
}

#[test]
fn only_the_downs_cliffs_wear_chalk() {
    let stones: Vec<Option<&str>> = ZONES.into_iter().map(|id| zone(id).stone.as_deref()).collect();
    assert_eq!(stones, [Some("chalk"), None, None], "the zones' stones: {stones:?}");
}

#[test]
fn no_outcrop_is_a_spire() {
    for laid in continent_one() {
        for outcrop in &laid.sculpt.outcrops {
            let Outcrop { at, radius, tall, shape, .. } = *outcrop;
            assert!(radius >= tall / 1.2, "{}: the {shape:?} at {at:?} is {tall:.1} m tall on {radius:.1} m", laid.id);
            let band = radius / f64::from(outcrop.bands());
            assert!(band >= BAND_M, "{}: the {shape:?} at {at:?} has bands of {band:.1} m", laid.id);
        }
    }
}

#[test]
fn saltmere_keeps_its_nine_runs() {
    let briefs = bake::builders(&Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")).expect("the builders").briefs;
    let mut found = 0;
    for id in ZONES {
        let laid = zone(id);
        for wanted in &briefs.0[id].runs {
            let run = laid.runs.iter().find(|run| run.name == wanted.name);
            assert_eq!(
                run.map(|run| run.kind),
                Some(wanted.kind),
                "{id}: {} is found as a {:?}",
                wanted.name,
                wanted.kind
            );
            found += 1;
        }
    }
    assert_eq!(found, 9);
}

#[test]
fn the_whalebacks_ends_are_clad_with_fallen_rock() {
    let laid = zone("saltgrass-downs");
    let boulders: Vec<[f64; 3]> = laid
        .seating
        .solids
        .iter()
        .filter(|solid| solid.material == Material::Rubble && matches!(solid.shape, SolidShape::Dome { .. }))
        .map(|solid| solid.at)
        .collect();
    let mut clad = 0;
    for outcrop in &laid.sculpt.outcrops {
        let ([first, last], reach) = outcrop.footprint();
        let span = [last[0] - first[0], last[1] - first[1]];
        let length = (span[0] * span[0] + span[1] * span[1]).sqrt();
        // Past an end of its spine and at its foot, so only the boulders fallen round its ends count.
        let at_an_end = |&[x, y, _]: &[f64; 3]| {
            let along = ((x - first[0]) * span[0] + (y - first[1]) * span[1]) / length;
            (along < 0.0 || along > length) && off_line([x, y], first, last) < reach + 6.0
        };
        clad += boulders.iter().filter(|&at| at_an_end(at)).count();
    }
    assert!(clad >= laid.sculpt.outcrops.len(), "{clad} boulders at {} whalebacks' ends", laid.sculpt.outcrops.len());
}

/// Each of a layout's sites, solids and props whose ground its outcrops raise by more than a face's foot (0.3 m).
fn buried(laid: &Layout) -> Vec<String> {
    let with = Sculpts::from(vec![laid.sculpt.clone()]);
    let without = Sculpts::from(vec![Sculpt { outcrops: Vec::new(), ..laid.sculpt.clone() }]);
    let lift = |[x, y]: [f64; 2]| with.raise(x, y, 1000.0) - without.raise(x, y, 1000.0);
    let sites = laid.sites.iter().map(|site| (format!("{:?}", site.kind), site.at));
    let solids = laid.seating.solids.iter().map(|solid| (format!("{:?}", solid.shape), [solid.at[0], solid.at[1]]));
    let props = laid.seating.props.iter().map(|prop| ("a prop".to_owned(), [prop.at[0], prop.at[1]]));
    let each = sites.chain(solids).chain(props);
    each.filter(|&(_, at)| lift(at) > 0.3).map(|(what, at)| format!("{}: {what} at {at:?}", laid.id)).collect()
}

#[test]
fn no_outcrop_buries_what_stands() {
    let buried: Vec<String> = continent_one().iter().flat_map(buried).collect();
    assert!(buried.is_empty(), "{} buried: {:#?}", buried.len(), &buried[..buried.len().min(12)]);
}

/// How far an outcrop's footprint lies from a segment, metres.
fn off_outcrop(outcrop: &Outcrop, from: [f64; 2], to: [f64; 2]) -> f64 {
    let (spine, out) = outcrop.footprint();
    segments_apart([from, to], spine) - out
}

#[test]
fn the_swamps_and_the_deserts_outcrops_stand_under_their_massif_and_off_their_ways() {
    for (continent, shape) in [("continent-8", Shape::Hummock), ("continent-4", Shape::Mesa)] {
        let (layouts, biome, _) = settled(continent);
        let rise = layout::carve::rise_of(biome);
        let mut outcrops = 0;
        for laid in &layouts {
            for outcrop in &laid.sculpt.outcrops {
                outcrops += 1;
                let at = outcrop.at;
                assert_eq!(outcrop.shape, shape, "{}: the outcrop at {at:?} takes its climate's shape", laid.id);
                assert!(outcrop.tall < rise, "{}: the {shape:?} at {at:?} stands {} m", laid.id, outcrop.tall);
                for path in &laid.paths {
                    for pair in path.points.windows(2) {
                        let off = off_outcrop(outcrop, pair[0], pair[1]) - path.tier.width() / 2.0;
                        assert!(off > 0.0, "{}: the {shape:?} at {at:?} stands on a way at {:?}", laid.id, pair[0]);
                    }
                }
            }
        }
        assert!(outcrops > 0, "{continent} has outcrops");
        let buried: Vec<String> = layouts.iter().flat_map(buried).collect();
        assert!(buried.is_empty(), "{} buried: {:#?}", buried.len(), &buried[..buried.len().min(12)]);
    }
}

#[test]
fn every_zone_has_slots_and_bays() {
    for id in ZONES {
        let laid = zone(id);
        let (mut slots, mut bays) = (0, 0);
        for path in &laid.paths {
            let points = layout::paths::simplified(&path.points, 3.0);
            let plain = if path.tier == layout::paths::Tier::Track { 15.0 } else { 11.0 };
            for index in 0..points.len().saturating_sub(1) {
                let half = layout::carve::canyon_half(path, index, &points, &laid.areas);
                slots += usize::from(half < plain);
                bays += usize::from(half > plain);
            }
        }
        assert!(slots > 0 && bays > 0, "{id} has {slots} slot segments and {bays} bay segments");
    }
}

/// How much longer than wide a basin must be than another's, or how many more lobes it must have, to read as another
/// kind's: a farm's field, 1.6 times as long as wide, against a round bowl's 1; and one lobe.
const LONGER_BY: f64 = 0.6;
const LOBES_BY: f64 = 1.0;

#[test]
fn basins_differ_by_kind() {
    let kinds = [AreaKind::Farm, AreaKind::Hamlet, AreaKind::Wilds, AreaKind::Graveyard];
    let shapes = kinds.map(|kind| {
        let basins: Vec<&Basin> = continent_one()
            .iter()
            .inspect(|laid| assert_eq!(laid.basins.len(), laid.areas.len(), "{}: a basin an area", laid.id))
            .flat_map(|laid| laid.areas.iter().zip(&laid.basins).filter(|(area, _)| area.kind == kind))
            .map(|(_, basin)| basin)
            .collect();
        assert!(!basins.is_empty(), "continent 1 has a {kind:?}");
        let count = basins.len() as f64;
        let long = basins.iter().map(|basin| basin.long_over_short()).sum::<f64>() / count;
        (kind, long, basins.iter().map(|basin| basin.lobes() as f64).sum::<f64>() / count)
    });
    for (number, &(kind, long, lobes)) in shapes.iter().enumerate() {
        for &(other, other_long, other_lobes) in &shapes[number + 1..] {
            assert!(
                (long - other_long).abs() >= LONGER_BY || (lobes - other_lobes).abs() >= LOBES_BY,
                "{kind:?} ({long:.2} long, {lobes:.1} lobes) reads as {other:?} ({other_long:.2}, {other_lobes:.1})"
            );
        }
    }
}

#[test]
fn what_stands_on_a_terrace_stands_on_its_level() {
    let (layouts, _, ground) = laid_one();
    let (mut standing, mut failed) = (0, Vec::new());
    for laid in layouts {
        let levels =
            laid.basins.iter().flat_map(|basin| basin.terraces.iter()).filter(|terrace| terrace[5] == terrace[6]);
        for &[x1, y1, x2, y2, half, ..] in levels {
            let on = |at: [f64; 2]| off_line(at, [x1, y1], [x2, y2]) < half - 1.0;
            // A shelf (a platform is a disc) holds graves.
            let shelf = (x2 - x1).abs() + (y2 - y1).abs() > 1.0;
            if shelf && !laid.seating.solids.iter().any(|solid| on([solid.at[0], solid.at[1]])) {
                failed.push(format!("{}: no graves on the shelf at {x1:.0},{y1:.0}", laid.id));
            }
            let under_pad = |at: [f64; 2]| {
                laid.seating.pads.iter().any(|pad| {
                    at[0] >= pad.bounds[0] && at[0] <= pad.bounds[2] && at[1] >= pad.bounds[1] && at[1] <= pad.bounds[3]
                })
            };
            let props = laid.seating.props.iter().map(|prop| ("a prop", prop.at));
            let solids = laid.seating.solids.iter().map(|solid| ("a solid", solid.at));
            for (what, at) in props.chain(solids).filter(|&(_, at)| on([at[0], at[1]]) && !under_pad([at[0], at[1]])) {
                standing += 1;
                // A solid's footing is sunk at most 1.2 m; one left on the land under the terrace is its level under.
                let under = ground.height_at(at[0], at[1]) - at[2];
                if under > 1.5 {
                    failed.push(format!("{}: {what} at {at:?} {under:.1} m under its terrace", laid.id));
                }
            }
            for pad in laid
                .seating
                .pads
                .iter()
                .filter(|pad| on([(pad.bounds[0] + pad.bounds[2]) / 2.0, (pad.bounds[1] + pad.bounds[3]) / 2.0]))
            {
                standing += 1;
                let beside = ground.height_at(pad.bounds[0] - 1.0, (pad.bounds[1] + pad.bounds[3]) / 2.0);
                if beside - pad.level > 1.5 {
                    failed.push(format!(
                        "{}: a building's floor {:.1} m under its terrace",
                        laid.id,
                        beside - pad.level
                    ));
                }
            }
        }
    }
    assert!(standing > 0, "something stands on a terrace");
    assert!(failed.is_empty(), "{} of {standing}: {:#?}", failed.len(), &failed[..failed.len().min(12)]);
}

#[test]
fn no_headstone_stands_in_anything() {
    let headstone = |solid: &city::solids::Solid| {
        solid.material == Material::Stone && matches!(solid.shape, SolidShape::Block) && solid.size == [0.7, 0.22, 1.1]
    };
    let (mut stones, mut failed) = (0, Vec::new());
    for laid in continent_one() {
        let solids = laid.seating.solids.iter().filter(|solid| !headstone(solid)).map(|solid| {
            let [west, north, east, south, ..] = solid.bounds();
            ("a solid", [west, north, east, south])
        });
        let buildings = laid.seating.buildings.iter().map(|building| ("a building", building.footprint));
        let props = laid.seating.props.iter().map(|prop| ("a prop", prop.footprint));
        let others: Vec<(&str, [f64; 4])> = solids.chain(buildings).chain(props).collect();
        for stone in laid.seating.solids.iter().filter(|solid| headstone(solid)) {
            stones += 1;
            let [west, north, east, south, ..] = stone.bounds();
            for (what, print) in &others {
                if print[0] < east && print[2] > west && print[1] < south && print[3] > north {
                    failed.push(format!("{}: a headstone at {:?} stands in {what} {print:?}", laid.id, stone.at));
                }
            }
        }
    }
    assert!(stones > 0, "the shelves hold headstones");
    assert!(failed.is_empty(), "{} of {stones}: {:#?}", failed.len(), &failed[..failed.len().min(12)]);
}

#[test]
fn no_claim_holds_a_dead_mass() {
    let ground = &laid_one().2;
    let mut dead = Vec::new();
    for id in ZONES {
        let laid = zone(id);
        let field = layout::field::Field::read(ground, &laid.sculpt.claim, 40.0);
        let sculpts = Sculpts::from(vec![laid.sculpt.clone()]);
        for mass in layout::masses::dead_masses(&field, &sculpts, laid.sculpt.rise) {
            dead.push(format!("{id}: {:.0} m2 at {:.0},{:.0}", mass.area_m2, mass.middle[0], mass.middle[1]));
        }
    }
    assert!(dead.is_empty(), "{dead:#?}");
}

#[test]
fn the_vales_river_lies_in_its_section() {
    let ground = &laid_one().2;
    let vale = zone("gullwing-vale");
    let field = layout::field::Field::read(ground, &vale.sculpt.claim, 456.0);
    let [_, north, _, south] = layout::field::bounds_of(&vale.sculpt.claim);
    let (mut river, mut outside) = (0, Vec::new());
    for at in (0..field.water.len()).filter(|&at| field.water[at] == layout::field::Water::River) {
        let [x, y] = field.centre(at % field.columns, at / field.columns);
        if (north..=south).contains(&y) {
            river += 1;
            if !layout::field::ring_holds(&vale.ring, x, y) {
                outside.push(format!("{x:.0},{y:.0}"));
            }
        }
    }
    assert!(river > 100, "the river runs the claim's length: {river} cells");
    assert!(outside.is_empty(), "{} of {river} river cells outside the section: {outside:?}", outside.len());
}

#[test]
fn no_other_node_is_raised_or_claimed_by_the_vales_wing() {
    let (with, _, with_ground) = laid_one();
    let (without, _, without_ground) = settled_by("continent-1", &|briefs| {
        briefs.0.get_mut("gullwing-vale").expect("the vale has a brief").river = false;
    });
    let vale = zone("gullwing-vale");
    let bare = without.iter().find(|laid| laid.id == "gullwing-vale").expect("the vale lays out without its river");
    assert!(
        vale.sculpt.wings.len() > bare.sculpt.wings.len(),
        "the river's wings: {} with it, {} without",
        vale.sculpt.wings.len(),
        bare.sculpt.wings.len()
    );
    // No wing of the vale reaches another node's claim.
    for laid in with.iter().filter(|laid| laid.id != vale.id) {
        let claim = &laid.sculpt.claim;
        for &[x1, y1, x2, y2, half] in &vale.sculpt.wings {
            let line = [[x1, y1], [x2, y2]];
            let apart =
                (0..claim.len()).map(|edge| segments_apart(line, [claim[edge], claim[(edge + 1) % claim.len()]]));
            let apart = apart.fold(f64::INFINITY, f64::min);
            let inside = layout::field::ring_holds(claim, x1, y1);
            assert!(
                !inside && apart > half,
                "the vale's wing {:?} reaches {}'s claim",
                [x1, y1, x2, y2, half],
                laid.id
            );
        }
    }
    let ids = |layouts: &[Layout]| layouts.iter().map(|laid| laid.id.clone()).collect::<Vec<_>>();
    assert_eq!(ids(with), ids(&without), "the same nodes, in the same order");
    for (now, was) in with.iter().zip(&without).filter(|(now, _)| now.id != vale.id) {
        assert_eq!(now.ring, was.ring, "{}'s section", now.id);
        let points = was
            .sculpt
            .floors
            .iter()
            .flat_map(|&[x1, y1, x2, y2, _]| [[x1, y1], [(x1 + x2) / 2.0, (y1 + y2) / 2.0], [x2, y2]]);
        for [x, y] in points.chain(was.areas.iter().map(|area| area.at)) {
            let (height, before) = (with_ground.height_at(x, y), without_ground.height_at(x, y));
            assert!(
                height == before,
                "{}'s floor at {x:.0},{y:.0} stands {height} m, {before} m without the wing",
                now.id
            );
        }
    }
}

#[test]
fn every_ruin_by_a_mass_lookout_stands_on_level_rock_clear_of_outcrops() {
    let ground = &laid_one().2;
    let (mut ruins, mut failed) = (0, Vec::new());
    for id in ZONES {
        let laid = zone(id);
        let stumps: Vec<[f64; 2]> = laid
            .seating
            .solids
            .iter()
            .filter(|solid| {
                solid.material == Material::Stone && matches!(solid.shape, SolidShape::Column { sides: 12, .. })
            })
            .map(|solid| [solid.at[0], solid.at[1]])
            .collect();
        for pair in layout::carve::lookouts(&laid.sculpt.climbs) {
            let [x1, y1, x2, y2, ..] = pair[0];
            let length = layout::field::distance([x1, y1], [x2, y2]);
            let way = [(x2 - x1) / length, (y2 - y1) / length];
            // A mass's ruin stands 24 m past its lookout, ahead or to either side.
            let sites = [way, [-way[1], way[0]], [way[1], -way[0]]].map(|out| [x2 + out[0] * 24.0, y2 + out[1] * 24.0]);
            for site in sites
                .into_iter()
                .filter(|site| stumps.iter().any(|stump| layout::field::distance(*stump, *site) < 1e-6))
            {
                ruins += 1;
                // The rim's own tests: level within 1.5 m across 12 m, and 20 m clear of every outcrop's footprint.
                let heights = [[6.0, 0.0], [-6.0, 0.0], [0.0, 6.0], [0.0, -6.0], [0.0, 0.0]]
                    .map(|[east, south]| ground.height_at(site[0] + east, site[1] + south));
                let uneven = heights.iter().copied().fold(f64::NEG_INFINITY, f64::max)
                    - heights.iter().copied().fold(f64::INFINITY, f64::min);
                let by_rock = laid.sculpt.outcrops.iter().any(|outcrop| {
                    let ([first, last], reach) = outcrop.footprint();
                    off_line(site, first, last) < reach + 20.0
                });
                if uneven > 1.5 || by_rock {
                    failed.push(format!(
                        "{id}: the ruin at {site:?} stands on {uneven:.1} m of slope, by an outcrop {by_rock}"
                    ));
                }
            }
        }
    }
    assert!(ruins > 0, "Saltmere's mass lookouts have ruins");
    assert!(failed.is_empty(), "{} of {ruins}: {failed:#?}", failed.len());
}

/// Whether a point stands outside a print (west, north, east, south) grown by `margin` each way.
fn outside([west, north, east, south]: [f64; 4], margin: f64, [x, y]: [f64; 2]) -> bool {
    x < west - margin || x > east + margin || y < north - margin || y > south + margin
}

/// How far round its foot a planted kind reaches: its trunk and crown, or its bush.
fn reach_of(kind: &str) -> f64 {
    match kind {
        "oak" => 4.0,
        "gorse" => 1.6,
        other => panic!("no reach is known for a planted {other}"),
    }
}

/// How far a point lies past an upright solid's turned footprint, metres: 0 inside it.
fn off_footprint(solid: &city::solids::Solid, [x, y]: [f64; 2]) -> f64 {
    let (sine, cosine) = land::exact::sin_cos(solid.turn);
    let (east, south) = (x - solid.at[0], y - solid.at[1]);
    let across = ((east * cosine + south * sine).abs() - solid.size[0] / 2.0).max(0.0);
    let along = ((south * cosine - east * sine).abs() - solid.size[1] / 2.0).max(0.0);
    (across * across + along * along).sqrt()
}

/// Why a planted point stands where nothing may, by its kind's `reach` round it: off its section's floor or on a face,
/// a way, a run, a yard, a building, a prop or a solid; none when it stands clear.
fn misplanted(laid: &Layout, ground: &Ground, at: [f64; 2], reach: f64) -> Option<&'static str> {
    let [x, y] = at;
    let sculpt = &laid.sculpt;
    let off_capsule = |capsule: &[f64]| off_line(at, [capsule[0], capsule[1]], [capsule[2], capsule[3]]) - capsule[4];
    let rise = |east: f64, south: f64| ground.height_at(x + east, y + south);
    let (east, south) = (rise(1.0, 0.0) - rise(-1.0, 0.0), rise(0.0, 1.0) - rise(0.0, -1.0));
    let slope = (east * east + south * south).sqrt() / 2.0;
    // The client's yard round a building and its clearing round a run's way and beats (layoutPlan.ts YARD_CLEAR_M,
    // RUN_CLEAR_M and a beat's radius and 2 m).
    let (yard, run_clear, beat_clear) = (10.0, 6.0, 2.0);
    let yards = laid.seating.buildings.iter().map(|building| building.footprint).map(|print| (print, yard + reach));
    let half_tile = layout::seat::TILE_M / 2.0;
    let tiles = laid.seating.tiles.iter().map(|tile| {
        let [x, y] = tile.at;
        ([x - half_tile, y - half_tile, x + half_tile, y + half_tile], reach)
    });
    let pads = laid.seating.pads.iter().map(|pad| (pad.bounds, reach));
    let props = laid.seating.props.iter().map(|prop| (prop.footprint, reach));
    // A leaning or rolled solid by its box; an upright one by its own footprint (below).
    let leaning = laid.seating.solids.iter().filter(|solid| solid.lean != 0.0 || solid.roll != 0.0).map(|solid| {
        let [west, north, east, south, ..] = solid.bounds();
        ([west, north, east, south], reach)
    });
    let mut prints = yards.chain(tiles).chain(pads).chain(props).chain(leaning);
    let mut upright = laid.seating.solids.iter().filter(|solid| solid.lean == 0.0 && solid.roll == 0.0);
    if !layout::field::ring_holds(&laid.ring, x, y) {
        Some("outside its section")
    } else if !sculpt.floors.iter().any(|floor| off_capsule(floor) <= -reach)
        && !sculpt.levels.iter().any(|level| off_capsule(level) <= -reach)
    {
        Some("off its floor")
    } else if sculpt.climbs.iter().chain(&sculpt.runs).any(|climb| off_capsule(climb) <= reach) {
        Some("on a climb or a run's rock")
    } else if sculpt.outcrops.iter().any(|outcrop| {
        let ([first, last], out) = outcrop.footprint();
        off_line(at, first, last) <= out + reach
    }) {
        Some("on an outcrop")
    } else if slope > 0.6 || ground.water_at(x, y) != land::ground::WaterAt::Dry {
        Some("on a face or in water")
    } else if laid.paths.iter().any(|path| {
        path.points.windows(2).any(|pair| off_line(at, pair[0], pair[1]) <= path.tier.width() / 2.0 + reach)
    }) {
        Some("on a way")
    } else if laid.runs.iter().any(|run| {
        let passage = layout::runs::half_of(run.kind).max(run_clear) + reach;
        run.beats.iter().any(|beat| layout::field::distance(beat.at, at) <= beat.radius + beat_clear + reach)
            || run.way().windows(2).any(|pair| off_line(at, pair[0], pair[1]) <= passage)
    }) {
        Some("in a run")
    } else if !prints.all(|(print, margin)| outside(print, margin, at)) {
        Some("in a yard, a building, a prop or a leaning solid")
    } else if upright.any(|solid| off_footprint(solid, at) <= reach) {
        Some("in a solid")
    } else {
        None
    }
}

#[test]
fn plantings_stand_off_ways_yards_runs_and_buildings() {
    let (layouts, biome, ground) = laid_one();
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let flora: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(root.join("content/nature/flora.json")).expect("the flora reads"),
    )
    .expect("the flora parses");
    let grown = &flora["biomes"][biome.expect("continent 1 has a climate")]["kinds"];
    let (mut planted, mut failed) = (0, Vec::new());
    for laid in layouts {
        for planting in &laid.plantings {
            assert!(grown.get(&planting.kind).is_some(), "{}: {} is no kind its nature grows", laid.id, planting.kind);
            for &at in &planting.points {
                planted += 1;
                if let Some(why) = misplanted(laid, ground, at, reach_of(&planting.kind)) {
                    failed.push(format!("{}: a {} at {at:.1?} stands {why}", laid.id, planting.kind));
                }
            }
        }
    }
    // Saltmere's own: the Vale's orchard, the Moors' thickets, and each farm's hedgerows out along its tracks.
    let planted_in = |id: &str, kind: &str, area: &str, within: f64| {
        let laid = zone(id);
        let area = laid.areas.iter().find(|each| each.name == area).expect("the area is laid out");
        let points =
            laid.plantings.iter().filter(|planting| planting.kind == kind).flat_map(|planting| &planting.points);
        let in_area = |at: &&[f64; 2]| layout::field::distance(**at, area.at) <= area.radius;
        let outside_all =
            |at: &&[f64; 2]| laid.areas.iter().all(|each| layout::field::distance(**at, each.at) > each.radius);
        let near = |at: &&[f64; 2]| layout::field::distance(**at, area.at) <= area.radius + within;
        if within > 0.0 { points.filter(outside_all).filter(near).count() } else { points.filter(in_area).count() }
    };
    let counts = [
        ("the Vale's orchard", planted_in("gullwing-vale", "oak", "Orchard Farm", 0.0)),
        ("the Moors' thickets", planted_in("driftwood-moors", "gorse", "The Gorse Moor", 0.0)),
        ("Orchard Farm's hedgerows", planted_in("gullwing-vale", "gorse", "Orchard Farm", 170.0)),
        ("Ewe Fold's hedgerows", planted_in("saltgrass-downs", "gorse", "Ewe Fold", 170.0)),
    ];
    for (what, count) in counts {
        assert!(count >= 20, "{what}: {count} planted");
    }
    assert!(failed.is_empty(), "{} of {planted}: {:#?}", failed.len(), &failed[..failed.len().min(12)]);
}

#[test]
fn a_farms_hedgerows_line_its_drystone_walls() {
    use layout::field::distance;
    for (id, name) in [("saltgrass-downs", "Ewe Fold"), ("gullwing-vale", "Orchard Farm")] {
        let laid = zone(id);
        let farm = laid.areas.iter().find(|area| area.name == name).expect("the farm is laid out");
        // Out along the farm's tracks as far as its walls run (dressing.rs), outside every area.
        let reached = |at: [f64; 2]| {
            distance(at, farm.at) < farm.radius + 170.0
                && laid.areas.iter().all(|area| distance(area.at, at) >= area.radius)
        };
        let tracks: Vec<&layout::paths::Path> =
            laid.paths.iter().filter(|path| path.tier == layout::paths::Tier::Track).collect();
        let by_track = |at: [f64; 2]| {
            let off =
                tracks.iter().flat_map(|path| path.points.windows(2).map(move |pair| off_line(at, pair[0], pair[1])));
            (5.0..6.5).contains(&off.fold(f64::INFINITY, f64::min))
        };
        // Each piece of drystone wall, 0.8 m thick rubble standing 3.5 m off a track's edge, as the line along it.
        let walls: Vec<[[f64; 2]; 2]> = laid
            .seating
            .solids
            .iter()
            .filter(|solid| solid.material == Material::Rubble && matches!(solid.shape, SolidShape::Block))
            .filter(|solid| (solid.size[0] - 0.8).abs() < 1e-9 && solid.lean == 0.0 && solid.roll == 0.0)
            .filter(|solid| reached([solid.at[0], solid.at[1]]) && by_track([solid.at[0], solid.at[1]]))
            .map(|solid| {
                let (sine, cosine) = land::exact::sin_cos(solid.turn);
                let half = solid.size[1] / 2.0;
                let [x, y, _] = solid.at;
                [[x + sine * half, y - cosine * half], [x - sine * half, y + cosine * half]]
            })
            .collect();
        let bushes: Vec<[f64; 2]> = laid
            .plantings
            .iter()
            .filter(|planting| planting.kind == "gorse")
            .flat_map(|planting| planting.points.iter().copied())
            .filter(|&at| reached(at))
            .collect();
        let lined = bushes.iter().filter(|&&at| walls.iter().any(|&[from, to]| off_line(at, from, to) < 2.5)).count();
        let hedged = walls.iter().filter(|&&[from, to]| bushes.iter().any(|&at| off_line(at, from, to) < 2.5)).count();
        assert!(walls.len() > 20, "{name} has {} pieces of wall along its tracks", walls.len());
        assert!(
            lined * 4 >= bushes.len() * 3 && hedged * 3 >= walls.len() * 2,
            "{name}: {lined} of {} hedge bushes line its walls, and {hedged} of {} pieces of wall are hedged",
            bushes.len(),
            walls.len()
        );
    }
}

#[test]
fn every_shrine_stands_in_a_ring_of_standing_stones() {
    let shrines = continent_one()
        .iter()
        .flat_map(|laid| laid.areas.iter().filter(|area| area.kind == AreaKind::Shrine).map(move |area| (laid, area)));
    let mut seen = 0;
    for (laid, area) in shrines {
        seen += 1;
        // A standing stone: dressed stone taller than a body, no wider than a stone.
        let stones = laid.seating.solids.iter().filter(|solid| {
            solid.material == Material::Stone
                && solid.shape == SolidShape::Block
                && solid.size[2] >= 2.4
                && solid.size[0].max(solid.size[1]) <= 1.6
                && layout::field::distance([solid.at[0], solid.at[1]], area.at) <= area.radius
        });
        let ground = &laid_one().2;
        let mut count = 0;
        for stone in stones {
            count += 1;
            // Sunk half a metre into level ground: the ground under each of its corners within that of its middle.
            let [west, north, east, south, ..] = stone.bounds();
            let under = ground.height_at(stone.at[0], stone.at[1]);
            let rise = [[west, north], [east, north], [east, south], [west, south]]
                .map(|[x, y]| ground.height_at(x, y) - under)
                .into_iter()
                .fold(0.0_f64, |most, each| most.max(each.abs()));
            assert!(
                (stone.at[2] + 0.5 - under).abs() < 0.15 && rise < 0.4,
                "{}: a standing stone at {:?} stands {:+.2} m off the ground, {rise:.2} m across",
                laid.id,
                stone.at,
                stone.at[2] + 0.5 - under
            );
        }
        assert!(count >= 7, "{}: {} stands in {count} standing stones", laid.id, area.name);
    }
    assert!(seen > 0, "continent 1 has a shrine");
}

#[test]
fn every_farm_keeps_a_fold_of_drystone() {
    let ground = &laid_one().2;
    let farms = continent_one()
        .iter()
        .flat_map(|laid| laid.areas.iter().filter(|area| area.kind == AreaKind::Farm).map(move |area| (laid, area)));
    let mut seen = 0;
    for (laid, area) in farms {
        seen += 1;
        // A fold's walls: drystone 0.7 m through (a track's walls are 0.8), standing on the ground.
        let walls: Vec<&city::solids::Solid> = laid
            .seating
            .solids
            .iter()
            .filter(|solid| {
                solid.material == Material::Rubble
                    && solid.shape == SolidShape::Block
                    && (solid.size[0] - 0.7).abs() < 1e-9
                    && layout::field::distance([solid.at[0], solid.at[1]], area.at) <= area.radius + 40.0
            })
            .collect();
        let length: f64 = walls.iter().map(|wall| wall.size[1]).sum();
        let [west, north, east, south] = walls.iter().fold(
            [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY],
            |[west, north, east, south], wall| {
                [west.min(wall.at[0]), north.min(wall.at[1]), east.max(wall.at[0]), south.max(wall.at[1])]
            },
        );
        assert!(
            length >= 30.0 && east - west >= 7.0 && south - north >= 7.0,
            "{}: {} keeps {length:.0} m of fold wall",
            laid.id,
            area.name
        );
        for wall in walls {
            let off = wall.at[2] + 0.25 - ground.height_at(wall.at[0], wall.at[1]);
            assert!(off.abs() < 0.2, "{}: a fold's wall at {:?} stands {off:+.2} m off the ground", laid.id, wall.at);
        }
    }
    assert!(seen > 0, "continent 1 has a farm");
}

#[test]
fn the_wilds_hold_cover_round_their_ring() {
    let wilds = continent_one()
        .iter()
        .flat_map(|laid| laid.areas.iter().filter(|area| area.kind == AreaKind::Wilds).map(move |area| (laid, area)));
    let mut seen = 0;
    for (laid, area) in wilds {
        seen += 1;
        // Rock and broken walls in the ring round its standing stone, one at least every 20 m round it.
        let cover = laid.seating.props.iter().filter(|prop| {
            let off = layout::field::distance([prop.at[0], prop.at[1]], area.at) / area.radius;
            let model = &prop.model;
            (layout::pieces::model::ROCKS.contains(model) || layout::pieces::model::RUINS.contains(model))
                && (0.35..=0.85).contains(&off)
        });
        let (count, round) = (cover.count(), std::f64::consts::TAU * area.radius * 0.58);
        assert!(
            count as f64 >= round / 20.0,
            "{}: {} holds {count} pieces of cover round {round:.0} m",
            laid.id,
            area.name
        );
    }
    assert!(seen > 0, "continent 1 has wilds");
}
