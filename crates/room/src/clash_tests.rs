use super::*;
use crate::pirates::commission_at_sea;
use naval::captain::{Temper, temper_for};
use naval::damage::State;
use naval::ranks::{Commission, GREY_TITHE, PIRATES, Rank};
use sailing::waters::{Spot, steady_wind};

/// Deep, still water everywhere.
struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

/// The first seed whose ship sails at sea under `commission`, bold or not as asked.
pub fn seed_for(commission: Commission, bold: bool) -> u32 {
    let temper = |seed| matches!(temper_for(commission, seed), Temper::Bold);
    (1..).find(|&seed| commission_at_sea(seed) == commission && temper(seed) == bold).unwrap_or(0)
}

/// A ship at sea of `commission`, numbered `id`, at `x` on the line y = 0, heading north.
pub fn at_sea(id: u32, commission: Commission, x: f64, bold: bool) -> Pirate {
    Pirate { id, seed: seed_for(commission, bold), x, y: 0.0, heading: 0.0, bold }
}

#[test]
fn rival_ships_fight_where_the_fight_has_them_until_one_strikes_or_runs_and_the_rest_sail_on() {
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    let minor = Commission { faction: PIRATES, rank: Rank::Minor };
    let met = [at_sea(3, elite, 0.0, true), at_sea(4, minor, 400.0, true)];
    let mut clashes = vec![Clash::begin(met, &Open, 0.0)];
    let mut pirates = Pirates::default();
    let wind = steady_wind(&land::sea::Swell::default());
    // A player between them, near enough that the fight stays at sea.
    let players = [[200.0, 0.0]];
    let mut ticks = 0;
    while !clashes.is_empty() && ticks < 20 * 60 * 60 {
        ticks += 1;
        let time = f64::from(ticks) / 60.0;
        step_clashes(&mut clashes, &mut pirates, &players, (&Open, |_| wind, time));
        for clash in &clashes {
            for (shown, (id, _)) in clash.ships().zip(&clash.crews) {
                let ship = clash.fight.vessel(*id).map(|vessel| vessel.ship);
                assert_eq!(ship.map(|ship| [ship.x, ship.y, ship.heading]), Some([shown.x, shown.y, shown.heading]));
            }
        }
        if ticks == 60 {
            let fighting = |clash: &Clash| {
                clash.fight.ships.values().filter_map(Vessel::command).any(|command| command.her.mode == Mode::Engage)
            };
            assert!(clashes.iter().all(fighting), "the bold one takes the other on");
        }
    }
    assert!(clashes.is_empty(), "settled within twenty minutes");
    let sailing = &pirates.sailing;
    assert_eq!(sailing.len(), 1, "one sails on: {sailing:?}");
    assert!(sailing[0].x != 0.0 && sailing[0].x != 400.0, "from where the fight left her");
}

#[test]
fn the_one_who_strikes_leaves_the_sea_and_the_winner_sails_on_from_where_she_lies() {
    let met = [
        at_sea(3, Commission { faction: GREY_TITHE, rank: Rank::Elite }, 0.0, true),
        at_sea(4, Commission::default(), 400.0, true),
    ];
    let mut clashes = vec![Clash::begin(met, &Open, 0.0)];
    let wind = steady_wind(&land::sea::Swell::default());
    let mut pirates = Pirates::default();
    step_clashes(&mut clashes, &mut pirates, &[[0.0, 1_000.0]], (&Open, |_| wind, 1.0 / 60.0));
    let Some(loser) = clashes[0].fight.ships.get_mut(&(CAPTAIN + 1)) else { panic!("the second ship") };
    let hull = loser.damage.hull - loser.damage.max_hull * 0.2;
    let struck = loser.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(struck, Some(State::Struck));
    step_clashes(&mut clashes, &mut pirates, &[[0.0, 1_000.0]], (&Open, |_| wind, 2.0 / 60.0));
    assert!(clashes.is_empty(), "nobody fights on");
    let sailing: Vec<(u32, u32)> = pirates.sailing.iter().map(|pirate| (pirate.id, pirate.seed)).collect();
    assert_eq!(sailing, [(3, met[0].seed)]);
}

#[test]
fn a_clash_no_player_is_near_leaves_the_sea_and_one_a_player_sights_is_theirs() {
    let met = [
        at_sea(3, Commission { faction: GREY_TITHE, rank: Rank::Major }, 0.0, true),
        at_sea(4, Commission::default(), 400.0, false),
    ];
    let wind = steady_wind(&land::sea::Swell::default());
    let mut clashes = vec![Clash::begin(met, &Open, 0.0)];
    let mut pirates = Pirates::default();
    step_clashes(&mut clashes, &mut pirates, &[[3_000.0, 0.0]], (&Open, |_| wind, 0.0));
    assert!(clashes.is_empty() && pirates.sailing.is_empty(), "past every player, gone");
    let mut clashes = vec![Clash::begin(met, &Open, 0.0)];
    assert!(sighted(&mut clashes, [1_200.0, 0.0]).is_none(), "800 m from the nearest: out of sight");
    assert!(sighted(&mut clashes, [1_100.0, 0.0]).is_some_and(|clash| clash.fight.ships.len() == 2));
    assert!(clashes.is_empty(), "taken from the sea");
}
