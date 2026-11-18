use super::*;
use crate::captain::{Mode, Temper};
use crate::damage::Hurt;
use crate::gunnery::reload_seconds;
use crate::guns::SWIVEL;
use crate::ranks::{GREY_TITHE, PIRATES, Rank};
use crate::shots::ShotEvent;
use sailing::waters::Spot;

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [1.5, 0.0];
const FIRST: ShipId = 1;
const SECOND: ShipId = 2;

fn sloop_at(x: f64, y: f64) -> Ship {
    Ship { x, y, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: SAILS_SET }
}

/// Two captains 400 m apart abeam, both heading north under sail and bold: the first of `first`, the second of
/// `second`.
fn two_captains(first: Commission, second: Commission) -> Fight {
    let mut fight = Fight::new(5);
    fight.enlist(FIRST, sloop_at(0.0, 0.0), first, 11, &Open, 0.0);
    fight.enlist(SECOND, sloop_at(400.0, 0.0), second, 12, &Open, 0.0);
    for vessel in fight.ships.values_mut() {
        if let Sailor::Captain(command) = &mut vessel.sailor {
            command.her.temper = Temper::Bold;
        }
    }
    fight
}

fn command(fight: &Fight, id: ShipId) -> &Command {
    fight.vessel(id).and_then(Vessel::command).unwrap_or_else(|| panic!("a captain sails ship {id}"))
}

fn tick(fight: &mut Fight) -> Vec<Event> {
    let time = fight.clock;
    fight.step(&[], &Open, WIND, time)
}

fn elite(faction: u8) -> Commission {
    Commission { faction, rank: Rank::Elite }
}

#[test]
fn a_tithe_captain_and_a_pirate_take_each_other_on_and_trade_broadsides_with_no_player_near() {
    let mut fight = two_captains(elite(GREY_TITHE), elite(PIRATES));
    tick(&mut fight);
    for (id, other) in [(FIRST, SECOND), (SECOND, FIRST)] {
        let her = &command(&fight, id).her;
        assert_eq!((her.target(), her.mode), (Some(other), Mode::Engage), "ship {id} marks the other faction's");
    }
    let mut struck = [false; 2];
    for _ in 0..180 * 60 {
        for event in tick(&mut fight) {
            if let Event::Shot(ShotEvent::Hit { shooter, target, .. }) = event {
                struck[usize::from(target == FIRST)] |= shooter != target;
            }
        }
        if struck == [true; 2] {
            break;
        }
    }
    assert_eq!(struck, [true; 2], "each strikes the other within three minutes");
}

#[test]
fn two_captains_of_one_faction_never_take_each_other_on() {
    for faction in [GREY_TITHE, PIRATES] {
        let mut fight = two_captains(elite(faction), elite(faction));
        // A player far off keeps them in the fight, out of their sight.
        fight.put_to_sea(9, Ship { y: 1_600.0, rung: 0, ..sloop_at(200.0, 0.0) }, &Open, 0.0);
        for _ in 0..30 * 60 {
            let events = tick(&mut fight);
            assert!(!events.iter().any(|event| matches!(event, Event::Shot(ShotEvent::Hit { .. }))));
            for id in [FIRST, SECOND] {
                let her = &command(&fight, id).her;
                assert_eq!((her.target(), her.mode), (None, Mode::Cruise), "faction {faction}, ship {id}");
            }
        }
    }
}

#[test]
fn her_rank_sets_her_hull_arms_her_volley_and_paces_her_reload() {
    for rank in Rank::ALL {
        let fight = two_captains(Commission { faction: GREY_TITHE, rank }, elite(PIRATES));
        let hull = fight.vessel(FIRST).map(|vessel| vessel.damage.max_hull);
        assert_eq!(hull, Some(264.0 * rank.scale().hull), "{rank:?}");
    }
    let minor = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let mut fight = two_captains(minor, elite(PIRATES));
    for _ in 0..180 * 60 {
        tick(&mut fight);
        let Some(ball) = fight.balls.iter().find(|ball| ball.shooter == FIRST) else { continue };
        assert_eq!(ball.flag, Flag::Faction(GREY_TITHE));
        assert_eq!([ball.gun.hull, ball.gun.yaw_spread_deg], [SWIVEL.hull * 0.9, SWIVEL.yaw_spread_deg * 1.3]);
        let Some(vessel) = fight.vessel(FIRST) else { panic!("she fired") };
        let crew_share = vessel.damage.crew_share();
        let left = vessel.guns.left(Side::Port).max(vessel.guns.left(Side::Starboard));
        assert_eq!(left, reload_seconds(&SWIVEL, crew_share, true) * 1.2, "a Minor's reload is 1.2 times");
        return;
    }
    panic!("the Minor never fired");
}

/// A bold captain of `rank` hulled down to `share` of her hull, a player's Sloop 200 m off her beam: her state, and
/// her mode after a tick.
fn hulled(rank: Rank, share: f64) -> (State, Mode) {
    let mut fight = Fight::new(5);
    fight.put_to_sea(PLAYER, Ship { rung: 0, ..sloop_at(200.0, 0.0) }, &Open, 0.0);
    fight.enlist(FIRST, sloop_at(0.0, 0.0), Commission { faction: PIRATES, rank }, 11, &Open, 0.0);
    let Some(vessel) = fight.ships.get_mut(&FIRST) else { panic!("her ship") };
    if let Sailor::Captain(command) = &mut vessel.sailor {
        command.her.temper = Temper::Bold;
    }
    let hull = vessel.damage.max_hull - (vessel.damage.max_hull * share).floor();
    vessel.damage.apply(Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    tick(&mut fight);
    let Some(vessel) = fight.vessel(FIRST) else { panic!("her ship") };
    (vessel.damage.state, command(&fight, FIRST).her.mode)
}

#[test]
fn each_rank_runs_and_strikes_at_its_own_share_of_her_hull() {
    let (afloat, struck) = (State::Afloat, State::Struck);
    let table = [
        (Rank::Major, 0.26, (afloat, Mode::Flee)),
        (Rank::Major, 0.24, (struck, Mode::Struck)),
        (Rank::Elite, 0.21, (afloat, Mode::Flee)),
        (Rank::Elite, 0.19, (struck, Mode::Struck)),
        (Rank::Miniboss, 0.16, (afloat, Mode::Engage)),
        (Rank::Miniboss, 0.14, (afloat, Mode::Flee)),
        (Rank::Miniboss, 0.09, (struck, Mode::Struck)),
        (Rank::Boss, 0.06, (afloat, Mode::Engage)),
        (Rank::Boss, 0.04, (struck, Mode::Struck)),
    ];
    for (rank, share, wanted) in table {
        assert_eq!(hulled(rank, share), wanted, "{rank:?} at {share}");
    }
}
