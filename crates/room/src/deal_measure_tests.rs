//! The time one player takes over each passage zone's deal, measured for the band (`gear::band::PASSAGE_SECONDS`):
//! the scripted player of `band_measure_tests` (a level 1 player with the starting sword, every foe at its level,
//! held whole) plays the deal to done as a player would: a Kindle's dead lamps held once no foe is near, a Hold's
//! ring stood in, a Gauntlet's far mouth walked to, every other deal's foes brought down. Run by hand, in release:
//! `cargo test -p room --release measure_the_deals -- --ignored --nocapture`.

use super::band_measure_tests::level_one;
use super::*;
use crate::passages::PassageAsk;
use combat::arms::Stroke;
use combat::{CombatInput, Intent};
use movement::Controls;
use passage::{Deal, Mission, PieceKind, Plan, Web};

const SWORD: u32 = 2;
/// The longest one deal is let run: half an hour.
const LONGEST_TICKS: u32 = 60 * 1_800;
/// How near the player comes before swinging, how near a foe is fought before a dead lamp is held or a ring kept,
/// and how near a dead lamp the player stands to hold it (m); how often the way is found again (ticks).
const REACH_M: f64 = 1.6;
const NEAR_M: f64 = 10.0;
const AT_PIECE_M: f64 = 2.8;
const REPATH_TICKS: u32 = 15;
/// A foe out of the scripted player's reach this long, neither neared nor harmed, is felled by hand so the deal can be
/// done, and its time is not counted (ticks).
const GIVE_UP_TICKS: u32 = 60 * 20;

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
/// not done in half an hour.
fn play_the_deal(room: &mut Room) -> (Option<f64>, usize) {
    level_one(room);
    let player = room.join().expect("a room with space");
    let mut felled = std::collections::BTreeSet::new();
    let (mut way, mut ticks, mut stalled): (Vec<[f64; 3]>, u32, u32) = (Vec::new(), 0, 0);
    let mut chased: Option<(FighterId, f64, f64, u32)> = None;
    while ticks < LONGEST_TICKS {
        if room.zone().is_some_and(|zone| zone.round.done_at.is_some()) {
            return (Some(f64::from(ticks - stalled) / 60.0), felled.len());
        }
        level_one(room);
        let me = *room.fighter(player).expect("in");
        room.set_fighter(player, combat::fighter::Fighter { health: me.health_max, ..me });
        let holding = room.zone().is_some_and(|zone| zone.holds.contains_key(&player));
        let near = |foe: &Foe| libm::hypot(foe.fighter.body.x - me.body.x, foe.fighter.body.y - me.body.y);
        let alive = room.foes.iter().filter(|(_, foe)| !foe.fighter.dead());
        let nearest =
            alive.min_by(|one, two| near(one.1).total_cmp(&near(two.1))).map(|(id, foe)| (*id, near(foe), foe));
        let goal = objective(room);
        // A Hold's ring is kept: only a foe within a blow is fought from inside it.
        let ring = room.zone().is_some_and(|zone| zone.zone.deal == Deal::Mission(Mission::Hold));
        let in_ring = goal.is_some_and(|(at, _)| libm::hypot(at[0] - me.body.x, at[1] - me.body.y) < 3.0);
        let fight = nearest.filter(|(_, apart, _)| match (goal, ring) {
            (None, _) => true,
            (Some(_), true) => in_ring && *apart < REACH_M + 1.0,
            (Some(_), false) => *apart < NEAR_M,
        });
        let (there, apart, swing) = match (fight, goal) {
            _ if holding => ([me.body.x, me.body.y, me.body.z], 0.0, false),
            (Some((id, apart, foe)), _) => {
                let health = foe.fighter.health;
                match chased {
                    Some((was, best, least, _)) if was == id && (apart + 0.3 < best || health + 0.01 < least) => {
                        chased = Some((id, apart.min(best), health.min(least), ticks));
                    }
                    Some((was, .., since)) if was == id && ticks - since > GIVE_UP_TICKS => {
                        if let Some(foe) = room.foes.get_mut(&id) {
                            (foe.fighter.health, foe.fighter.action) =
                                (0.0, combat::fighter::Action::Dead { elapsed: 0 });
                        }
                        stalled += GIVE_UP_TICKS;
                        chased = None;
                        continue;
                    }
                    Some((was, ..)) if was == id => {}
                    _ => chased = Some((id, apart, health, ticks)),
                }
                ([foe.fighter.body.x, foe.fighter.body.y, foe.fighter.body.z], apart, true)
            }
            (None, Some((at, kindle))) => {
                let apart = libm::hypot(at[0] - me.body.x, at[1] - me.body.y);
                if let Some(nth) = kindle.filter(|_| apart <= AT_PIECE_M) {
                    room.ask_passage(player, PassageAsk::Kindle { lamp: nth });
                }
                // Walked to where the navmesh comes nearest it.
                let ground = [at[0], at[1], movement::Terrain::height_at(&room.floor, at[0], at[1])];
                (room.mesh_at(ground).nearest_point(ground).unwrap_or(ground), apart, false)
            }
            (None, None) => ([me.body.x, me.body.y, me.body.z], 0.0, false),
        };
        if ticks % REPATH_TICKS == 0 {
            way = room.mesh_at(there).find_path([me.body.x, me.body.y, me.body.z], there).unwrap_or_default();
        }
        while way.first().is_some_and(|point| libm::hypot(point[0] - me.body.x, point[1] - me.body.y) < 1.0) {
            way.remove(0);
        }
        let toward = way.first().copied().filter(|_| apart > 3.0).unwrap_or(there);
        let stop = match (swing, goal) {
            (true, _) => REACH_M,
            (false, Some((_, Some(_)))) => AT_PIECE_M,
            (false, _) => 1.0,
        };
        let attack = (swing && ticks % 30 == 0 && apart < REACH_M + 1.0).then_some(Stroke::Down);
        let yaw = combat::sight::bearing([me.body.x, me.body.y], [toward[0], toward[1]]);
        let forward = if apart > stop && !holding { 1.0 } else { 0.0 };
        let input = Input {
            sequence: ticks + 1,
            intent: Intent {
                controls: Controls { yaw, forward, ..Controls::default() },
                combat: CombatInput { attack, ..CombatInput::default() },
            },
            arms: SWORD,
            seen: room.clock(),
            ..Input::default()
        };
        room.input(player, input).expect("in order");
        room.tick();
        ticks += 1;
        felled.extend(room.foes.iter().filter(|(_, foe)| foe.fighter.dead()).map(|(id, _)| *id));
    }
    let me = room.fighter(player).map(|fighter| [fighter.body.x, fighter.body.y]).unwrap_or_default();
    let short = objective(room).map(|(at, _)| libm::hypot(at[0] - me[0], at[1] - me[1]));
    eprintln!("not done: the objective {short:?} m off, {} foes standing", room.living_foes());
    (None, room.living_foes())
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_the_deals() {
    eprintln!("| Deal | Depth | Foes felled | Seconds |");
    let island = passage::island("continent-1").expect("Saltmere's passages");
    let mut measured: Vec<(String, f64)> = Vec::new();
    for week in 2_900..2_906 {
        let web = Web::of(island, week);
        for zone in &web.zones {
            let deal = format!("{:?}", zone.deal);
            let lamp = passage::lamp_number(zone.depth);
            let key = lamp.map_or(deal.clone(), |number| format!("{deal} {number}"));
            if measured.iter().filter(|(seen, _)| *seen == key).count() >= 3 {
                continue;
            }
            let Some(plan) = Plan::of(&web, zone.number) else { continue };
            let modifiers = gear::passages::week_modifiers("continent-1", week);
            let route = ("continent-1", week, gear::dive::Route::Company);
            let Some(mut room) = Room::passage(&plan, (1, 4), modifiers, route) else { continue };
            let (seconds, felled) = play_the_deal(&mut room);
            let shown = seconds.map_or("not done".to_owned(), |seconds| format!("{seconds:.0}"));
            eprintln!("| {key} | {} | {felled} | {shown} |", zone.depth);
            measured.push((key, seconds.unwrap_or(1_800.0)));
        }
    }
    let all: Vec<f64> = measured.iter().map(|(_, seconds)| *seconds).collect();
    eprintln!("Zones {}, mean {:.0} s", all.len(), all.iter().sum::<f64>() / all.len().max(1) as f64);
}
