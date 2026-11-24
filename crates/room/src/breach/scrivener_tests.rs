//! The Scrivener's ward against every way a blow could reach it: no blow, however heavy, fells it while warded.

use super::breach_tests::breach;
use super::fights_tests::{begin_at, won_to};
use super::*;
use crate::How;

/// The Choir running and its Scrivener woken, standing warded at `share` of its health.
fn warded_at(share: f64) -> (Room, Vec<PlayerId>, FighterId) {
    let (mut room, players) = won_to(Tier::Normal, 2, CHOIR);
    begin_at(&mut room, &players, "choir", "lectern-2");
    let mut breach_box = room.breach.take().expect("run");
    breach_box.fights.choir.round = choir::ROUNDS.len() - 1;
    breach_box.fights.choir.round_from = room.clock + 1_000_000;
    let mut fight = std::mem::take(&mut breach_box.fights.choir);
    room.wake_scrivener(&mut breach_box, &mut fight);
    let scrivener = fight.scrivener.expect("it stands");
    let foe = room.foes.get_mut(&scrivener).expect("it");
    foe.fighter.health = foe.fighter.health_max * share;
    fight.warded = Some(foe.fighter.health);
    breach_box.fights.choir = fight;
    room.breach = Some(breach_box);
    (room, players, scrivener)
}

#[test]
fn a_blow_heavier_than_all_its_health_never_fells_the_warded_scrivener() {
    let (mut room, players, scrivener) = warded_at(0.05);
    let held = room.foes[&scrivener].fighter.health;
    let blow = combat::Blow {
        striker: players[0],
        kind: combat::BlowKind::Swing(combat::Stroke::Down),
        from: [0.0, 0.0],
        damage: 1.0e6,
        poise: 0.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    };
    room.settle(&blow, How::Swing, scrivener, combat::Verdict::Hit { damage: 1.0e6, poise: 0.0 }, None);
    room.tick();
    let foe = &room.foes[&scrivener].fighter;
    assert!(!foe.dead(), "warded, it stands");
    assert!((foe.health - held).abs() < 1e-9, "and holds what it had: {} of {held}", foe.health);
    assert!(matches!(breach(&room).phases[CHOIR], Phase::Running(_)), "the Choir is not won");
}
