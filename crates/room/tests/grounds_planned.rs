//! Saltmere's public events' grounds as the bake plans them: each hamlet's three stores on clear ground beside its
//! houses, off the ways, never under a building, each a box a body runs into; its raiders' approach and banners; each
//! wilds' growth spot; and only Saltmere's three zones' node files carry grounds, which the room's events read.

use layout::field::{distance, ring_holds};
use layout::sites::SiteKind;
use std::path::Path;

/// Continent 1's layouts as the bake settles them.
fn continent_one() -> Vec<layout::Layout> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == "continent-1").expect("continent-1");
    let edits = land::edits::parse(&read("content/world/land/continent-1.json")).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("continent-1 generates");
    city::settle(&mut landmass, &city).expect("its city settles");
    layout::settle::settle(&mut landmass, &builders.book, &builders.briefs)
}

#[test]
fn saltmeres_zones_have_their_stores_approaches_banners_and_growths_and_only_they_carry_grounds() {
    let layouts = continent_one();
    assert_eq!(bake::EVENT_ZONES, room::public::ZONES, "the bake and the room name the same zones");
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let grounds = bake::grounds_of(laid).expect("an event zone has grounds");
        let raid = grounds.raid.expect("its hamlet holds a raid");
        let fissure = grounds.fissure.expect("its wilds holds a fissure");
        assert_eq!(raid.stores.len(), 3, "{id}: three stores");
        assert_eq!(raid.banners.len(), 2, "{id}: two banners");
        for store in &raid.stores {
            assert!(ring_holds(&laid.ring, store[0], store[1]), "{id}: the store at {store:?} is in the section");
            assert!(distance(*store, raid.at) < raid.radius, "{id}: within the raid's ground");
            for building in &laid.seating.buildings {
                let [west, north, east, south] = building.footprint;
                let under = store[0] + 1.2 > west && store[0] - 1.2 < east && store[1] + 0.8 > north;
                assert!(!(under && store[1] - 0.8 < south), "{id}: the store at {store:?} is under a building");
            }
            let walled = laid
                .boxes
                .iter()
                .any(|found| (found[0] - (store[0] - 1.2)).abs() < 1e-9 && (found[3] - (store[1] + 0.8)).abs() < 1e-9);
            assert!(walled, "{id}: a body runs into the store at {store:?}");
            for path in &laid.paths {
                let off = path.points.windows(2).map(|pair| layout::paths::off_line(*store, pair[0], pair[1]));
                assert!(off.fold(f64::INFINITY, f64::min) > path.tier.width() / 2.0 + 1.2, "{id}: off the ways");
            }
        }
        assert!(ring_holds(&laid.ring, raid.approach[0], raid.approach[1]), "{id}: the raiders come in from inside");
        let growth = distance(fissure.growth, fissure.at);
        assert!((14.0 - 1e-9..=20.0 + 1e-9).contains(&growth), "{id}: the growth rises {growth} m from its middle");
    }
    let others = layouts.iter().filter(|layout| !bake::EVENT_ZONES.contains(&layout.id.as_str()));
    assert!(others.clone().count() > 0 && others.clone().all(|other| bake::grounds_of(other).is_none()));
    for other in others.filter(|other| other.areas.iter().any(|area| area.kind == layout::brief::AreaKind::Hamlet)) {
        assert!(other.sites.iter().any(|site| site.kind == SiteKind::Store), "{}: every hamlet stores", other.id);
    }
}

/// Whether a print round `at`, `half` across and widened by `clear`, overlaps a solid's print.
fn overlaps(at: [f64; 2], half: [f64; 2], clear: f64, solid: [f64; 6]) -> bool {
    let [west, north, east, south, _, _] = solid;
    at[0] + half[0] + clear > west
        && at[0] - half[0] - clear < east
        && at[1] + half[1] + clear > north
        && at[1] - half[1] - clear < south
}

#[test]
fn saltmeres_stores_banners_and_growths_keep_clear_of_its_beacons_and_resource_marks() {
    let layouts = continent_one();
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let marked: Vec<[f64; 2]> = laid
            .sites
            .iter()
            .filter(|site| matches!(site.kind, SiteKind::Beacon | SiteKind::Resource))
            .map(|site| site.at)
            .collect();
        assert!(!marked.is_empty(), "{id}: beacons and resources");
        // What a beacon or a resource stands reaches at most this from its site.
        let near_mark =
            |solid: &&city::solids::Solid| marked.iter().any(|at| distance(*at, [solid.at[0], solid.at[1]]) < 8.0);
        let solids: Vec<[f64; 6]> = laid.seating.solids.iter().filter(near_mark).map(|solid| solid.bounds()).collect();
        let grounds = bake::grounds_of(laid).expect("an event zone has grounds");
        let raid = grounds.raid.expect("a raid");
        let fissure = grounds.fissure.expect("a fissure");
        let kept = raid.stores.iter().map(|at| (*at, layout::grounds::STORE_HALF, 1.5, "store"));
        let kept = kept.chain(raid.banners.iter().map(|at| (*at, [0.5, 0.5], 0.5, "banner")));
        for (at, half, clear, what) in kept.chain([(fissure.growth, [2.5, 2.5], 1.0, "growth")]) {
            let hit = solids.iter().find(|solid| overlaps(at, half, clear, **solid));
            assert!(hit.is_none(), "{id}: the {what} at {at:?} stands on a mark's solid {hit:?}");
        }
    }
}

#[test]
fn saltmeres_fissures_open_on_clear_ground_beside_their_battlefields_obelisk_never_on_it_or_its_ruins() {
    let layouts = continent_one();
    let half = [layout::grounds::FISSURE_HALF, layout::grounds::FISSURE_HALF];
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let fissure = bake::grounds_of(laid).and_then(|grounds| grounds.fissure).expect("its wilds holds a fissure");
        let wilds = laid.areas.iter().find(|area| area.kind == layout::brief::AreaKind::Wilds).expect("its wilds");
        assert!(distance(fissure.at, wilds.at) >= 9.0 - 1e-9, "{id}: off the battlefield's middle");
        let standing = laid.seating.buildings.iter().chain(&laid.seating.props).map(|seated| {
            let [west, north, east, south] = seated.footprint;
            [west, north, east, south, 0.0, 0.0]
        });
        for print in standing.chain(laid.seating.solids.iter().map(|solid| solid.bounds())) {
            assert!(
                !overlaps(fissure.at, half, 0.0, print),
                "{id}: the fissure at {:?} stands on {print:?}",
                fissure.at
            );
        }
    }
}
