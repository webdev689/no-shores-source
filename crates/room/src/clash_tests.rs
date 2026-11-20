use super::*;
use naval::captain::{Temper, temper_for};
use naval::damage::State;
use naval::ranks::{Commission, GREY_TITHE, PIRATES, Rank};
use sailing::waters::{RATED_M_S, weather_wind};

/// A flat sea under a rated wind from the south.
pub fn still() -> (land::sea::Swell, [f64; 2]) {
    (land::sea::Swell { waves: Vec::new(), ..land::sea::Swell::default() }, weather_wind([0.0, -RATED_M_S]))
}

/// The first seed whose ship of `commission` is bold or not, as asked.
pub fn seed_for(commission: Commission, bold: bool) -> u32 {
    let temper = |seed| matches!(temper_for(commission, seed), Temper::Bold);
    (1..).find(|&seed| temper(seed) == bold).unwrap_or(0)
}

/// A ship at sea of `commission`, numbered `id`, at `x` on the line y = 0, heading north.
pub fn at_sea(id: u32, commission: Commission, x: f64, bold: bool) -> Pirate {
    Pirate::standing(id, seed_for(commission, bold), commission, [x, 0.0], 0.0, bold)
}

#[test]
fn rival_ships_fight_where_the_fight_has_them_until_one_strikes_or_runs_and_the_rest_sail_on() {
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    let minor = Commission { faction: PIRATES, rank: Rank::Minor };
    let met = [at_sea(3, elite, 0.0, true), at_sea(4, minor, 400.0, true)];
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    let mut pirates = Pirates::default();
    // A player between them, near enough that the fight stays at sea.
    let players = [[200.0, 0.0]];
    let mut ticks = 0;
    while !clashes.is_empty() && ticks < 20 * 60 * 60 {
        ticks += 1;
        let time = f64::from(ticks) / 60.0;
        step_clashes(&mut clashes, &mut pirates, &players, (&[], time));
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
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    let mut pirates = Pirates::default();
    step_clashes(&mut clashes, &mut pirates, &[[0.0, 1_000.0]], (&[], 1.0 / 60.0));
    let Some(loser) = clashes[0].fight.ships.get_mut(&(CAPTAIN + 1)) else { panic!("the second ship") };
    let hull = loser.damage.hull - loser.damage.max_hull * 0.2;
    let struck = loser.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
    assert_eq!(struck, Some(State::Struck));
    step_clashes(&mut clashes, &mut pirates, &[[0.0, 1_000.0]], (&[], 2.0 / 60.0));
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
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    let mut pirates = Pirates::default();
    step_clashes(&mut clashes, &mut pirates, &[[5_900.0, 0.0]], (&[], 0.0));
    assert_eq!(clashes.len(), 1, "within 1.1 times her sight of a player, she stays");
    step_clashes(&mut clashes, &mut pirates, &[[6_000.0, 0.0]], (&[], 0.0));
    assert!(clashes.is_empty() && pirates.sailing.is_empty(), "past it from every player, gone");
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    assert!(sighted(&mut clashes, [1_200.0, 0.0]).is_none(), "800 m from the nearest: out of sight");
    assert!(sighted(&mut clashes, [1_100.0, 0.0]).is_some_and(|clash| clash.fight.ships.len() == 2));
    assert!(clashes.is_empty(), "taken from the sea");
}

#[test]
fn a_clash_keeps_the_weather_it_began_in() {
    let minor = Commission { faction: PIRATES, rank: Rank::Minor };
    let tithe = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let (swell, _) = still();
    let wind = [0.4, -2.0];
    let mut clashes = vec![Clash::begin(
        [at_sea(1, minor, 0.0, true), at_sea(2, tithe, 300.0, true)],
        (swell.clone(), wind),
        &[],
        0.0,
    )];
    step_clashes(&mut clashes, &mut Pirates::default(), &[[150.0, 0.0]], (&[], 1.0 / 60.0));
    assert_eq!((clashes[0].swell.bearing, clashes[0].wind), (swell.bearing, wind));
}
