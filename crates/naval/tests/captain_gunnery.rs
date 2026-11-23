//! How often a captain's balls strike a player's Sloop's hull, sailing on and weaving, by its rank: its gunners lay on
//! where they judge the Sloop will be, and miss by their want of skill as a crew of that rank does. A ball stops at a
//! hull, so each strikes one at most; one through a sail first is counted by its hull's alone.

use naval::damage::Zone;
use naval::fight::{CAPTAIN, Event, Fight, Orders, PLAYER};
use naval::ranks::{Commission, GREY_TITHE, Rank};
use naval::shots::ShotEvent;
use sailing::TICK_SECONDS;
use sailing::ship::{Helm, Ship};
use sailing::waters::{Spot, Waters};

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const WIND: [f64; 2] = [3.0, 1.0];

/// How many of a bold captain of `rank`'s balls strike the player's Sloop's hull, and how many it fires, over `minutes` of
/// a fight on each of `seeds`, the Sloop under all plain sail and weaving: hard over one way for 4 s, steady 8 s,
/// hard over the other 4 s, steady 8 s; or holding its course, with `weaving` false; until the fight ends.
fn struck_share(rank: Rank, weaving: bool, minutes: u32, seeds: u32) -> (u32, u32) {
    let (mut fired, mut struck) = (0, 0);
    for seed in 1..=seeds {
        let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 4.0, abeam: 0.0, turn: 0.0, sail_way: 4.0, rung: 2 };
        let captain = Ship { x: 300.0, y: -200.0, heading: 4.0, ..ship };
        let commission = Commission { faction: GREY_TITHE, rank };
        let Ok(mut fight) = Fight::ambush(ship, &[(captain, commission, seed)], seed, &Open, 0.0) else {
            continue;
        };
        let ticks = (minutes * 60) as f64 / TICK_SECONDS;
        for tick in 0..ticks as u32 {
            let time = f64::from(tick) * TICK_SECONDS;
            let steer = match (time % 24.0) as u32 {
                0..4 if weaving => 1.0,
                12..16 if weaving => -1.0,
                _ => 0.0,
            };
            let orders = Orders {
                helm: Helm { steer, climb: 0 },
                aim: None,
                fire: false,
                brace: false,
                load: None,
                boost: false,
            };
            for event in fight.step(&[(PLAYER, orders)], &Open, &|_| WIND, time) {
                match event {
                    Event::Shot(ShotEvent::Muzzle { shooter, .. }) if shooter == CAPTAIN => fired += 1,
                    Event::Shot(ShotEvent::Hit { shooter, target, zone, .. })
                        if shooter == CAPTAIN && target == PLAYER && zone != Zone::Rig =>
                    {
                        struck += 1;
                    }
                    _ => {}
                }
            }
            if fight.over().is_some() {
                break;
            }
        }
    }
    (struck, fired)
}

#[test]
fn captains_miss_often_and_a_higher_rank_less() {
    let share = |rank: Rank, weaving: bool| {
        let (struck, fired) = struck_share(rank, weaving, 2, 3);
        assert!(fired >= 9, "{rank:?} fired {fired}");
        f64::from(struck) / f64::from(fired)
    };
    for weaving in [false, true] {
        let [minor, major, boss] =
            [share(Rank::Minor, weaving), share(Rank::Major, weaving), share(Rank::Boss, weaving)];
        assert!(minor < 0.4 && major < 0.65 && boss < 0.7, "weaving {weaving}: {minor} {major} {boss}");
        assert!(minor < major && minor < boss && boss > 0.25, "weaving {weaving}: {minor} {major} {boss}");
    }
}

#[test]
#[ignore = "a measure, not a check: cargo test -p naval --release --test captain_gunnery -- --ignored --nocapture"]
fn measure_struck_share_by_rank() {
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss] {
        for weaving in [false, true] {
            let (struck, fired) = struck_share(rank, weaving, 4, 6);
            let share = f64::from(struck) / f64::from(fired.max(1));
            let a_minute = f64::from(struck) / 24.0;
            eprintln!(
                "{rank:?} weaving {weaving}: {struck} of {fired} balls struck ({:.0}%), {a_minute:.1} a minute",
                share * 100.0
            );
        }
    }
}
