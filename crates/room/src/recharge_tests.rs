//! Healing charges in the room: a player's blow fills their meter by the share of its foe's most health it took,
//! weighed by the foe's rank, and a kill by its rank's share; a full meter is a charge, none past three; a player joins
//! and stands again with all three; and their drink's heal is told.

use super::*;
use crate::judging::How;
use crate::recharge::{DEALT_SHARE, kill_share};
use ::foes::Rank;
use combat::judge::{Blow, BlowKind};
use combat::tuning::CHARGES;
use combat::{CombatInput, Intent, Stroke};
use std::collections::BTreeMap;

/// A foe of the roster's type `number` at `rank`, put straight into the room 1.5 m north of the origin.
fn stand(room: &mut Room, number: u8, rank: Rank) -> FighterId {
    let id = room.next_id();
    let foe_type = ::foes::foe_type(number).expect("a type of the roster");
    let (fighter, brain) = ::foes::spawn(foe_type, rank, 0.0, -1.5, core::f64::consts::PI);
    assert_eq!(brain.rank, rank, "the type comes in that rank");
    room.foes
        .insert(id, foes::Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

/// A room with one player in it, holding `charges` and their meter at `meter`.
fn holding(charges: u8, meter: f64) -> (Room, PlayerId) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.charges, found.fighter.meter) = (charges, meter);
    (room, player)
}

/// The player's blow on `foe`, landing for `damage`.
fn strike(room: &mut Room, player: PlayerId, foe: FighterId, damage: f64) {
    let blow = Blow {
        striker: player,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage,
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
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage, poise: 0.0 }, None);
}

fn charges(room: &Room, player: PlayerId) -> (u8, f64) {
    let fighter = room.fighter(player).expect("in");
    (fighter.charges, fighter.meter)
}

#[test]
fn a_hit_fills_the_meter_by_its_share_of_the_foes_health_weighed_by_its_rank() {
    let (mut room, player) = holding(0, 0.0);
    let minor = stand(&mut room, ::foes::roster::COLLECTOR, Rank::Minor);
    let most = room.fighter(minor).expect("standing").health_max;
    strike(&mut room, player, minor, most / 2.0);
    let (_, meter) = charges(&room, player);
    assert!((meter - kill_share(Rank::Minor) * DEALT_SHARE / 2.0).abs() < 1e-12, "a twelfth of a charge: {meter}");
    let elite = stand(&mut room, ::foes::roster::ENFORCER, Rank::Elite);
    let most = room.fighter(elite).expect("standing").health_max;
    strike(&mut room, player, elite, most / 10.0);
    let (_, after) = charges(&room, player);
    assert!((after - meter - kill_share(Rank::Elite) * DEALT_SHARE / 10.0).abs() < 1e-12, "an Elite's weighs more");
}

#[test]
fn a_kill_adds_its_ranks_share_so_a_minor_fought_whole_gives_half_a_charge_and_a_boss_more_than_one() {
    assert_eq!(
        [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss].map(kill_share),
        [1.0 / 3.0, 1.0 / 3.0, 2.0 / 3.0, 2.0 / 3.0, 1.0]
    );
    for (number, rank, after) in [
        (::foes::roster::COLLECTOR, Rank::Minor, (0, 0.5)),
        (::foes::roster::ENFORCER, Rank::Elite, (1, 0.0)),
        (::foes::roster::HIGH_ASSESSOR, Rank::Boss, (1, 0.5)),
    ] {
        let (mut room, player) = holding(0, 0.0);
        let foe = stand(&mut room, number, rank);
        let whole = room.fighter(foe).expect("standing").health;
        strike(&mut room, player, foe, whole);
        assert!(room.fighter(foe).expect("lying").dead());
        let (held, meter) = charges(&room, player);
        assert!(held == after.0 && (meter - after.1).abs() < 1e-12, "{rank:?}: {held} and {meter}");
    }
}

#[test]
fn a_full_meter_is_a_charge_none_past_three_and_the_meter_stops_while_all_three_are_full() {
    let (mut room, player) = holding(CHARGES - 1, 0.96);
    let boss = stand(&mut room, ::foes::roster::HIGH_ASSESSOR, Rank::Boss);
    // A tenth of a Boss's health gives a twentieth of a charge.
    let tenth = room.fighter(boss).expect("standing").health_max / 10.0;
    strike(&mut room, player, boss, tenth);
    assert_eq!(charges(&room, player).0, CHARGES);
    strike(&mut room, player, boss, 1000.0);
    assert_eq!(charges(&room, player), (CHARGES, 0.0));
}

#[test]
fn a_player_joins_and_stands_again_with_every_charge_full() {
    let (mut room, player) = holding(0, 0.4);
    let fresh = room.join().expect("a room with space");
    assert_eq!(charges(&room, fresh), (CHARGES, 0.0), "a player comes into a room with all three");
    let found = room.players.get_mut(&player).expect("in");
    (found.fighter.health, found.fighter.action) = (0.0, Action::Dead { elapsed: RESPAWN });
    room.tick();
    assert!(!room.fighter(player).expect("in").dead());
    assert_eq!(charges(&room, player), (CHARGES, 0.0), "and stands again with them");
}

#[test]
fn a_players_drink_heals_them_and_the_room_tells_it() {
    let (mut room, player) = holding(CHARGES, 0.0);
    room.players.get_mut(&player).expect("in").fighter.health = 50.0;
    for sequence in 1..=combat::tuning::DRINK_TICKS + 2 {
        let combat = CombatInput { heal: sequence == 1, ..CombatInput::default() };
        let input =
            Input { sequence, intent: Intent { combat, ..Intent::default() }, seen: room.clock(), ..Input::default() };
        room.input(player, input).expect("taken");
        room.tick();
    }
    let healed = room.take_events().into_iter().find(|event| event.kind == EventKind::Healed).expect("told");
    assert_eq!((healed.striker, healed.defender, healed.amount), (player, player, 40.0));
    let fighter = room.fighter(player).expect("in");
    assert_eq!((fighter.health, fighter.charges), (90.0, CHARGES - 1));
}
