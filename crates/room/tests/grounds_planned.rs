//! Saltmere's public events' grounds as the bake plans them: each hamlet's three stores on clear ground beside its
//! houses, off the ways, never under a building, each a box a body runs into; its raiders' approach and banners; each
//! wilds' growth spot; and only Saltmere's three zones' node files carry grounds, which the room's events read.

use layout::brief::AreaKind;
use layout::field::{distance, ring_holds};
use layout::sites::SiteKind;
use std::path::Path;

/// Continent 1's layouts as the bake settles them, settled once for every test here.
fn continent_one() -> &'static [layout::Layout] {
    static SETTLED: std::sync::OnceLock<Vec<layout::Layout>> = std::sync::OnceLock::new();
    SETTLED.get_or_init(|| continent("continent-1"))
}

/// A continent's layouts as the bake settles them.
fn continent(id: &str) -> Vec<layout::Layout> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let read = |path: &str| std::fs::read_to_string(root.join(path)).expect("the world's files are in the repository");
    let world = world::layout::parse(&read("content/world/layout.json")).expect("the layout parses");
    let continent = world.continents.into_iter().find(|continent| continent.id == id).expect("the continent");
    let edits = land::edits::parse(&read(&format!("content/world/land/{id}.json"))).expect("the edits parse");
    let builders = bake::builders(&root).expect("the builders read");
    let city = city::rmb::Blocks::from_index(&read("content/world/rmb/index.json")).expect("the RMB index reads");
    let mut landmass = land::landmass::generate(&continent, edits).expect("the continent generates");
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
        for (nth, store) in raid.stores.iter().enumerate() {
            assert!(ring_holds(&laid.ring, store[0], store[1]), "{id}: the store at {store:?} is in the section");
            assert!(distance(*store, raid.at) < raid.radius, "{id}: within the raid's ground");
            let [half_x, half_y] = layout::grounds::STORE_HALF;
            for building in &laid.seating.buildings {
                let [west, north, east, south] = building.footprint;
                let under = store[0] + half_x > west && store[0] - half_x < east && store[1] + half_y > north;
                assert!(!(under && store[1] - half_y < south), "{id}: the store at {store:?} is under a building");
            }
            // Its box is the stack the page draws it as, its own size.
            let ([half_x, half_y], tall) = layout::grounds::store_stack(nth);
            let walled = laid.boxes.iter().any(|found| {
                let fits = |one: f64, two: f64| (one - two).abs() < 1e-9;
                fits(found[0], store[0] - half_x)
                    && fits(found[3], store[1] + half_y)
                    && fits(found[4] - found[5], tall + 0.3)
            });
            assert!(walled, "{id}: a body runs into the store at {store:?}, its stack's own size");
            for path in &laid.paths {
                let off = path.points.windows(2).map(|pair| layout::paths::off_line(*store, pair[0], pair[1]));
                assert!(off.fold(f64::INFINITY, f64::min) > path.tier.width() / 2.0 + half_x, "{id}: off the ways");
            }
        }
        assert!(ring_holds(&laid.ring, raid.approach[0], raid.approach[1]), "{id}: the raiders come in from inside");
        let growth = distance(fissure.growth, fissure.at);
        assert!((14.0 - 1e-9..=20.0 + 1e-9).contains(&growth), "{id}: the growth rises {growth} m from its middle");
    }
    let others = layouts.iter().filter(|layout| !bake::EVENT_ZONES.contains(&layout.id.as_str()));
    assert!(others.clone().count() > 0 && others.clone().all(|other| bake::grounds_of(other).is_none()));
}

/// The kinds of site only an event's ground is marked with.
const EVENT_SITES: [SiteKind; 5] =
    [SiteKind::Store, SiteKind::Approach, SiteKind::Banner, SiteKind::Fissure, SiteKind::Growth];

