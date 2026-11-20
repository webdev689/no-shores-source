//! The sea measured as players meet it: players voyaging at x60 through each kind of water of the world's own layout,
//! each straight out 150 km and back again, for ten minutes. Run by hand, in release, to print the numbers:
//! `cargo test -p room --release measure -- --ignored --nocapture`.

use crate::PlayerId;
use crate::sea::Sea;
use crate::sighting::sight_for;
use std::collections::BTreeMap;
use world::traffic::Port;
use world::waters::Holder;

const TICKS_A_SECOND: usize = 60;
const MINUTES: usize = 10;
const LEG_M: f64 = 150_000.0;

pub(crate) fn world() -> (world::layout::Layout, Vec<Port>) {
    let layout = world::layout::parse(include_str!("../../../content/world/layout.json")).unwrap();
    let ports = (1..=9)
        .map(|n| {
            let path = format!("{}/../../content/world/land/continent-{n}.json", env!("CARGO_MANIFEST_DIR"));
            let file: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
            let city = &file["city"];
            let centre = [city["centre"][0].as_f64().unwrap(), city["centre"][1].as_f64().unwrap()];
            let (id, name) = (city["id"].as_str().unwrap().to_owned(), city["name"].as_str().unwrap().to_owned());
            Port { id, name, continent: format!("continent-{n}"), centre }
        })
        .collect();
    (layout, ports)
}

fn kind_of(holder: Holder) -> &'static str {
    match holder {
        Holder::Home => "home",
        Holder::Contested => "contested",
        Holder::GreyTithe => "grey tithe",
        Holder::Pirates => "pirates",
    }
}

