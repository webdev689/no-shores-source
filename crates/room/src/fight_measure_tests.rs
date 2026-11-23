//! The sea's fights measured: a plain player in the starting Sloop against one bold captain of each rank, met 700 m
//! off in each kind of hostile water of the world's own layout, the player either standing off (turning their
//! broadside at 300 m out) or closing to 150 m before they turn. Run by hand, in release, to print the table:
//! `cargo test -p room --release measure_fights -- --ignored --nocapture --test-threads=1`.

use super::*;
use crate::measure_tests::world;
use naval::captain::course::{distance, heading_to, wrap};
use naval::damage::State;
use naval::fight::{Aim, Fight, Sailor};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use naval::shots::ShipId;
use sailing::ship::{Helm, SAILS_SET};
use world::waters::Holder;

const TICKS_A_SECOND: u64 = 60;
const FIGHTS_A_ROW: usize = 12;
/// The level table's rows are half as many fights, as it has twice the rows.
const FIGHTS_A_LEVEL: usize = 6;
const LONGEST_S: f64 = 900.0;

fn struck(vessel: &naval::fight::Vessel) -> bool {
    vessel.command().is_some_and(|command| command.struck_at.is_some())
}

fn going_down(vessel: &naval::fight::Vessel) -> bool {
    matches!(vessel.damage.state, State::Sinking | State::Sunk)
}

/// A plain player: sails set, the nearest fighting captain kept on their beam from `close` m in (60 degrees off their
/// bow from 100 m farther), a laid broadside fired every quarter second it bears within 260 m, braced when none bears
/// within 400 m.
pub(crate) fn plain_orders(fight: &Fight, me: ShipId, tick: u64, close: f64) -> Orders {
    let Some(mine) = fight.vessel(me) else { return QUIET };
    let at = [mine.ship.x, mine.ship.y];
    let target = fight
        .ships
        .iter()
        .filter(|(id, vessel)| {
            **id != me
                && matches!(vessel.sailor, Sailor::Captain(_))
                && vessel.in_fight()
                && !struck(vessel)
                && !going_down(vessel)
        })
        .map(|(_, vessel)| vessel)
        .min_by(|one, other| {
            distance(at, [one.ship.x, one.ship.y]).total_cmp(&distance(at, [other.ship.x, other.ship.y]))
        });
    let climb = i8::from(mine.ship.rung < SAILS_SET && tick.is_multiple_of(20));
    let Some(target) = target else {
        return Orders { helm: Helm { steer: 0.0, climb }, ..QUIET };
    };
    let there = [target.ship.x, target.ship.y];
    let off = wrap(heading_to(at, there) - mine.ship.heading);
    let range = distance(at, there);
    let side = if off >= 0.0 { 1.0 } else { -1.0 };
    let want_deg: f64 = if range > close {
        0.0
    } else if range > close - 100.0 {
        60.0
    } else if range < 60.0 {
        110.0
    } else {
        90.0
    };
    let steer = ((off - side * want_deg.to_radians()) / 30_f64.to_radians()).clamp(-1.0, 1.0);
    let aim = Aim { bearing_deg: off.to_degrees(), range_m: range, ray: None };
    let laid = fight.laid(me, &aim).is_some();
    let fire = laid && range < 260.0 && tick.is_multiple_of(15);
    let brace = !laid && range < 400.0;
    Orders { helm: Helm { steer, climb }, aim: Some(aim), fire, brace, load: None, boost: false }
}

/// How one fight went: whether the player won (the captain struck or went down), was sunk, or neither within
/// `LONGEST_S`; its length; and the share of their hull the player kept.
struct Fought {
    won: bool,
    sunk: bool,
    seconds: f64,
    hull_kept: f64,
}

/// Steps a player's fight with the plain player's orders until it ends, or `LONGEST_S`.
fn fight_out(sea: &mut Sea, player: PlayerId, close: f64) -> Fought {
    let start = sea.clock;
    let (mut won, mut sunk, mut tick) = (false, false, 0);
    while sea.fights.fighting(player) && ((sea.clock - start) as f64) < LONGEST_S * TICKS_A_SECOND as f64 {
        tick += 1;
        if let Some((fought, crew)) = sea.fights.of_mut(player) {
            for vessel in fought.fight.ships.values() {
                if matches!(vessel.sailor, Sailor::Captain(_)) {
                    won |= struck(vessel) || going_down(vessel);
                }
            }
            sunk |= fought.fight.vessel(crew.ship).is_some_and(going_down);
            let orders = plain_orders(&fought.fight, crew.ship, tick, close);
            let _ = sea.orders(player, orders);
        }
        sea.tick();
    }
    let seconds = (sea.clock - start) as f64 / TICKS_A_SECOND as f64;
    let hull_kept = sea.berths.get(&player).map_or(1.0, |berth| berth.kept[0]);
    Fought { won: won && !sunk, sunk, seconds, hull_kept }
}

