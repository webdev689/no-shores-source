//! The time one player, and a company of four, takes over each passage zone's deal, measured for the band
//! (`gear::band::PASSAGE_SECONDS`): the scripted player of `band_measure_tests` (a level 1 player with the starting
//! sword, every foe at its level, held whole, its way found on the navmesh or else on foot) plays the deal to done as
//! a player would: a Kindle's dead lamps held and a reliquary opened once no foe is near, a vein's nodes gathered, a
//! Hold's ring stood in, a Gauntlet's far mouth walked to, every other deal's foes brought down, none by hand. Run by
//! hand, in release:
//! `cargo test -p room --release measure_the_deals -- --ignored --nocapture`.

use super::band_measure_tests::{REACH_M, Walker, level_one};
use super::*;
use crate::passages::PassageAsk;
use passage::{Deal, Mission, PieceKind, Plan, Web};

/// The longest one deal is let run: half an hour.
const LONGEST_TICKS: u32 = 60 * 1_800;
/// How near a foe is fought before a dead lamp is held or a ring kept, and how near a dead lamp the player stands to
/// hold it (m).
const NEAR_M: f64 = 10.0;
const AT_PIECE_M: f64 = 2.8;
/// How near a node the player stands to gather it, inside the room's reach of one (`asks::NODE_REACH`).
const AT_NODE_M: f64 = 2.0;

/// What the deal sends a player to before its foes: a dead lamp to kindle, a reliquary to open or a node to gather.
#[derive(Clone, Copy, PartialEq)]
enum Use {
    Kindle(u8),
    Open,
    Gather(u8),
}

