//! A raised guard: no foe of any type or rank stands before one for long without trying something; walled off by it,
//! a foe steps round to its open side and strikes there, or chops at it again; a new target's guard starts it afresh;
//! and a foe in reach keeps its swing's beat while its target sways about the edge of its reach.

mod common;

use combat::fighter::Action;
use combat::{Intent, Verdict};
use common::{Room, SWORDSMAN, standing_still};
use core::f64::consts::PI;
use foes::Rank::Minor;
use foes::{ROSTER, Seen};

const PLAYER: u32 = 1;

/// A player who holds their guard up, looking at one fighter, or along a bearing of their own.
fn guarding(whom: Option<u32>, yaw: f64) -> impl FnMut(&Room, u32) -> Intent {
    move |room, me| {
        let mut intent = standing_still(whom.map_or(yaw, |whom| room.toward(me, whom)));
        intent.combat.guard = true;
        intent
    }
}

fn attacking(action: &Action) -> bool {
    matches!(action, Action::Attack(_) | Action::Telegraph(_) | Action::Draw { .. })
}

#[test]
fn no_foe_of_any_type_or_rank_stands_eight_seconds_before_a_raised_guard_without_trying_something() {
    for foe_type in &ROSTER {
        for rank in foe_type.ranks {
            let mut room = Room::new(3).player(PLAYER, 0.0, 0.0, 0.0).foe(10, foe_type.number, *rank, 0.0, -5.0, PI);
            let (mut last, mut longest, mut was) = (0, 0, false);
            for tick in 0..3600 {
                room.step(&mut guarding(Some(10), 0.0));
                let now = attacking(&room.fighter(10).action);
                if now && !was {
                    longest = longest.max(tick - last);
                    last = tick;
                }
                was = now;
            }
            longest = longest.max(3600 - last);
            assert!(longest <= 480, "{} {rank:?} stood {longest} ticks without trying", foe_type.name);
        }
    }
}

#[test]
fn a_foe_walled_off_by_a_guard_steps_round_to_its_open_side_and_strikes_there() {
    // The player's guard faces north and stays so; the swordsman comes at it from the north.
    let mut room = Room::new(5).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Minor, 0.0, -4.0, PI);
    room.run(900, &mut guarding(None, 0.0));
    let blows: Vec<bool> = room
        .verdicts
        .iter()
        .filter(|(_, by, on, _)| *by == 10 && *on == PLAYER)
        .map(|(_, _, _, verdict)| matches!(verdict, Verdict::Blocked { .. }))
        .collect();
    assert_eq!(blows.get(..3), Some(&[true, true, false][..]), "two blocked, then one from round the guard: {blows:?}");
}

/// A swordsman whose last two swings at one player were blocked turns, that one fallen, on another who guards: the
/// ticks to its first swing at the second.
fn first_swing_at_a_new_guard(blocked_before: bool) -> Option<u64> {
    let mut room =
        Room::new(3).player(2, 0.0, 1.5, 0.0).player(PLAYER, 0.6, 1.4, 0.0).foe(10, SWORDSMAN, Minor, 0.0, 0.0, PI);
    room.immortal = false;
    room.set(2, |fallen| fallen.action = Action::Dead { elapsed: 0 });
    room.set(PLAYER, |guard| (guard.action, guard.aim) = (Action::Guard { elapsed: 40, window: 12 }, -0.4));
    room.tell(10, Seen::Struck { by: 2, verdict: Verdict::Hit { damage: 1.0, poise: 1.0 } });
    if blocked_before {
        for _ in 0..2 {
            room.tell(10, Seen::Landed { on: 2, verdict: Verdict::Blocked { damage: 1.0, stamina: 1.0 } });
        }
    }
    let mut script = |room: &Room, me: u32| {
        if me == PLAYER { guarding(Some(10), 0.0)(room, me) } else { Intent::default() }
    };
    room.run(300, &mut script);
    room.swings(10).first().copied()
}

#[test]
fn a_foe_turning_on_a_new_target_meets_its_guard_afresh() {
    let fresh = first_swing_at_a_new_guard(false).expect("it swings at a fresh target");
    let carried = first_swing_at_a_new_guard(true).expect("and at one after a guard walled it off");
    assert!(fresh < 100 && carried == fresh, "the blocks it met before are forgotten: {fresh} and {carried}");
}

#[test]
fn a_foe_keeps_its_swing_s_beat_while_its_target_sways_about_the_edge_of_its_reach() {
    let mut room =
        Room::new(4).player(PLAYER, 0.0, 0.0, 0.0).foe(10, SWORDSMAN, Minor, 0.0, -1.7, PI).alert(10, PLAYER);
    let reach = 1.8;
    for tick in 0..240_u64 {
        // A fifth of a second just inside its reach, then one just outside, by turns.
        let out = if (tick / 12).is_multiple_of(2) { reach - 0.05 } else { reach + 0.05 };
        let foe = room.fighter(10).body;
        room.set(PLAYER, |player| (player.body.x, player.body.y) = (foe.x, foe.y + out));
        room.step(&mut |room: &Room, me: u32| standing_still(room.toward(me, 10)));
    }
    assert!(!room.swings(10).is_empty(), "it swings all the same");
}