/// Points of hostile sea, one in each stretch of water 60 km apart, open 700 m north.
pub(crate) fn hostile_points(sea: &Sea) -> Vec<[f64; 2]> {
    let mut chosen: Vec<[f64; 2]> = Vec::new();
    let mut y = 40_000.0;
    while y < FRAME_HEIGHT_M as f64 {
        let mut x = 40_000.0;
        while x < FRAME_WIDTH_M as f64 {
            let centre = [x, y];
            x += 37_000.0;
            let Some((water, _)) = sea.chart.water(centre) else { continue };
            let north = [centre[0], centre[1] - 700.0];
            let open = |at: [f64; 2]| whole(&at).is_some_and(|point| !on_land(&sea.coasts, point));
            if water.holder == Holder::Home || !open(centre) || !open(north) || sea.chart.water(north).is_none() {
                continue;
            }
            if chosen.iter().all(|other| distance(*other, centre) > 60_000.0) {
                chosen.push(centre);
            }
        }
        y += 41_000.0;
    }
    chosen
}

/// One row of the table: `fights` fights with bold captains of `rank` at `level`, the player turning at `close`.
fn row(rank: Rank, level: u8, close: f64, fights: usize) -> String {
    let (layout, ports) = world();
    let points = hostile_points(&Sea::new(&layout, crate::deck::test_deck(), 1, &ports));
    let commission = Commission { faction: GREY_TITHE, rank };
    let mut seeds = (0x1000u32..)
        .step_by(7919)
        .filter(|seed| matches!(naval::captain::temper_for(commission, *seed), naval::captain::Temper::Bold));
    let mut all = Vec::new();
    for run in 0..fights {
        let at = points[run % points.len()];
        let seed = seeds.next().unwrap();
        let mut sea = Sea::new(&layout, crate::deck::test_deck(), seed, &ports);
        let player = sea.join();
        sea.harbour.characters.insert(player, gear::Character::starting());
        sea.course_anywhere(player, &[at], 10).unwrap();
        let standing = Hostile::standing(1, seed, commission, [at[0], at[1] - 700.0], std::f64::consts::PI, true);
        sea.hostiles.sailing.push(Hostile { level, ..standing });
        sea.tick();
        if sea.fights.fighting(player) {
            all.push(fight_out(&mut sea, player, close));
        }
    }
    let mut lengths: Vec<f64> = all.iter().map(|fought| fought.seconds).collect();
    lengths.sort_by(f64::total_cmp);
    let afloat: Vec<f64> = all.iter().filter(|fought| !fought.sunk).map(|fought| fought.hull_kept).collect();
    let kept = if afloat.is_empty() {
        "none afloat".to_owned()
    } else {
        format!("{:.0}%", 100.0 * afloat.iter().sum::<f64>() / afloat.len() as f64)
    };
    format!(
        "{} / {} of {}, {:.0} s, {kept}",
        all.iter().filter(|fought| fought.won).count(),
        all.iter().filter(|fought| fought.sunk).count(),
        all.len(),
        lengths.get(lengths.len() / 2).copied().unwrap_or(0.0),
    )
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_fights_by_rank() {
    eprintln!("| Captain | Stand-off: won / sunk, median length, hull kept | Closing to 150 m: the same |");
    for rank in Rank::ALL {
        eprintln!("| {rank:?} | {} | {} |", row(rank, 0, 300.0, FIGHTS_A_ROW), row(rank, 0, 150.0, FIGHTS_A_ROW));
    }
}

#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_fights_by_level() {
    eprintln!("| Captain, level | Stand-off: won / sunk, median length, hull kept | Closing to 150 m: the same |");
    for rank in [Rank::Minor, Rank::Elite] {
        for level in [1, 4, 10, 19, 27] {
            let (off, close) = (row(rank, level, 300.0, FIGHTS_A_LEVEL), row(rank, level, 150.0, FIGHTS_A_LEVEL));
            eprintln!("| {rank:?} {level} | {off} | {close} |");
        }
    }
}