/// Where the deal sends a player before its foes: the next dead lamp unlit, the ring, the far mouth, the reliquary,
/// the nearest node not yet gathered.
fn objective(room: &Room, me: [f64; 2]) -> Option<([f64; 2], Option<Use>)> {
    let zone = room.zone()?;
    let round = &zone.round;
    match zone.zone.deal {
        Deal::Mission(Mission::Kindle) => zone.pieces.iter().find_map(|piece| match piece.kind {
            PieceKind::Kindle(nth) if round.lit.get(usize::from(nth)) == Some(&false) => {
                Some(([piece.at[0], piece.at[1]], Some(Use::Kindle(nth))))
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
        Deal::Reliquary => zone
            .pieces
            .iter()
            .find(|piece| piece.kind == PieceKind::Reliquary)
            .map(|piece| ([piece.at[0], piece.at[1]], Some(Use::Open))),
        Deal::Vein => {
            let away = |at: [f64; 2]| libm::hypot(at[0] - me[0], at[1] - me[1]);
            let left = (0..).zip(&room.resource_nodes).filter(|(nth, _)| !round.gathered.contains(nth));
            let nearest = left.min_by(|one, two| away([one.1.x, one.1.y]).total_cmp(&away([two.1.x, two.1.y])));
            nearest.map(|(nth, node)| ([node.x, node.y], Some(Use::Gather(nth))))
        }
        _ => None,
    }
}

/// One walker's tick: holding still while it holds E or gathers, else fighting the nearest foe near enough, else
/// making for the deal's objective and using it there, else waiting.
fn play_one(room: &mut Room, walker: &mut Walker) {
    let player = walker.player;
    let me = *room.fighter(player).expect("in");
    let here = [me.body.x, me.body.y, me.body.z];
    let holding = room.zone().is_some_and(|zone| zone.holds.contains_key(&player))
        || room.players.get(&player).is_some_and(|found| found.gathering.is_some());
    let near = |foe: &Foe| libm::hypot(foe.fighter.body.x - me.body.x, foe.fighter.body.y - me.body.y);
    let alive = room.foes.values().filter(|foe| !foe.fighter.dead());
    let nearest = alive.min_by(|one, two| near(one).total_cmp(&near(two))).map(|foe| (near(foe), foe));
    let goal = objective(room, [me.body.x, me.body.y]);
    // A Hold's ring is kept: only a foe within a blow is fought from inside it.
    let ring = room.zone().is_some_and(|zone| zone.zone.deal == Deal::Mission(Mission::Hold));
    let in_ring = goal.is_some_and(|(at, _)| libm::hypot(at[0] - me.body.x, at[1] - me.body.y) < 3.0);
    let fight = nearest.filter(|(apart, _)| match (goal, ring) {
        (None, _) => true,
        (Some(_), true) => in_ring && *apart < REACH_M + 1.0,
        (Some(_), false) => *apart < NEAR_M,
    });
    match (fight, goal) {
        _ if holding => walker.steer(room, here, f64::MAX, false),
        (Some((_, foe)), _) => {
            let there = [foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z];
            walker.steer(room, there, REACH_M, true);
        }
        (None, Some((at, used))) => {
            let apart = libm::hypot(at[0] - me.body.x, at[1] - me.body.y);
            let stop = if matches!(used, Some(Use::Gather(_))) { AT_NODE_M } else { AT_PIECE_M };
            match used.filter(|_| apart <= stop) {
                Some(Use::Kindle(nth)) => drop(room.ask_passage(player, PassageAsk::Kindle { lamp: nth })),
                Some(Use::Open) => drop(room.ask_passage(player, PassageAsk::Open)),
                Some(Use::Gather(node)) => room.answer(player, crate::asks::Asked::Gather { node }),
                None => {}
            }
            let there = [at[0], at[1], movement::Terrain::height_at(&room.floor, at[0], at[1])];
            walker.steer(room, there, if used.is_some() { stop } else { 1.0 }, false);
        }
        (None, None) => walker.steer(room, here, f64::MAX, false),
    }
}

/// Plays a zone's deal to done with a company of `players`: the seconds it took and the foes felled; none, and the
/// foes still standing, if it was not done in half an hour. No foe is felled but by the players' blows.
fn play_the_deal(room: &mut Room, plan: &Plan, players: usize) -> (Option<f64>, usize) {
    level_one(room);
    let mut walkers: Vec<Walker> = (0..players).map(|_| Walker::into(room, Some(plan.walk()))).collect();
    // Each on a dive of the zone, as a player is, whom a Gauntlet's far mouth counts.
    let week = room.zone().map_or(0, |zone| zone.week);
    for walker in &walkers {
        let start = gear::dive::Start {
            island: "continent-1",
            week,
            route: gear::dive::Route::Company,
            mouth: 0,
            zone: plan.zone.number,
            depth: plan.zone.depth,
            lamp: None,
            seas: gear::Difficulty::Normal,
        };
        let found = room.players.get_mut(&walker.player).expect("in");
        found.character.begin_dive(&start).expect("begun");
        if let Some(dive) = found.character.passage.as_mut() {
            dive.here = true;
        }
    }
    let mut felled = std::collections::BTreeSet::new();
    let mut ticks = 0;
    while ticks < LONGEST_TICKS {
        if room.zone().is_some_and(|zone| zone.round.done_at.is_some()) {
            return (Some(f64::from(ticks) / 60.0), felled.len());
        }
        level_one(room);
        for walker in &mut walkers {
            play_one(room, walker);
        }
        room.tick();
        ticks += 1;
        felled.extend(room.foes.iter().filter(|(_, foe)| foe.fighter.dead()).map(|(id, _)| *id));
    }
    let me = room.fighter(walkers[0].player).map(|fighter| [fighter.body.x, fighter.body.y]).unwrap_or_default();
    let short = objective(room, me).map(|(at, _)| libm::hypot(at[0] - me[0], at[1] - me[1]));
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
    // One player alone, and a company of four.
    for players in [1, 4] {
        measure_with(players);
    }
}

fn measure_with(players: usize) {
    eprintln!("A company of {players}:");
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
            let (seconds, felled) = play_the_deal(&mut room, &plan, players);
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

#[test]
#[ignore = "one zone's deal, by hand: TRACE_WEEK and TRACE_ZONE"]
fn play_one_deal() {
    let island = passage::island("continent-1").expect("Saltmere's passages");
    let week: u64 = std::env::var("TRACE_WEEK").ok().and_then(|week| week.parse().ok()).unwrap_or(2_900);
    let number: u16 = std::env::var("TRACE_ZONE").ok().and_then(|zone| zone.parse().ok()).unwrap_or(0);
    let web = Web::of(island, week);
    let plan = Plan::of(&web, number).expect("a plan");
    let modifiers = gear::passages::week_modifiers("continent-1", week);
    let route = ("continent-1", week, gear::dive::Route::Company);
    let mut room = Room::passage(&plan, (1, 4), modifiers, route).expect("a room");
    eprintln!("{:?}", play_the_deal(&mut room, &plan, 1));
}