/// A straight leg `LEG_M` from `from` toward `bearing` (radians clockwise from north), and back.
fn there_and_back(from: [f64; 2], bearing: f64) -> Vec<[f64; 2]> {
    vec![from, [from[0] + LEG_M * libm::sin(bearing), from[1] - LEG_M * libm::cos(bearing)], from]
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_sea_by_its_waters() {
    measure(false);
    measure(true);
}

/// The sea measured, its players chasing every hostile ship they sight or not: each chaser sets her course for the
/// nearest each half second, and back to her own once none is in sight.
fn measure(chase: bool) {
    let (layout, ports) = world();
    let charted = crate::chart::Charted::new(&layout, &ports);
    let mut sea = Sea::new(&layout, crate::deck::test_deck(), 0x5ea, &ports);
    let mut players: Vec<(PlayerId, &'static str, Vec<[f64; 2]>)> = Vec::new();
    let bearings = (0..16).map(|step| f64::from(step) / 16.0 * std::f64::consts::TAU);
    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let (mut chosen, mut y) = (Vec::<[f64; 2]>::new(), 40_000.0);
    while y < world::check::FRAME_HEIGHT_M as f64 {
        let mut x = 40_000.0;
        while x < world::check::FRAME_WIDTH_M as f64 {
            let centre = [x, y];
            x += 37_000.0;
            let Some((water, _)) = charted.water(centre) else { continue };
            let kind = kind_of(water.holder);
            let far = chosen.iter().all(|other| {
                let (east, south) = (other[0] - centre[0], other[1] - centre[1]);
                (east * east + south * south).sqrt() > 120_000.0
            });
            if counts.get(kind).copied().unwrap_or(0) >= 20 || !far {
                continue;
            }
            // A course refused still waits out the next, so each bearing is tried by a player of its own.
            let mut tried = |course: &Vec<[f64; 2]>| {
                let player = sea.join();
                let taken = sea.course(player, course, 60).is_ok();
                if !taken {
                    sea.leave(player);
                }
                taken.then_some(player)
            };
            let Some((player, course)) = bearings
                .clone()
                .map(|bearing| there_and_back(centre, bearing))
                .find_map(|course| Some((tried(&course)?, course)))
            else {
                continue;
            };
            chosen.push(centre);
            *counts.entry(kind).or_default() += 1;
            players.push((player, kind, course));
        }
        y += 41_000.0;
    }
    let mut first_sighted: BTreeMap<PlayerId, usize> = BTreeMap::new();
    let mut fought: BTreeMap<PlayerId, usize> = BTreeMap::new();
    let mut in_sight: BTreeMap<u32, (usize, &str)> = BTreeMap::new();
    let mut chasing = std::collections::BTreeSet::new();
    for tick in 0..MINUTES * 60 * TICKS_A_SECOND {
        sea.tick();
        let ships: Vec<_> = sea.ships().collect();
        for (player, kind, course) in &players {
            let Some(&(_, ship)) = ships.iter().find(|(each, _)| each == player) else { continue };
            let at = [ship.x, ship.y];
            let quarry = sea.pirates().into_iter().filter(|pirate| pirate.sees(at)).min_by(|one, other| {
                let off = |pirate: &crate::pirates::Pirate| (pirate.x - at[0]).abs() + (pirate.y - at[1]).abs();
                off(one).total_cmp(&off(other))
            });
            if sea.fights().any(|(fighting, _)| fighting == *player) {
                if !fought.contains_key(player) {
                    let here = charted.water(at).map(|(water, _)| water.holder);
                    assert_ne!(here, Some(Holder::Home), "a fight in home waters, where none comes");
                }
                fought.entry(*player).or_insert(tick);
            } else if tick % 30 == 0 {
                match quarry.filter(|_| chase) {
                    Some(pirate) => {
                        chasing.insert(*player);
                        let _ = sea.course(*player, &[[pirate.x, pirate.y]], 60);
                    }
                    None if ship.pace == 0 || chasing.remove(player) => {
                        let _ = sea.course(*player, course, 60);
                    }
                    None => {}
                }
            }
            for pirate in sea.pirates() {
                if pirate.sees([ship.x, ship.y]) {
                    first_sighted.entry(*player).or_insert(tick);
                    in_sight.entry(pirate.id).or_insert((0, kind)).0 += 1;
                }
            }
        }
    }
    let seconds = |ticks: usize| ticks as f64 / TICKS_A_SECOND as f64;
    eprintln!("chasing: {chase}; sight at x60: {:.0} m; players by water: {counts:?}", sight_for(60.0));
    for kind in ["home", "contested", "grey tithe", "pirates"] {
        let of_kind: Vec<PlayerId> = players.iter().filter(|each| each.1 == kind).map(|each| each.0).collect();
        let total = of_kind.len().max(1) as f64;
        let mut firsts: Vec<f64> =
            of_kind.iter().filter_map(|player| first_sighted.get(player)).map(|&ticks| seconds(ticks)).collect();
        firsts.sort_by(f64::total_cmp);
        let median = firsts.get(firsts.len() / 2).copied();
        let by = |minutes: usize| {
            of_kind
                .iter()
                .filter(|player| fought.get(player).is_some_and(|&ticks| ticks < minutes * 60 * TICKS_A_SECOND))
                .count() as f64
                / total
        };
        let stays: Vec<f64> = in_sight.values().filter(|each| each.1 == kind).map(|each| seconds(each.0)).collect();
        let long = stays.iter().filter(|&&stay| stay >= 30.0).count() as f64 / stays.len().max(1) as f64;
        let mean = stays.iter().sum::<f64>() / stays.len().max(1) as f64;
        eprintln!(
            "{kind}: {} players; first sighting for {}/{} (median {median:?} s); {} ships sighted, in sight {mean:.0} s on \
             average, {:.0}% 30 s and over; a fight by 5 min {:.0}%, by 10 min {:.0}%",
            of_kind.len(),
            firsts.len(),
            of_kind.len(),
            stays.len(),
            long * 100.0,
            by(5) * 100.0,
            by(10) * 100.0
        );
    }
    // A player is counted by the water she sets out in: from home waters her voyage reaches the waters beside them, so
    // a fight of hers is checked to be out of home waters where it begins (above).
    assert!(!players.is_empty());
}
