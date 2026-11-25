//! The time one player takes over each passage zone's deal, measured for the band (`gear::band::PASSAGE_SECONDS`):
//! the scripted player of `band_measure_tests` (a level 1 player with the starting sword, every foe at its level,
//! held whole, its way found on the navmesh or else on foot) plays the deal to done as a player would: a Kindle's
//! dead lamps held once no foe is near, a Hold's ring stood in, a Gauntlet's far mouth walked to, every other deal's
//! foes brought down, none by hand. Run by hand, in release:
//! `cargo test -p room --release measure_the_deals -- --ignored --nocapture`.

use super::band_measure_tests::{Walker, level_one};
use super::*;
use crate::passages::PassageAsk;
use passage::{Deal, Mission, PieceKind, Plan, Web};

/// The longest one deal is let run: half an hour.
const LONGEST_TICKS: u32 = 60 * 1_800;
/// How near the player comes before swinging, how near a foe is fought before a dead lamp is held or a ring kept,
/// and how near a dead lamp the player stands to hold it (m).
const REACH_M: f64 = 1.6;
const NEAR_M: f64 = 10.0;
const AT_PIECE_M: f64 = 2.8;

/// Where the deal sends the player before its foes: the next dead lamp unlit, the ring, the far mouth.
fn objective(room: &Room) -> Option<([f64; 2], Option<u8>)> {
    let zone = room.zone()?;
    match zone.zone.deal {
        Deal::Mission(Mission::Kindle) => zone.pieces.iter().find_map(|piece| match piece.kind {
            PieceKind::Kindle(nth) if zone.round.lit.get(usize::from(nth)) == Some(&false) => {
                Some(([piece.at[0], piece.at[1]], Some(nth)))
            }
            _ => None,
        }),
        Deal::Mission(Mission::Hold) => zone.sites.spots.first().map(|ring| (*ring, None)),
        // Two metres in from the far mouth's door, on the floor the way is found over.
        Deal::Mission(Mission::Gauntlet) => room.far_mouth().map(|far| {
            let from = zone.sites.arrive;
            let length = libm::hypot(from[0] - far[0], from[1] - far[1]).max(1e-6);
            ([far[0] + (from[0] - far[0]) / length * 2.0, far[1] + (from[1] - far[1]) / length * 2.0], None)
        }),
        _ => None,
    }
}

