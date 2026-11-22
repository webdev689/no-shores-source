use super::*;
use naval::captain::{Temper, temper_for};
use naval::damage::State;
use naval::fight::CAPTAIN;
use naval::ranks::{Commission, GREY_TITHE, Rank};
use sailing::helm::WIND_RATED;

/// A flat sea under a rated wind from the south.
pub fn still() -> (land::sea::Swell, [f64; 2]) {
    (land::sea::Swell { waves: Vec::new(), ..land::sea::Swell::default() }, [0.0, -WIND_RATED])
}

/// The first seed whose ship of `commission` is bold or not, as asked.
pub fn seed_for(commission: Commission, bold: bool) -> u32 {
    let temper = |seed| matches!(temper_for(commission, seed), Temper::Bold);
    (1..).find(|&seed| temper(seed) == bold).unwrap_or(0)
}

/// A ship at sea of `commission`, numbered `id`, at `x` on the line y = 0, heading north.
pub fn at_sea(id: u32, commission: Commission, x: f64, bold: bool) -> Hostile {
    Hostile::standing(id, seed_for(commission, bold), commission, [x, 0.0], 0.0, bold)
}

/// A friendly ship of the traffic off its route, numbered `traffic` there, at `x` on the line y = 0, heading north in
/// a `hull`, bound north.
pub fn friend_at(traffic: u64, hull: sailing::HullKind, x: f64) -> Friendly {
    let sight_m = crate::sighting::SIGHT_LEAST_M;
    Friendly { traffic, hull, seed: 5, level: 0, sight_m, x, y: 0.0, heading: 0.0, to: [x, -100_000.0] }
}

#[test]
fn a_tithe_ship_and_a_friendly_ship_fight_where_the_fight_has_them_until_one_strikes_or_runs_and_the_rest_sail_on() {
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    let met = (at_sea(3, elite, 0.0, true), friend_at(9, sailing::HullKind::Sloop, 400.0));
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    let (mut hostiles, mut friendlies) = (Hostiles::default(), Friendlies::default());
    // A player between them, near enough that the fight stays at sea.
    let players = [[200.0, 0.0]];
    let mut ticks = 0;
    while !clashes.is_empty() && ticks < 20 * 60 * 60 {
        ticks += 1;
        let time = f64::from(ticks) / 60.0;
        step_clashes(&mut clashes, (&mut hostiles, &mut friendlies), &players, (&[], time));
        for clash in &clashes {
            for (shown, (id, _)) in clash.ships().zip(&clash.crews) {
                let ship = clash.fight.vessel(*id).map(|vessel| vessel.ship);
                assert_eq!(ship.map(|ship| [ship.x, ship.y, ship.heading]), Some([shown.x, shown.y, shown.heading]));
            }
            for (shown, (id, _)) in clash.friendlies().zip(&clash.friends) {
                let ship = clash.fight.vessel(*id).map(|vessel| vessel.ship);
                assert_eq!(ship.map(|ship| [ship.x, ship.y, ship.heading]), Some([shown.x, shown.y, shown.heading]));
            }
        }
        if ticks == 60 {
            let engaged = |clash: &Clash| {
                clash.fight.ships.values().filter_map(Vessel::command).all(|command| command.mind.mode == Mode::Engage)
            };
            assert!(clashes.iter().all(engaged), "the Tithe ship attacks, and the friendly ship fights back");
        }
    }
    assert!(clashes.is_empty(), "settled within twenty minutes");
    // The Tithe ship sails on only unstruck; the friendly ship whenever it is afloat.
    let on = (hostiles.sailing.len(), friendlies.sailing.len());
    assert!(on.0 <= 1 && on.1 <= 1 && on != (0, 0), "who sails on: {on:?}");
}

#[test]
fn the_friendly_ship_flies_the_players_flag_in_its_own_hull_a_major_at_the_tithe_ships_level() {
    let elite = Commission { faction: GREY_TITHE, rank: Rank::Elite };
    let tithe = Hostile { level: 27, ..at_sea(3, elite, 0.0, true) };
    let clash = Clash::begin((tithe, friend_at(9, sailing::HullKind::Brig, 400.0)), still(), &[], 0.0);
    let friendly = clash.fight.vessel(CAPTAIN + 1).expect("the friendly ship");
    assert_eq!(friendly.flag(), naval::shots::Flag::Player, "it flies the players' flag");
    let command = friendly.command().expect("a captain sails it");
    let commission = Commission { faction: naval::ranks::PLAYERS, rank: Rank::Major };
    assert_eq!((friendly.hull, command.mind.commission), (sailing::HullKind::Brig, commission));
    let strength = gear::power::foe_health_times(27);
    assert_eq!(friendly.damage.max_hull, commission.damage_in(sailing::HullKind::Brig, strength).max_hull, "level 27");
    assert_eq!(command.mind.temper, Temper::Bold, "it fights");
    let tithe = clash.fight.vessel(CAPTAIN).map(|vessel| vessel.damage.max_hull);
    assert_eq!(tithe, Some(elite.damage_at(strength).max_hull), "the Tithe ship's hull as its level raises it");
}

