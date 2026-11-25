use super::*;
use crate::plan::{KINDLES, Kind, NODES, POSTS};

/// Whether a point lies inside a ring (crossings counted along a line east of it).
fn within(ring: &[[f64; 2]], [x, y]: [f64; 2]) -> bool {
    let mut inside = false;
    for (at, &[x1, y1]) in ring.iter().enumerate() {
        let [x2, y2] = ring[(at + 1) % ring.len()];
        if (y1 > y) != (y2 > y) && x < x1 + (y - y1) * (x2 - x1) / (y2 - y1) {
            inside = !inside;
        }
    }
    inside
}

fn saltmere() -> &'static Island {
    island("continent-1").expect("Saltmere's passages")
}

/// The weeks the tests walk: a run of them, so a rule holds for every web a week draws, not one.
const WEEKS: core::ops::Range<u64> = 2_900..2_916;

#[test]
fn saltmere_has_three_mouths_and_a_spine_rising_across_the_island() {
    let island = saltmere();
    assert_eq!(island.patrol, "saltgrass-downs");
    assert_eq!(island.mouths, ["The Chalk Adit", "The Beacon Stair", "The Tithe Barns"]);
    assert!(island.spine.windows(2).all(|pair| pair[1][2] > pair[0][2]), "the spine's depths rise");
    assert_eq!(island.spine.last().map(|point| point[2]), Some(f64::from(DEPTHS)));
    assert_eq!(super::island("saltgrass-downs"), Some(island), "found by its patrol zone too");
}

#[test]
fn foes_stand_at_the_islands_band_first_and_at_the_top_of_the_game_deepest() {
    assert_eq!(levels((1, 4), 1), (1, 4));
    assert_eq!(levels((1, 4), 5), (2, 5));
    assert_eq!(levels((1, 4), 10), (7, 10));
    assert_eq!(levels((1, 4), 15), (15, 18));
    assert_eq!(levels((1, 4), 20), (27, 30));
    assert_eq!(levels((26, 30), 20), (26, 30), "the last island's band is already the top");
    for depth in 1..DEPTHS {
        assert!(levels((1, 4), depth + 1) >= levels((1, 4), depth), "never easier deeper");
    }
    assert_eq!(lamp_number(5), Some(1));
    assert_eq!(lamp_number(20), Some(4));
    assert_eq!(lamp_number(7), None);
}

#[test]
fn a_weeks_web_runs_twenty_deep_each_zone_reached_and_leading_on() {
    for week in WEEKS {
        let web = Web::of(saltmere(), week);
        assert_eq!(web, Web::of(saltmere(), week), "the same web from the same week");
        assert_eq!(web.mouths.len(), 3);
        assert!(web.mouths.iter().all(|&number| web.zones[usize::from(number)].depth == 1));
        for zone in &web.zones {
            assert_eq!(zone.number, web.zones.iter().position(|each| each == zone).unwrap() as u16);
            if zone.depth < DEPTHS {
                assert!((1..=4).contains(&zone.onward.len()), "week {week} zone {}: {:?}", zone.number, zone.onward);
                assert!(zone.onward.iter().all(|&next| web.zones[usize::from(next)].depth == zone.depth + 1));
            } else {
                assert!(zone.onward.is_empty(), "the deepest leads nowhere");
            }
            if zone.depth > 1 {
                assert!(web.ways_in(zone.number).next().is_some(), "week {week}: zone {} has a way in", zone.number);
            }
            assert_eq!(zone.has_lamp(), zone.deal == Deal::Lamp, "a lamp's zone is its lamp, and only its");
            assert_eq!(zone.currents.len(), Current::count_at(zone.depth));
            assert!(zone.currents.iter().all(|current| *current != Current::RichSeam || zone.deal == Deal::Vein));
        }
    }
    assert_ne!(Web::of(saltmere(), 2_900), Web::of(saltmere(), 2_901), "the web turns with the week");
}