#[test]
fn only_the_grounds_an_event_is_fought_on_are_marked_so_no_other_hamlet_has_a_store_a_body_runs_into() {
    // Saltmere is continent 1's only island with hamlets; continent 2's highlands have their own.
    let (layouts, highlands) = (continent_one(), continent("continent-2"));
    let hamlets = |laid: &layout::Layout| laid.areas.iter().filter(|area| area.kind == AreaKind::Hamlet).count();
    let elsewhere: Vec<&layout::Layout> = layouts
        .iter()
        .chain(highlands.iter())
        .filter(|laid| !bake::EVENT_ZONES.contains(&laid.id.as_str()) && hamlets(laid) > 0)
        .collect();
    assert!(!elsewhere.is_empty(), "hamlets outside the event zones");
    for laid in elsewhere {
        let marked = laid.sites.iter().find(|site| EVENT_SITES.contains(&site.kind));
        assert!(marked.is_none(), "{}: no event's site off the event zones, found {marked:?}", laid.id);
    }
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let grounds = bake::grounds_of(laid).expect("an event zone has grounds");
        let (raid, fissure) = (grounds.raid.expect("a raid"), grounds.fissure.expect("a fissure"));
        let of = |kind: SiteKind| laid.sites.iter().filter(move |site| site.kind == kind).map(|site| site.at);
        // Every store marked is one of the raid's, so every store boxed is one the page draws.
        assert_eq!(of(SiteKind::Store).collect::<Vec<_>>(), raid.stores, "{id}: only the raid's hamlet stores");
        assert_eq!(of(SiteKind::Banner).collect::<Vec<_>>(), raid.banners, "{id}: only the raid's banners");
        assert_eq!(of(SiteKind::Approach).collect::<Vec<_>>(), vec![raid.approach], "{id}: one approach");
        assert_eq!(of(SiteKind::Fissure).collect::<Vec<_>>(), vec![fissure.at], "{id}: one fissure");
        assert_eq!(of(SiteKind::Growth).collect::<Vec<_>>(), vec![fissure.growth], "{id}: one growth's spot");
    }
}

#[test]
fn each_stores_box_covers_the_stack_it_is_drawn_as_and_the_plundered_one_it_turns_into() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let text = std::fs::read_to_string(root.join("content/modules/modules.json")).expect("the modules' manifest");
    let manifest: serde_json::Value = serde_json::from_str(&text).expect("the manifest parses");
    let size = |name: &str| -> [f64; 3] {
        let modules = manifest["modules"].as_array().expect("its modules");
        let module = modules.iter().find(|module| module["name"] == name).expect("the store's module");
        let size = module["size"].as_array().expect("its size");
        [0, 1, 2].map(|axis| size[axis].as_f64().expect("a size is a number"))
    };
    let plundered = size("tithe-stores-plundered");
    for (stack, name) in ["tithe-stores-a", "tithe-stores-b", "tithe-stores-c"].iter().enumerate() {
        let ([half_x, half_y], tall) = layout::grounds::STORE_STACKS[stack];
        for drawn in [size(name), plundered] {
            // The manifest rounds each size to the millimetre.
            let covers = half_x * 2.0 >= drawn[0] - 1e-3 && half_y * 2.0 >= drawn[1] - 1e-3 && tall >= drawn[2] - 1e-3;
            assert!(covers, "{name}'s box {half_x} x {half_y} x {tall} covers {drawn:?}");
        }
        for (axis, half) in [half_x, half_y].into_iter().enumerate() {
            assert!(half <= layout::grounds::STORE_HALF[axis], "{name}: laid out within a store's room");
        }
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

/// The grounds are marked before the layout stands its later pieces (beacons and resource marks, climbs, cliff
/// stairs, retaining walls, footbridges, talus, graves): each store, banner, growth's spot and fissure stays clear of
/// everything a body runs into in the layout as it is finished, but the stores' own boxes.
#[test]
fn saltmeres_grounds_keep_clear_of_everything_the_finished_layout_stands() {
    let layouts = continent_one();
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let grounds = bake::grounds_of(laid).expect("an event zone has grounds");
        let (raid, fissure) = (grounds.raid.expect("a raid"), grounds.fissure.expect("a fissure"));
        let stores = layout::grounds::store_boxes(&laid.sites, &|_, _| 0.0);
        let own =
            |found: &[f64; 6]| stores.iter().any(|store| (0..4).all(|side| (store[side] - found[side]).abs() < 1e-9));
        let others: Vec<[f64; 6]> = laid.boxes.iter().filter(|found| !own(found)).copied().collect();
        let kept = raid.stores.iter().map(|at| (*at, layout::grounds::STORE_HALF, "store"));
        let kept = kept.chain(raid.banners.iter().map(|at| (*at, [0.5, 0.5], "banner")));
        let kept = kept
            .chain([(fissure.growth, [2.5, 2.5], "growth"), (fissure.at, layout::grounds::FISSURE_HALF, "fissure")]);
        for (at, half, what) in kept {
            let hit = others.iter().find(|found| overlaps(at, half, 0.0, **found));
            assert!(hit.is_none(), "{id}: the {what} at {at:?} stands in a box {hit:?}");
        }
    }
}

