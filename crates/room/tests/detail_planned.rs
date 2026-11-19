//! The detail of Saltmere's three zones as the bake plans them: each zone's outcrops in the shape its brief names, no
//! outcrop a spire the close-up would draw as a point or burying what stands, a whaleback's long ends clad in fallen
//! rock, and every run its brief asks for still found; continent 1's basins shaped by their kinds, what stands on a
//! terrace on its level; no claim holding a mass of rock that nothing reaches; the Gullwing Vale's river in its
//! section, carried there by wings that touch no other node; and the climates with no hint, the swamp's and the
//! desert's, keeping their outcrops under their massif and off their ways.

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
