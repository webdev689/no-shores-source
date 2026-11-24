//! A patrol's chest places as the bake plans them on continent 1: several in every patrol, apart from one another and
//! from its resource places, beacons and spawns, each on its section's floor, clear of every way, of what stands and
//! of what grows, and tucked with its back to something taller than a chest.

use layout::Layout;
use layout::chests::{OUT_M, PLACES_MOST};
use layout::field::{distance, ring_holds};
use layout::sites::{Site, SiteKind};
use std::path::Path;
use std::sync::OnceLock;

fn continent_one() -> &'static [Layout] {
    static LAID: OnceLock<Vec<Layout>> = OnceLock::new();
    LAID.get_or_init(|| {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are here");
        let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
        let continent = world.continents.into_iter().find(|each| each.id == "continent-1").expect("the continent");
        let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
        let builders = bake::builders(&root).expect("the builders read");
        let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
        let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
        city::settle(&mut landmass, &city).expect("its city settles");
        layout::settle::settle(&mut landmass, &builders.book, &builders.briefs)
    })
}

fn patrols() -> impl Iterator<Item = &'static Layout> {
    continent_one().iter().filter(|laid| laid.kind == land::sites::NodeKind::Patrol)
}

fn chests(laid: &Layout) -> Vec<&Site> {
    laid.sites.iter().filter(|site| site.kind == SiteKind::Chest).collect()
}

#[test]
fn every_patrol_lays_several_chest_places_and_no_other_node_any() {
    let mut patrols_seen = 0;
    for laid in patrols() {
        let count = chests(laid).len();
        assert!((4..=PLACES_MOST).contains(&count), "{}: {count} chest places", laid.id);
        patrols_seen += 1;
    }
    assert!(patrols_seen >= 3, "continent 1 has Saltmere's three zones at least");
    let others = continent_one().iter().filter(|laid| laid.kind != land::sites::NodeKind::Patrol);
    for laid in others {
        assert!(chests(laid).is_empty(), "{}: only a patrol stands chests", laid.id);
    }
}

#[test]
fn chest_places_keep_apart_from_each_other_the_resources_beacons_and_spawns() {
    for laid in patrols() {
        let places = chests(laid);
        for (nth, place) in places.iter().enumerate() {
            for other in &places[nth + 1..] {
                assert!(distance(place.at, other.at) >= 25.0, "{}: two chests {:?} {:?}", laid.id, place.at, other.at);
            }
            let kept = laid.sites.iter().filter(|site| matches!(site.kind, SiteKind::Resource | SiteKind::Beacon));
            for site in kept {
                assert!(distance(place.at, site.at) >= 10.0, "{}: a chest by {:?}", laid.id, site.kind);
            }
            for &spawn in &laid.spawns {
                assert!(distance(place.at, spawn) >= 15.0, "{}: a chest by a spawn", laid.id);
            }
        }
    }
}

#[test]
fn each_chest_place_stands_in_bounds_off_the_ways_clear_of_what_stands_and_tucked_against_something_tall() {
    for laid in patrols() {
        for place in chests(laid) {
            let [x, y] = place.at;
            let id = &laid.id;
            assert!(ring_holds(&laid.ring, x, y), "{id}: chest {:?} out of bounds", place.at);
            let facing = place.facing.expect("a chest's place faces a way");
            let quarters = facing / core::f64::consts::FRAC_PI_2;
            assert!((quarters - quarters.round()).abs() < 1e-9, "{id}: square to the world");
            for path in &laid.paths {
                let reach = path.tier.width() / 2.0 + 1.5;
                let off = path.points.windows(2).map(|pair| layout::paths::off_line(place.at, pair[0], pair[1]));
                assert!(off.fold(f64::INFINITY, f64::min) >= reach, "{id}: chest {:?} on a way", place.at);
            }
            // Its own box, a hand round it, holds nothing else standing over the floor.
            let inside = |[west, north, east, south]: [f64; 4]| {
                west < x + 0.4 && east > x - 0.4 && north < y + 0.4 && south > y - 0.4
            };
            for prop in &laid.seating.props {
                assert!(!inside(prop.footprint), "{id}: chest {:?} in prop {}", place.at, prop.model);
            }
            for building in &laid.seating.buildings {
                assert!(!inside(building.footprint), "{id}: chest {:?} in building {}", place.at, building.model);
            }
            let planted = laid.plantings.iter().flat_map(|planting| &planting.points);
            assert!(planted.into_iter().all(|&point| distance(point, place.at) >= 1.0), "{id}: planted over");
            // Just behind its back, where it is tucked, stands a box taller than a chest.
            let behind = [x - libm::sin(facing) * (OUT_M + 0.1), y + libm::cos(facing) * (OUT_M + 0.1)];
            let tucked = laid.boxes.iter().any(|&[west, north, east, south, top, bottom]| {
                behind[0] >= west - 0.1
                    && behind[0] <= east + 0.1
                    && behind[1] >= north - 0.1
                    && behind[1] <= south + 0.1
                    && top - bottom >= 1.0
            });
            assert!(tucked, "{id}: chest {:?} facing {facing} has nothing behind it", place.at);
        }
    }
}
