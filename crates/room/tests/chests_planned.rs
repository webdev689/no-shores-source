//! A patrol's chest places as the bake plans them on continent 1: several in every patrol, apart from one another and
//! from its resource places, beacons and spawns, each on its section's floor, clear of every way, of what stands and
//! of what grows, and tucked with its back to something taller than a chest; and its resource places, Saltmere's
//! brineglass, each at a tide pool with its node clear before it.

use layout::Layout;
use layout::chests::{OUT_M, PLACES_MOST};
use layout::field::{distance, ring_holds};
use layout::sites::{Site, SiteKind};
use std::path::Path;
use std::sync::OnceLock;

/// Continent 1's layouts as the bake settles them, and its ground as they leave it.
fn laid_one() -> &'static (Vec<Layout>, land::ground::Ground) {
    static LAID: OnceLock<(Vec<Layout>, land::ground::Ground)> = OnceLock::new();
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
        let layouts = layout::settle::settle(&mut landmass, &builders.book, &builders.briefs);
        (layouts, landmass.surface)
    })
}

fn continent_one() -> &'static [Layout] {
    &laid_one().0
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
    assert!(patrols_seen >= 1, "continent 1 has Saltmere's patrol zone, the Saltgrass Downs");
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
            // Just behind its back, where it is tucked, a box stands from its ground to over a chest, not overhead.
            let behind = [x - libm::sin(facing) * (OUT_M + 0.1), y + libm::cos(facing) * (OUT_M + 0.1)];
            let floor = laid_one().1.height_at(x, y);
            let tucked = laid.boxes.iter().any(|&[west, north, east, south, top, bottom]| {
                behind[0] >= west - 0.1
                    && behind[0] <= east + 0.1
                    && behind[1] >= north - 0.1
                    && behind[1] <= south + 0.1
                    && bottom <= floor + 0.2
                    && top - floor >= 1.0
            });
            assert!(tucked, "{id}: chest {:?} facing {facing} has nothing behind it", place.at);
        }
    }
}

/// A chest place's whole room as it opens: its box across and, toward what it is tucked against, the band its lid
/// swings back into, short of the face by a hand (west, north, east, south).
fn swing_of(place: &Site) -> [f64; 4] {
    let [x, y] = place.at;
    let facing = place.facing.expect("a chest's place faces a way");
    let (back_x, back_y) = (-libm::sin(facing), libm::cos(facing));
    let (across, deep, behind) = (0.55, 0.4, OUT_M - 0.05);
    let corners = [(-across, -deep), (across, -deep), (-across, behind), (across, behind)]
        .map(|(side, along)| [x + back_y * side + back_x * along, y - back_x * side + back_y * along]);
    let start = [f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY];
    corners.iter().fold(start, |[west, north, east, south], corner| {
        [west.min(corner[0]), north.min(corner[1]), east.max(corner[0]), south.max(corner[1])]
    })
}

#[test]
fn a_chest_and_its_lids_swing_hold_nothing_that_stands_and_keep_off_a_runs_way_to_its_door_and_the_events_sites() {
    for laid in patrols() {
        let id = &laid.id;
        for place in chests(laid) {
            let [west, north, east, south] = swing_of(place);
            let overlaps = |[other_west, other_north, other_east, other_south]: [f64; 4]| {
                other_west < east && other_east > west && other_north < south && other_south > north
            };
            for prop in &laid.seating.props {
                assert!(!overlaps(prop.footprint), "{id}: chest {:?} opens into prop {}", place.at, prop.model);
            }
            // Every box a body meets as laid, a store's among them, keeps out of its room as high as it opens.
            let ground = laid_one().1.height_at(place.at[0], place.at[1]);
            for &[box_west, box_north, box_east, box_south, top, bottom] in &laid.boxes {
                let beside = bottom < ground + 1.0 && top > ground + 0.05;
                if beside && overlaps([box_west, box_north, box_east, box_south]) {
                    let swing = swing_of(place);
                    panic!(
                        "{id}: chest {:?} facing {:?} swing {swing:?} opens into a box {:?}",
                        place.at,
                        place.facing,
                        [box_west, box_north, box_east, box_south, top, bottom]
                    );
                }
            }
            for run in &laid.runs {
                let Some(&end) = run.line.last() else { continue };
                let off = layout::paths::off_line(place.at, end, run.door);
                assert!(off >= 1.3 / 2.0 + 1.5, "{id}: chest {:?} on the way to {}'s door", place.at, run.name);
            }
            let events = laid.sites.iter().filter(|site| {
                matches!(
                    site.kind,
                    SiteKind::Fissure | SiteKind::Growth | SiteKind::Store | SiteKind::Banner | SiteKind::Approach
                )
            });
            for site in events {
                let apart = distance(place.at, site.at);
                assert!(apart >= site.radius + 3.0, "{id}: chest {:?} on a {:?} site", place.at, site.kind);
            }
        }
    }
}

#[test]
fn each_of_saltmeres_resource_nodes_is_brineglass_clear_before_its_tide_pool() {
    for laid in patrols() {
        let id = &laid.id;
        let resources: Vec<_> = laid.sites.iter().filter(|site| site.kind == SiteKind::Resource).collect();
        assert!(!resources.is_empty(), "{id} lays resource nodes");
        let mut standing = 0;
        for site in resources {
            assert_eq!(site.holds.as_deref(), Some("brineglass"), "{id}: Saltmere's resource");
            // Its tide pool: still water at the place's middle, its node standing clear before it.
            let pool = laid.seating.solids.iter().any(|solid| {
                solid.material == city::solids::Material::Water && distance([solid.at[0], solid.at[1]], site.at) < 0.1
            });
            assert!(pool, "{id}: a resource place at {:?} with no tide pool", site.at);
            let Some(node) = site.node else { continue };
            assert!(distance(node, site.at) > 4.0, "{id}: its node clear of the pool");
            // Where the room gathers it and the page draws it: in bounds, clear of what stands and what grows.
            assert!(ring_holds(&laid.ring, node[0], node[1]), "{id}: node {node:?} out of bounds");
            let blocked = laid.seating.solids.iter().find(|solid| {
                let [west, north, east, south, bottom, top] = solid.bounds();
                let clear = layout::sites::NODE_CLEAR_M;
                top - bottom > 0.3
                    && node[0] > west - clear
                    && node[0] < east + clear
                    && node[1] > north - clear
                    && node[1] < south + clear
            });
            assert!(blocked.is_none(), "{id}: node {node:?} against {blocked:?}");
            let planted = laid.plantings.iter().flat_map(|planting| &planting.points);
            assert!(planted.into_iter().all(|&point| distance(point, node) >= 1.5), "{id}: node {node:?} planted over");
            standing += 1;
        }
        assert!(standing > 0, "{id}: no node stands");
    }
}
