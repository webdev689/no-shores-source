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
            if let (plan::Ground::Under(dungeon), Some(lamp)) = (&plan.ground, sites.lamp) {
                let cell =
                    (lamp[1] / dungeon::CELL_M) as usize * dungeon.columns + (lamp[0] / dungeon::CELL_M) as usize;
                let tallest = dungeon.rooms.iter().map(|room| room.height).fold(0.0, f64::max);
                let wanted = tallest.min(3.8);
                assert!(
                    dungeon.ceilings[cell] >= wanted,
                    "{what}: the lamp's ceiling {} under {wanted}",
                    dungeon.ceilings[cell]
                );
            }
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

/// Saltmere's coast as the world's layout draws it, a ring of points in metres.
fn saltmere_coast() -> Vec<[f64; 2]> {
    let layout: serde_json::Value =
        serde_json::from_str(include_str!("../../../content/world/layout.json")).expect("the layout reads");
    let continents = layout["continents"].as_array().expect("continents");
    let saltmere = continents.iter().find(|continent| continent["id"] == "continent-1").expect("Saltmere");
    let points = saltmere["outline"].as_array().expect("an outline");
    points.iter().map(|point| [point[0].as_f64().unwrap_or(0.0), point[1].as_f64().unwrap_or(0.0)]).collect()
}

/// How far a point lies from a ring's nearest edge, metres.
fn from_edge(ring: &[[f64; 2]], point: [f64; 2]) -> f64 {
    let apart = |[x1, y1]: [f64; 2], [x2, y2]: [f64; 2]| {
        let (east, south) = (x2 - x1, y2 - y1);
        let length = (east * east + south * south).max(1e-9);
        let share = (((point[0] - x1) * east + (point[1] - y1) * south) / length).clamp(0.0, 1.0);
        libm::hypot(point[0] - x1 - share * east, point[1] - y1 - share * south)
    };
    (0..ring.len()).map(|at| apart(ring[at], ring[(at + 1) % ring.len()])).fold(f64::INFINITY, f64::min)
}

#[test]
fn every_zone_of_every_week_lies_on_saltmeres_land_clear_of_its_coast() {
    // Two kilometres in, so a zone stays on land where the generated coast wanders off the drawn one.
    const INLAND_M: f64 = 2_000.0;
    let coast = saltmere_coast();
    let mut at_sea = Vec::new();
    for week in 2_900..3_000 {
        for zone in &Web::of(saltmere(), week).zones {
            if !within(&coast, zone.at) || from_edge(&coast, zone.at) < INLAND_M {
                at_sea.push(format!("week {week} depth {} lane {}", zone.depth, zone.lane));
            }
        }
    }
    assert!(at_sea.is_empty(), "{} zones off the land, the first {:?}", at_sea.len(), at_sea.first());
}

/// How long `Plan::of` takes over every zone of twelve weeks, printed: mean and worst. Run by hand, in release:
/// `cargo test -p passage --release time_the_layings -- --ignored --nocapture`.
#[test]
#[ignore = "a measurement, printed by hand in release"]
#[allow(clippy::disallowed_methods, reason = "it times the layings and reports them")]
fn time_the_layings() {
    let mut took = Vec::new();
    for week in 2_900..2_912 {
        let web = Web::of(saltmere(), week);
        for zone in &web.zones {
            let start = std::time::Instant::now();
            let plan = Plan::of(&web, zone.number);
            took.push((start.elapsed().as_secs_f64() * 1_000.0, week, zone.number, plan.is_some()));
        }
    }
    let mean = took.iter().map(|(ms, ..)| ms).sum::<f64>() / took.len() as f64;
    let worst = took.iter().copied().max_by(|one, two| one.0.total_cmp(&two.0)).expect("zones");
    eprintln!("{} zones: mean {mean:.2} ms, worst {:.1} ms (week {} zone {})", took.len(), worst.0, worst.1, worst.2);
}

