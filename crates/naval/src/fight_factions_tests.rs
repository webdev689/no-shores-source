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
        assert_eq!(hull, Some((264.0 * rank.scale().hull).round()), "{rank:?}");
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

/// The first captain of a fight with her commission changed to `commission`, nothing else.
fn recommissioned(fight: &Fight, commission: Commission) -> Fight {
    let mut changed = fight.clone();
    if let Some(Sailor::Captain(command)) = changed.ships.get_mut(&FIRST).map(|vessel| &mut vessel.sailor) {
        command.her.commission = commission;
    }
    changed
}

#[test]
fn a_captain_sizes_up_another_by_her_whole_rank_her_guns_and_reload_too() {
    let fight = two_captains(Commission { faction: GREY_TITHE, rank: Rank::Boss }, elite(PIRATES));
    let major = recommissioned(&fight, Commission { faction: GREY_TITHE, rank: Rank::Major });
    let reckoned = |fight: &Fight| fight.sightings(SECOND).iter().find(|seen| seen.id == FIRST).map(|seen| seen.power);
    let (Some(boss), Some(major)) = (reckoned(&fight), reckoned(&major)) else { panic!("she sees the other") };
    let scale = Rank::Boss.scale();
    assert_eq!((boss.might, boss.reload), (scale.might, scale.reload));
    assert_eq!(boss.hull_hp, major.hull_hp, "one hull, told apart by her guns alone");
    assert!(
        crate::captain::odds::odds(&boss, &major, &crate::arms::SLOOP_ARMS) > 1.0,
        "a Boss's guns outgun a Major's"
    );
}

#[test]
fn the_fights_fingerprint_holds_each_captains_commission_and_strike_share() {
    let fight = two_captains(elite(GREY_TITHE), elite(PIRATES));
    let other_faction = recommissioned(&fight, elite(PIRATES));
    let other_rank = recommissioned(&fight, Commission { faction: GREY_TITHE, rank: Rank::Boss });
    let mut other_strike = fight.clone();
    if let Some(vessel) = other_strike.ships.get_mut(&FIRST) {
        vessel.damage.struck_at = 0.5;
    }
    for (changed, what) in [(other_faction, "faction"), (other_rank, "rank"), (other_strike, "strike share")] {
        assert_ne!(changed.numbers(), fight.numbers(), "her {what}");
    }
}

/// Ticks a fight until a captain is no longer afloat, ten minutes at most: the one who is not, and her hull's share.
fn fought_out(fight: &mut Fight) -> Option<(ShipId, f64)> {
    for _ in 0..10 * 60 * 60 {
        tick(fight);
        let mut beaten = fight.ships.iter().filter(|(_, vessel)| vessel.damage.state != State::Afloat);
        if let Some((id, vessel)) = beaten.next() {
            return Some((*id, vessel.damage.hull_share()));
        }
    }
    None
}

#[test]
fn her_men_are_as_many_as_her_hull_makes_them_so_a_boss_outlasts_a_minor() {
    for rank in Rank::ALL {
        let build = Commission { faction: PIRATES, rank }.build();
        assert_eq!(build.crew, (10.0 * rank.scale().hull).round(), "{rank:?}");
    }
    let (boss, minor) = (Rank::Boss, Rank::Minor);
    for (first, second, beaten) in [(boss, minor, SECOND), (minor, boss, FIRST)] {
        let mut fight = two_captains(
            Commission { faction: GREY_TITHE, rank: first },
            Commission { faction: PIRATES, rank: second },
        );
        let (struck, share) = fought_out(&mut fight).expect("one gives in within ten minutes");
        assert_eq!(struck, beaten, "the Minor gives in, at {share:.2} of her hull");
        let Some(other) = fight.vessel(FIRST + SECOND - beaten) else { panic!("the Boss") };
        assert!(other.damage.fighting() && other.damage.crew_share() > 0.5, "the Boss fights on, her men mostly whole");
    }
}

#[test]
fn a_captain_of_a_higher_rank_runs_down_a_wary_one_sailing_away_at_the_same_point_of_sail() {
    // A Boss, and 400 m abeam a wary Minor cruising off south-east: at one pace, the Boss sailed beside her and gave
    // up; her rank's way brings her up.
    let mut fight = Fight::new(5);
    fight.enlist(FIRST, sloop_at(0.0, 0.0), Commission { faction: GREY_TITHE, rank: Rank::Boss }, 11, &Open, 0.0);
    let away = Ship { heading: 141f64.to_radians(), ..sloop_at(400.0, 0.0) };
    fight.enlist(SECOND, away, Commission { faction: PIRATES, rank: Rank::Minor }, 12, &Open, 0.0);
    if let Some(Sailor::Captain(command)) = fight.ships.get_mut(&SECOND).map(|vessel| &mut vessel.sailor) {
        command.her.temper = Temper::Wary;
    }
    for _ in 0..10 * 60 * 60 {
        let hit = tick(&mut fight)
            .into_iter()
            .any(|event| matches!(event, Event::Shot(ShotEvent::Hit { shooter: FIRST, target: SECOND, .. })));
        if hit {
            return;
        }
    }
    panic!("the Boss never brought her guns to bear");
}