#[test]
fn the_one_who_strikes_leaves_the_sea_and_the_winner_sails_on_from_where_it_lies() {
    for (loser, sails_on) in [(CAPTAIN + 1, "the Tithe ship"), (CAPTAIN, "the friendly ship")] {
        let tithe = at_sea(3, Commission { faction: GREY_TITHE, rank: Rank::Elite }, 0.0, true);
        let mut clashes = vec![Clash::begin((tithe, friend_at(9, sailing::HullKind::Sloop, 400.0)), still(), &[], 0.0)];
        let (mut hostiles, mut friendlies) = (Hostiles::default(), Friendlies::default());
        let at_sea = (&mut hostiles, &mut friendlies);
        step_clashes(&mut clashes, at_sea, &[[0.0, 1_000.0]], (&[], 1.0 / 60.0));
        let Some(struck) = clashes[0].fight.ships.get_mut(&loser) else { panic!("the ship") };
        let hull = struck.damage.hull - struck.damage.max_hull * 0.1;
        let state = struck.damage.apply(naval::damage::Hurt { hull, sail: 0.0, crew: 0.0, fire: false }, 0.0, 0.0);
        assert_eq!(state, Some(State::Struck));
        let at_sea = (&mut hostiles, &mut friendlies);
        step_clashes(&mut clashes, at_sea, &[[0.0, 1_000.0]], (&[], 2.0 / 60.0));
        assert!(clashes.is_empty(), "nobody fights on");
        let sailing = (hostiles.sailing.iter().map(|ship| ship.id).collect(), friendlies.sailing.len());
        // A friendly ship still afloat sails on for its port, struck or not; a Tithe ship that struck leaves the sea.
        let wanted: (Vec<u32>, usize) = if loser == CAPTAIN { (vec![], 1) } else { (vec![3], 1) };
        assert_eq!(sailing, wanted, "{sails_on} sails on");
    }
}

#[test]
fn a_clash_no_player_is_near_leaves_the_sea_and_one_a_player_sights_by_either_ship_is_theirs() {
    let tithe = at_sea(3, Commission { faction: GREY_TITHE, rank: Rank::Major }, 0.0, true);
    let met = (tithe, friend_at(9, sailing::HullKind::Sloop, 400.0));
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    let (mut hostiles, mut friendlies) = (Hostiles::default(), Friendlies::default());
    step_clashes(&mut clashes, (&mut hostiles, &mut friendlies), &[[5_900.0, 0.0]], (&[], 0.0));
    assert_eq!(clashes.len(), 1, "within 1.1 times its sight of a player, it stays");
    step_clashes(&mut clashes, (&mut hostiles, &mut friendlies), &[[6_000.0, 0.0]], (&[], 0.0));
    assert!(clashes.is_empty() && hostiles.sailing.is_empty(), "past it from every player, gone");
    assert!(friendlies.sailing.is_empty(), "the friendly ship with it");
    let mut clashes = vec![Clash::begin(met, still(), &[], 0.0)];
    assert!(sighted(&mut clashes, [1_200.0, 0.0]).is_none(), "800 m from the nearest: out of sight");
    assert!(sighted(&mut clashes, [1_100.0, 0.0]).is_some_and(|clash| clash.fight.ships.len() == 2));
    assert!(clashes.is_empty(), "taken from the sea");
}

#[test]
fn a_clash_keeps_the_weather_it_began_in() {
    let minor = Commission { faction: GREY_TITHE, rank: Rank::Minor };
    let (swell, _) = still();
    let wind = [0.4, -2.0];
    let met = (at_sea(1, minor, 0.0, true), friend_at(2, sailing::HullKind::Sloop, 300.0));
    let mut clashes = vec![Clash::begin(met, (swell.clone(), wind), &[], 0.0)];
    let at_sea = (&mut Hostiles::default(), &mut Friendlies::default());
    step_clashes(&mut clashes, at_sea, &[[150.0, 0.0]], (&[], 1.0 / 60.0));
    assert_eq!((clashes[0].swell.bearing, clashes[0].wind), (swell.bearing, wind));
}