#[test]
fn every_zone_of_a_year_is_laid_where_a_body_walks_to_all_it_asks() {
    let mut fell_back = Vec::new();
    for week in 2_900..2_952 {
        let web = Web::of(saltmere(), week);
        for zone in &web.zones {
            let plan = Plan::of(&web, zone.number).expect("a plan");
            let missed = plan.unwalked();
            if missed > 0 {
                fell_back.push(format!(
                    "week {week} zone {} {:?} {:?}: {missed} missed",
                    zone.number, zone.ground, zone.deal
                ));
            }
        }
    }
    assert!(fell_back.is_empty(), "{} zones kept a laying with misses: {fell_back:#?}", fell_back.len());
}

/// What a year of webs gives, printed: run with `--ignored --nocapture` to measure.
#[test]
#[ignore = "a measure, printed"]
fn measure_the_webs() {
    let mut one_way = (0, 0);
    let mut names = std::collections::BTreeMap::<String, usize>::new();
    let mut dive_repeats = 0.0;
    let mut dives = 0.0;
    for week in 2_900..2_952 {
        let web = Web::of(saltmere(), week);
        for zone in web.zones.iter().filter(|zone| zone.depth < DEPTHS) {
            one_way.1 += 1;
            one_way.0 += usize::from(zone.onward.len() == 1);
        }
        for zone in &web.zones {
            *names.entry(zone.name.clone()).or_default() += 1;
        }
        // Each mouth's dive down the first way on at every depth.
        for &mouth in &web.mouths {
            let mut at = mouth;
            let mut met = std::collections::BTreeSet::new();
            let mut walked = 0;
            while let Some(zone) = web.zone_of(at) {
                met.insert(zone.name.clone());
                walked += 1;
                let Some(&next) = zone.onward.last() else { break };
                at = next;
            }
            dive_repeats += f64::from(walked - met.len() as u32);
            dives += 1.0;
        }
    }
    let most = names.iter().max_by_key(|(_, count)| **count);
    eprintln!(
        "one way on: {} of {} ({:.0}%); {} names, the most met {most:?}; a dive repeats {:.1} names",
        one_way.0,
        one_way.1,
        100.0 * one_way.0 as f64 / one_way.1 as f64,
        names.len(),
        dive_repeats / dives
    );
}

#[test]
fn a_years_webs_name_each_zone_apart_draw_no_vault_above_ground_and_offer_a_choice_of_ways() {
    let (mut zones, mut one_way) = (0, 0);
    for week in 2_900..2_952 {
        let web = Web::of(saltmere(), week);
        let mut names: Vec<&str> = web.zones.iter().map(|zone| zone.name.as_str()).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), web.zones.len(), "week {week}: every zone's name its own");
        for zone in &web.zones {
            assert!(!zone.name.is_empty(), "week {week} zone {}: named", zone.number);
            let open = matches!(zone.ground, Ground::Open { .. });
            assert!(!(open && zone.deal == Deal::Vault), "week {week} zone {}: a vault above ground", zone.number);
            if zone.depth < DEPTHS {
                zones += 1;
                one_way += usize::from(zone.onward.len() == 1);
            }
        }
        // Under a named place only near one: the Grey Reach's at depth 10, the Weirlands' at 20.
        let under: Vec<u8> =
            web.zones.iter().filter(|zone| zone.name.starts_with("Under ")).map(|zone| zone.depth).collect();
        assert!(under.iter().all(|depth| [10, 20].contains(depth)), "week {week}: under named places at {under:?}");
        assert!(under.contains(&10) && under.contains(&20), "week {week}: {under:?}");
    }
    assert_eq!(one_way, 0, "of {zones} zones above the deepest, those that offer one way on");
}

#[test]
fn a_zones_currents_never_say_again_what_the_weeks_modifiers_do_and_its_deal_takes_each() {
    for week in 2_900..2_952 {
        let web = Web::of(saltmere(), week);
        let modifiers = gear::passages::week_modifiers(&saltmere().id, week);
        for zone in &web.zones {
            assert_eq!(zone.currents.len(), Current::count_at(zone.depth), "week {week} zone {}", zone.number);
            for current in &zone.currents {
                assert!(current.fits(zone.deal), "week {week} zone {}: {current:?} on {:?}", zone.number, zone.deal);
                assert!(
                    modifiers.iter().all(|modifier| !current.restates(*modifier)),
                    "week {week} zone {}: {current:?} under {modifiers:?}",
                    zone.number
                );
            }
        }
    }
    assert!(Current::Spent.restates(gear::activities::Modifier::Trickle));
    assert!(!Current::Veteran.fits(Deal::Vault) && !Current::Crowded.fits(Deal::Vault));
}