#[test]
fn saltmeres_fissures_open_on_clear_ground_beside_their_battlefields_obelisk_never_on_it_or_its_ruins() {
    let layouts = continent_one();
    let half = layout::grounds::FISSURE_HALF;
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

#[test]
fn saltmeres_grounds_keep_every_distance_the_bake_plans_them_by() {
    use layout::grounds::{
        APPROACH_M, BANNERS_APART, BANNERS_M, FISSURE_CLEAR, FISSURE_HALF, RAID_LEAST, RAID_PAST, STORE_CLEAR,
        STORE_HALF, STORE_OFF_WAYS, STORES_APART, STORES_FROM_PLAZA,
    };
    let layouts = continent_one();
    for id in bake::EVENT_ZONES {
        let laid = layouts.iter().find(|layout| layout.id == id).expect("the zone lays out");
        let grounds = bake::grounds_of(laid).expect("an event zone has grounds");
        let (raid, fissure) = (grounds.raid.expect("a raid"), grounds.fissure.expect("a fissure"));
        let held = laid.sites.iter().find(|site| site.kind == SiteKind::Store).and_then(|site| site.holds.clone());
        let hamlet = laid.areas.iter().find(|area| Some(&area.name) == held.as_ref()).expect("the raided hamlet");
        let standing: Vec<[f64; 6]> = (laid.seating.buildings.iter().chain(&laid.seating.props))
            .map(|seated| {
                let [west, north, east, south] = seated.footprint;
                [west, north, east, south, 0.0, 0.0]
            })
            .chain(laid.seating.solids.iter().map(|solid| solid.bounds()))
            .collect();
        for (nth, store) in raid.stores.iter().enumerate() {
            assert!(distance(*store, hamlet.at) <= STORES_FROM_PLAZA + 1e-9, "{id}: within 35 m of the plaza");
            for other in &raid.stores[nth + 1..] {
                assert!(distance(*store, *other) >= STORES_APART - 1e-9, "{id}: stores 8 m apart");
            }
            let hit = standing.iter().find(|print| overlaps(*store, STORE_HALF, STORE_CLEAR, **print));
            assert!(hit.is_none(), "{id}: the store at {store:?} is 1.5 m clear of everything standing, not {hit:?}");
            for path in &laid.paths {
                let off = path.points.windows(2).map(|pair| layout::paths::off_line(*store, pair[0], pair[1]));
                let edge = path.tier.width() / 2.0 + STORE_HALF[0].max(STORE_HALF[1]) + STORE_OFF_WAYS;
                assert!(off.fold(f64::INFINITY, f64::min) > edge, "{id}: the store at {store:?} 2 m off the ways");
            }
        }
        // The approach out along its line, and the banners either side of it: as far as asked, or stepped in 3 m at
        // a time to clear ground.
        let stepped = |out: f64, asked: f64| (0..12).any(|step| (out - (asked - f64::from(step) * 3.0)).abs() < 1e-6);
        let out = distance(raid.approach, hamlet.at);
        assert!(stepped(out, APPROACH_M), "{id}: the approach {out} m out");
        let toward = [(raid.approach[0] - hamlet.at[0]) / out, (raid.approach[1] - hamlet.at[1]) / out];
        let aside = libm::hypot(BANNERS_M, BANNERS_APART);
        for banner in &raid.banners {
            let banner_out = distance(*banner, hamlet.at);
            assert!(stepped(banner_out, aside), "{id}: a banner {banner_out} m out");
            let along = ((banner[0] - hamlet.at[0]) * toward[0] + (banner[1] - hamlet.at[1]) * toward[1]) / banner_out;
            assert!((along - BANNERS_M / aside).abs() < 1e-6, "{id}: a banner 6 m aside of the way in at 28 m");
        }
        let across = |banner: [f64; 2]| (banner[0] - hamlet.at[0]) * toward[1] - (banner[1] - hamlet.at[1]) * toward[0];
        assert!(across(raid.banners[0]) * across(raid.banners[1]) < 0.0, "{id}: one either side");
        let reach = raid.stores.iter().map(|store| distance(*store, raid.at)).fold(0.0, f64::max);
        assert!((raid.radius - (reach + RAID_PAST).max(RAID_LEAST)).abs() < 1e-9, "{id}: the raid's radius");
        let hit = standing.iter().find(|print| overlaps(fissure.at, FISSURE_HALF, FISSURE_CLEAR, **print));
        assert!(hit.is_none(), "{id}: the fissure is 1 m clear of everything standing, not {hit:?}");
    }
}