#[test]
fn every_zone_lays_its_ground_mouths_lamp_and_deal() {
    for week in WEEKS {
        let web = Web::of(saltmere(), week);
        for zone in &web.zones {
            if let Ground::Under { style } = &zone.ground
                && dungeon::style_of(style).is_none()
            {
                continue;
            }
            let plan = Plan::of(&web, zone.number).expect("a known style lays");
            let sites = &plan.sites;
            let what = format!("week {week} zone {} ({:?} {:?})", zone.number, zone.ground, zone.size);
            assert_eq!(sites.onward.len(), zone.onward.len(), "{what}: a mouth for every way on");
            assert_eq!(sites.lamp.is_some(), zone.has_lamp(), "{what}: its lamp");
            let wanted = match zone.deal {
                Deal::Mission(Mission::Kindle) => KINDLES,
                Deal::Mission(Mission::Sever) => POSTS,
                Deal::Vein => NODES,
                Deal::Reliquary => 1,
                _ => 0,
            };
            let deal_pieces = plan.pieces.iter().filter(|piece| {
                matches!(piece.kind, Kind::Kindle(_) | Kind::Post(_) | Kind::Node(_) | Kind::Reliquary)
            });
            assert_eq!(deal_pieces.count(), wanted, "{what}: its deal's pieces");
            assert!(!sites.posts.is_empty(), "{what}: somewhere for its foes");
            let apart = |one: [f64; 2], other: [f64; 2]| libm::hypot(one[0] - other[0], one[1] - other[1]);
            assert!(apart(sites.arrive, sites.way_in.at) < 4.5, "{what}: a body comes in by its way in");
            assert!(sites.onward.iter().all(|door| apart(door.at, sites.way_in.at) >= 9.0), "{what}: on is away");
            if let plan::Ground::Open(hollow) = &plan.ground {
                let inside = |point: [f64; 2]| within(&hollow.ring, point);
                assert!(inside(sites.arrive), "{what}: arrives inside its section");
                assert!(sites.onward.iter().chain([&sites.way_in]).all(|door| inside(door.at)), "{what}: its mouths");
                assert!(sites.lamp.is_none_or(inside) && sites.spots.iter().all(|spot| inside(*spot)), "{what}: spots");
                let floor = plan.floor_at(sites.arrive);
                assert!((floor - hollow::FLOOR_M).abs() < 8.0, "{what}: arrives on the floor, not up a wall: {floor}");
            }
        }
    }
}

#[test]
#[ignore = "a probe"]
fn probe_webs() {
    use std::collections::BTreeMap;
    let mut deals: BTreeMap<&str, u32> = BTreeMap::new();
    let mut grounds: BTreeMap<String, u32> = BTreeMap::new();
    let (mut zones, mut cells, mut placements, mut most_cells) = (0, 0_usize, 0_usize, 0_usize);
    for week in WEEKS {
        let web = Web::of(saltmere(), week);
        for zone in &web.zones {
            *deals.entry(zone.deal.key()).or_default() += 1;
            let key = match &zone.ground {
                Ground::Under { style } => format!("under {style} {}", zone.size.key()),
                Ground::Open { form } => format!("open {} {}", form.key(), zone.size.key()),
            };
            *grounds.entry(key).or_default() += 1;
            zones += 1;
            if let Some(plan) = Plan::of(&web, zone.number)
                && let plan::Ground::Open(hollow) = &plan.ground
            {
                let floats = hollow.ground.to_floats().len();
                cells += floats;
                most_cells = most_cells.max(floats);
                placements += hollow.placements.len();
            }
        }
    }
    eprintln!("zones {zones}; open cells {cells} most {most_cells} placements {placements}");
    eprintln!("deals {deals:?}");
    for (key, count) in grounds {
        eprintln!("{key}: {count}");
    }
    let web = Web::of(saltmere(), 2_900);
    for zone in &web.zones {
        eprintln!(
            "{:>2} d{:>2} l{} {:>28} {:?} {:?} {:?} -> {:?} at {:.0},{:.0}",
            zone.number,
            zone.depth,
            zone.lane,
            zone.name,
            zone.size,
            zone.deal,
            zone.currents,
            zone.onward,
            zone.at[0],
            zone.at[1]
        );
    }
}