#[test]
fn a_weeks_public_way_is_one_zone_a_depth_each_reached_from_the_last() {
    for week in 2_900..2_952 {
        let web = Web::of(saltmere(), week);
        let way: Vec<&Zone> = web.zones.iter().filter(|zone| zone.public).collect();
        let depths: Vec<u8> = way.iter().map(|zone| zone.depth).collect();
        assert_eq!(depths, (1..=DEPTHS).collect::<Vec<_>>(), "week {week}: one a depth");
        assert!(way.windows(2).all(|pair| pair[0].onward.contains(&pair[1].number)), "week {week}: a way");
    }
}

#[test]
fn a_holds_ring_lies_whole_on_its_zones_floor_under_ground_and_above() {
    let (mut off, mut buried) = (Vec::new(), Vec::new());
    let mut rings = 0;
    let edge_of = |middle: [f64; 2]| {
        let round = (0..36).map(|step| f64::from(step) * std::f64::consts::TAU / 36.0);
        round.map(move |turn| [middle[0] + plan::RING_M * libm::sin(turn), middle[1] - plan::RING_M * libm::cos(turn)])
    };
    for week in 2_900..2_916 {
        let web = Web::of(saltmere(), week);
        for zone in web.zones.iter().filter(|zone| zone.deal == Deal::Mission(Mission::Hold)) {
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let ring = plan.pieces.iter().find(|piece| piece.kind == Kind::Ring).expect("a ring");
            let middle = [ring.at[0], ring.at[1]];
            let share = match &plan.ground {
                Laid::Under(dungeon) => f64::from(u8::from(crate::under::ring_clear(dungeon, middle))),
                Laid::Open(hollow) => {
                    // Its stones lie in the floor, no more than 4 cm over it or 25 cm under: the floor is levelled.
                    let floor = plan.floor_at(middle);
                    let laid = edge_of(middle).filter(|at| (-0.25..=0.04).contains(&(plan.floor_at(*at) - floor)));
                    if laid.count() < 32 {
                        buried.push((week, zone.number));
                    }
                    edge_of(middle).filter(|at| within(&hollow.ring, *at)).count() as f64 / 36.0
                }
            };
            rings += 1;
            if share < 1.0 {
                off.push((week, zone.number, share));
            }
        }
    }
    assert!(rings > 30, "{rings} rings");
    assert!(off.is_empty(), "{} of {rings} rings off the floor: {off:?}", off.len());
    assert!(buried.is_empty(), "rings above ground buried or standing over the floor: {buried:?}");
}

#[test]
fn a_hollows_dressing_stands_clear_of_its_holds_levelled_ring() {
    let mut on = Vec::new();
    for week in 2_900..2_908 {
        let web = Web::of(saltmere(), week);
        for zone in web.zones.iter().filter(|zone| zone.deal == Deal::Mission(Mission::Hold)) {
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let Laid::Open(hollow) = &plan.ground else { continue };
            let ring = plan.pieces.iter().find(|piece| piece.kind == Kind::Ring).expect("a ring");
            let inside = |at: [f64; 2]| libm::hypot(at[0] - ring.at[0], at[1] - ring.at[1]) < plan::RING_M + 1.0;
            let corners = |block: &movement::Block| {
                [
                    [block.min_x, block.min_y],
                    [block.max_x, block.min_y],
                    [block.max_x, block.max_y],
                    [block.min_x, block.max_y],
                ]
            };
            if hollow.blocks.iter().any(|block| corners(block).into_iter().any(inside)) {
                on.push((week, zone.number));
            }
        }
    }
    assert!(on.is_empty(), "dressing on a Hold's ring: {on:?}");
}

