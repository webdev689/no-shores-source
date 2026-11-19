//! The detail of Saltmere's three zones as the bake plans them: each zone's outcrops in the shape its brief names, no
//! outcrop a spire the close-up would draw as a point or burying what stands, a whaleback's long ends clad in fallen
//! rock, and every run its brief asks for still found; and the climates with no hint, the swamp's and the desert's,
//! keeping their outcrops under their massif and off their ways.

use city::solids::{Material, Shape as SolidShape};
use land::sculpts::{BAND_M, Outcrop, Sculpt, Sculpts, Shape};
use layout::Layout;
use layout::paths::{off_line, segments_apart};
use std::path::Path;
use std::sync::OnceLock;

const ZONES: [&str; 3] = ["saltgrass-downs", "gullwing-vale", "driftwood-moors"];

/// A continent's layouts as the bake settles them, and its biome's key.
fn settled(id: &str) -> (Vec<Layout>, Option<&'static str>) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
    let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    let biome = landmass.biome.map(|biome| biome.key);
    (layout::settle::settle(&mut landmass, &builders.book, &builders.briefs), biome)
}

fn continent_one() -> &'static [Layout] {
    static LAID: OnceLock<Vec<Layout>> = OnceLock::new();
    LAID.get_or_init(|| settled("continent-1").0)
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
        let (layouts, biome) = settled(continent);
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