/// Plays a zone's deal to done: the seconds it took and the foes felled; none, and the foes still standing, if it was
/// not done in half an hour. No foe is felled but by the player's blows.
fn play_the_deal(room: &mut Room) -> (Option<f64>, usize) {
    level_one(room);
    let mut walker = Walker::into(room);
    let player = walker.player;
    let mut felled = std::collections::BTreeSet::new();
    while walker.ticks < LONGEST_TICKS {
        if room.zone().is_some_and(|zone| zone.round.done_at.is_some()) {
            return (Some(f64::from(walker.ticks) / 60.0), felled.len());
        }
        level_one(room);
        let me = *room.fighter(player).expect("in");
        let here = [me.body.x, me.body.y, me.body.z];
        let holding = room.zone().is_some_and(|zone| zone.holds.contains_key(&player));
        let near = |foe: &Foe| libm::hypot(foe.fighter.body.x - me.body.x, foe.fighter.body.y - me.body.y);
        let alive = room.foes.values().filter(|foe| !foe.fighter.dead());
        let nearest = alive.min_by(|one, two| near(one).total_cmp(&near(two))).map(|foe| (near(foe), foe));
        let goal = objective(room);
        // A Hold's ring is kept: only a foe within a blow is fought from inside it.
        let ring = room.zone().is_some_and(|zone| zone.zone.deal == Deal::Mission(Mission::Hold));
        let in_ring = goal.is_some_and(|(at, _)| libm::hypot(at[0] - me.body.x, at[1] - me.body.y) < 3.0);
        let fight = nearest.filter(|(apart, _)| match (goal, ring) {
            (None, _) => true,
            (Some(_), true) => in_ring && *apart < REACH_M + 1.0,
            (Some(_), false) => *apart < NEAR_M,
        });
        match (fight, goal) {
            _ if holding => walker.step(room, here, f64::MAX, false),
            (Some((_, foe)), _) => {
                let there = [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z];
                walker.step(room, there, REACH_M, true);
            }
            (None, Some((at, kindle))) => {
                let apart = libm::hypot(at[0] - me.body.x, at[1] - me.body.y);
                if let Some(nth) = kindle.filter(|_| apart <= AT_PIECE_M) {
                    room.ask_passage(player, PassageAsk::Kindle { lamp: nth });
                }
                let there = [at[0], at[1], movement::Terrain::height_at(&room.floor, at[0], at[1])];
                walker.step(room, there, if kindle.is_some() { AT_PIECE_M } else { 1.0 }, false);
            }
            (None, None) => walker.step(room, here, f64::MAX, false),
        }
        felled.extend(room.foes.iter().filter(|(_, foe)| foe.fighter.dead()).map(|(id, _)| *id));
    }
    let me = room.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]).unwrap_or_default();
    let short = objective(room).map(|(at, _)| libm::hypot(at[0] - me[0], at[1] - me[1]));
    let near = room
        .foes
        .values()
        .filter(|foe| !foe.fighter.dead())
        .map(|foe| libm::hypot(foe.fighter.body.x - me[0], foe.fighter.body.y - me[1]));
    let nearest = near.fold(f64::INFINITY, f64::min);
    eprintln!(
        "not done: the objective {short:?} m off, {} foes standing, the nearest {nearest:.1} m",
        room.living_foes()
    );
    (None, room.living_foes())
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_deals() {
    eprintln!("| Deal | Depth | Foes felled | Seconds |");
    let island = passage::island("continent-1").expect("Saltmere's passages");
    let mut measured: Vec<(String, Option<f64>, usize)> = Vec::new();
    for week in 2_900..2_906 {
        let web = Web::of(island, week);
        for zone in &web.zones {
            let deal = format!("{:?}", zone.deal);
            let lamp = passage::lamp_number(zone.depth);
            let key = lamp.map_or(deal.clone(), |number| format!("{deal} {number}"));
            if measured.iter().filter(|(seen, ..)| *seen == key).count() >= 3 {
                continue;
            }
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let modifiers = gear::passages::week_modifiers("continent-1", week);
            let route = ("continent-1", week, gear::dive::Route::Company);
            let Some(mut room) = Room::passage(&plan, (1, 4), modifiers, route) else { continue };
            let (seconds, felled) = play_the_deal(&mut room);
            let shown = seconds.map_or("not done".to_owned(), |seconds| format!("{seconds:.0}"));
            eprintln!("| {key} | {} | {felled} | {shown} | week {week} zone {} |", zone.depth, zone.number);
            measured.push((key, seconds, felled));
        }
    }
    let done: Vec<&(String, Option<f64>, usize)> =
        measured.iter().filter(|(_, seconds, _)| seconds.is_some()).collect();
    let (seconds, foes) =
        done.iter().fold((0.0, 0), |(seconds, foes), (_, took, felled)| (seconds + took.unwrap_or(0.0), foes + felled));
    // Each deal's mean, weighed as the web deals it: a lamp's zone one in five, the rest by `web::DEALS`, a vault's
    // half going to a skirmish above ground.
    // A deal with no zone done is left out of the weighing, the rest weighed up to the whole.
    let mean = |prefix: &str| {
        let of: Vec<f64> =
            done.iter().filter(|(key, ..)| key.starts_with(prefix)).filter_map(|(_, took, _)| *took).collect();
        (!of.is_empty()).then(|| of.iter().sum::<f64>() / of.len() as f64)
    };
    let dealt = [("Skirmish", 0.35), ("Mission", 0.35), ("Vault", 0.05), ("Vein", 0.12), ("Reliquary", 0.13)];
    let weighed: Vec<(f64, f64)> =
        dealt.iter().filter_map(|(prefix, share)| mean(prefix).map(|took| (took, *share))).collect();
    let others = weighed.iter().map(|(took, share)| took * share).sum::<f64>()
        / weighed.iter().map(|(_, share)| share).sum::<f64>().max(1e-9);
    let zone = 0.8 * others + 0.2 * mean("Lamp").unwrap_or(others);
    eprintln!(
        "Zones {}, {} not done; a zone {zone:.0} s as dealt; {foes} foes felled, {:.1} s a foe; {:.1} foes a zone",
        measured.len(),
        measured.len() - done.len(),
        seconds / foes.max(1) as f64,
        foes as f64 / done.len().max(1) as f64
    );
}