/// Every zone laid under ground over a run of weeks, each with its plan, its dungeon and a name for its asserts.
fn under_plans(weeks: core::ops::Range<u64>, keep: fn(&Zone) -> bool) -> Vec<(String, Plan, dungeon::Dungeon)> {
    let mut found = Vec::new();
    for week in weeks {
        let web = Web::of(saltmere(), week);
        for zone in web.zones.iter().filter(|zone| matches!(zone.ground, Ground::Under { .. }) && keep(zone)) {
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let Laid::Under(dungeon) = &plan.ground else { continue };
            let dungeon = (**dungeon).clone();
            found.push((format!("week {week} zone {} {:?}", zone.number, zone.deal), plan, dungeon));
        }
    }
    found
}

/// The cell of a dungeon a point stands in.
fn cell_of(dungeon: &dungeon::Dungeon, at: [f64; 2]) -> usize {
    (at[1] / dungeon::CELL_M) as usize * dungeon.columns + (at[0] / dungeon::CELL_M) as usize
}

#[test]
fn under_ground_the_lamp_and_the_deals_pieces_stand_clear_of_the_forges_solids_and_mouths_off_its_stones() {
    let overlaps = |one: &[f64; 5], other: &[f64; 5]| {
        one[0] < other[2] && other[0] < one[2] && one[1] < other[3] && other[1] < one[3]
    };
    let (mut in_solid, mut on_stone) = (Vec::new(), Vec::new());
    for (what, plan, dungeon) in under_plans(2_900..2_952, |_| true) {
        let boxes = dungeon.boxes();
        for piece in plan.pieces.iter().filter(|piece| !matches!(piece.kind, Kind::WayIn | Kind::Mouth(_))) {
            let at = [piece.at[0], piece.at[1]];
            let solids = piece.kind.solids_at(piece.at, piece.facing);
            let on_rock = |&[west, north, east, south, _]: &[f64; 5]| {
                [[west, north], [east, north], [east, south], [west, south]]
                    .into_iter()
                    .any(|corner| !matches!(dungeon.cells[cell_of(&dungeon, corner)], dungeon::Cell::Room(_)))
            };
            if dungeon.holds_solid(cell_of(&dungeon, at))
                || solids.iter().any(|solid| on_rock(solid) || boxes.iter().any(|held| overlaps(solid, held)))
            {
                in_solid.push(format!("{what}: {:?} at {at:?}", piece.kind));
            }
        }
        for &spot in &plan.sites.spots {
            if dungeon.holds_solid(cell_of(&dungeon, spot)) {
                in_solid.push(format!("{what}: a spot at {spot:?}"));
            }
        }
        for door in &plan.sites.onward {
            // The cell behind the mouth's wall, half a cell back from the way it faces.
            let back = [door.at[0] - 0.5 * libm::sin(door.facing), door.at[1] + 0.5 * libm::cos(door.facing)];
            let behind = cell_of(&dungeon, back);
            if dungeon.rooms.iter().any(|room| room.stones.contains(&behind)) {
                on_stone.push(format!("{what}: mouth at {:?}", door.at));
            }
        }
    }
    assert!(in_solid.is_empty(), "{} pieces in the Forge's solids: {in_solid:#?}", in_solid.len());
    assert!(on_stone.is_empty(), "{} mouths on a cave's stone: {on_stone:#?}", on_stone.len());
}

#[test]
fn every_under_ground_lamp_of_ten_years_stands_under_a_ceiling_tall_enough() {
    let mut low = Vec::new();
    for (what, plan, dungeon) in under_plans(2_900..3_420, Zone::has_lamp) {
        let Some(lamp) = plan.sites.lamp else { continue };
        // The lamp never stands in the way in's room.
        let rooms = dungeon.rooms.iter().enumerate().filter(|(number, _)| *number != dungeon.way_in.room);
        let tallest = rooms.map(|(_, room)| room.height).fold(0.0, f64::max);
        let ceiling = dungeon.ceilings[cell_of(&dungeon, lamp)];
        if ceiling < tallest.min(crate::LAMP_CEILING_M) {
            low.push(format!("{what}: {ceiling} under {tallest}"));
        }
    }
    assert!(low.is_empty(), "{} lamps under a low ceiling: {low:#?}", low.len());
}
