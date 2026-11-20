use super::*;
use crate::sea::fight_measure_tests::plain_orders;
use gear::character::At;
use gear::crew::{Duty, Officer, Post};
use gear::kinds::Kind;
use gear::{Item, Rarity};
use naval::captain::{Temper, temper_for};
use naval::damage::State;
use naval::fight::{CAPTAIN, Fight, PLAYER, Sailor};
use naval::ranks::{Commission, PIRATES, Rank};
use sailing::ship::Ship;
use sailing::waters::{Spot, Waters};

struct Open;

impl Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> Spot {
        Spot { bed: -50.0, surface: Some(0.0) }
    }
}

const LEVEL: u8 = 20;
const LONGEST_TICKS: u64 = 60 * 600;

/// A player's character, its ship raised to `ship_level` by its experience and fitted with Rare modules of it.
fn sailor(ship_level: u8) -> Character {
    let mut character = Character::starting();
    character.earn_ship_xp(u32::try_from(gear::power::xp_for_level(ship_level)).unwrap_or(u32::MAX));
    for kind in Kind::MODULES {
        let id = character.take_id();
        let mut module = Item::new(id, kind, Rarity::Rare, ship_level, kind.slot());
        module.xp = u32::MAX / 2;
        module.bought = u32::MAX >> 8;
        module = module.kept(id, 0);
        for (_, at) in character.items.values_mut() {
            if *at == At::Worn(kind.slot()) {
                *at = At::Carried;
            }
        }
        character.items.insert(id, (module, At::Worn(kind.slot())));
    }
    character
}

/// A bold Major of the pirates at `LEVEL`, 600 m off.
fn hostile() -> (Pirate, Commission) {
    hostile_of(Rank::Major, LEVEL, 0)
}

/// The `nth` bold captain of the pirates of `rank` at `level`, 600 m off.
fn hostile_of(rank: Rank, level: u8, nth: usize) -> (Pirate, Commission) {
    let commission = Commission { faction: PIRATES, rank };
    let mut bold = (1..).filter(|seed| matches!(temper_for(commission, *seed), Temper::Bold));
    let seed = bold.nth(nth).unwrap_or(1);
    let pirate = Pirate { level, ..Pirate::standing(CAPTAIN, seed, commission, [0.0, -600.0], 0.0, true) };
    (pirate, commission)
}

/// Whether the captain struck or went down, whether the player's ship did, and the share of its hull the captain lost,
/// after a fight of the plain player's orders, its ship fitted by `character`'s.
fn fought(character: &Character) -> (bool, bool, f64) {
    fought_with(character, hostile())
}

fn fought_with(character: &Character, (pirate, commission): (Pirate, Commission)) -> (bool, bool, f64) {
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let mut fight = Fight::begin(ship, commission, pirate.seed, &Open, 0.0).expect("a fight");
    fight.raise(CAPTAIN, pirate.strength());
    let hostiles = [(CAPTAIN, pirate)].into();
    let mut sunk = false;
    for tick in 1..LONGEST_TICKS {
        fight.fit(PLAYER, fitting(character, &hostiles));
        let orders = plain_orders(&fight, PLAYER, tick, 300.0);
        fight.step(&[(PLAYER, orders)], &Open, [1.5, 0.0], 0.0);
        sunk |= fight.vessel(PLAYER).is_some_and(|own| matches!(own.damage.state, State::Sinking | State::Sunk));
        let other_ship = fight.vessel(CAPTAIN).expect("in the fight");
        let done = other_ship.command().is_some_and(|command| command.struck_at.is_some() || command.gone.is_some());
        if done || sunk {
            return (done, sunk, 1.0 - other_ship.damage.hull / other_ship.damage.max_hull);
        }
    }
    (false, sunk, 0.0)
}

#[test]
fn a_ships_level_decides_a_fight_with_a_ship_of_that_level_as_a_players_does_a_foes_on_land() {
    let matched = fought(&sailor(LEVEL));
    let green = fought(&sailor(1));
    assert!(matched.0 && !matched.1, "a ship of its level makes its strike: {matched:?}");
    assert!(!green.0 && green.1 && green.2 < 0.05, "a level 1 ship barely harms it and goes down: {green:?}");
}

#[test]
fn its_fitting_reads_its_power_and_trim_and_an_officer_at_their_post_shapes_it() {
    let mut character = sailor(LEVEL);
    let (pirate, _) = hostile();
    let hostiles = [(CAPTAIN, pirate)].into();
    let plain = fitting(&character, &hostiles);
    let power = character.ship_power();
    assert!((plain.dealt[&CAPTAIN] - power.harm_dealt(LEVEL)).abs() < 1e-12);
    assert!((plain.taken[&CAPTAIN] * pirate.strength() - power.harm_taken(LEVEL)).abs() < 1e-9);
    assert_eq!(plain.trim.gunner, 0.0);
    let gunner = character.sign_on(Officer::new(0, Post::Gunner, Rarity::Rare, LEVEL)).expect("signed on");
    character.ask(Ask::Station { officer: gunner, duty: Duty::Posted }, Here::default(), &dice()).expect("posted");
    let posted = fitting(&character, &hostiles);
    assert!(posted.trim.gunner > 0.5 && posted.trim.reload < plain.trim.reload);
}

#[test]
fn a_sinking_pays_its_and_its_officers_aboard_and_a_won_deck_now_and_then_gives_an_officer() {
    let (pirate, _) = hostile();
    let mut characters: BTreeMap<PlayerId, Character> = [(3, Character::starting()), (4, Character::starting())].into();
    let id =
        characters.get_mut(&3).and_then(|character| character.sign_on(Officer::new(0, Post::Bosun, Rarity::Magic, 1)));
    let sank = Sank { pirate, at: [0.0, 0.0], players: vec![3, 9], wind: [0.0, 0.0] };
    assert_eq!(pay_sinking(&sank, &mut characters), vec![3], "a player the sea holds no character for is passed by");
    let paid = &characters[&3];
    assert!(paid.ship_xp > 0 && paid.xp == 0);
    assert!(paid.crew.officers[&id.expect("signed on")].trained > 0);
    let boss = Pirate { commission: Commission { rank: Rank::Boss, ..pirate.commission }, ..pirate };
    let won = Sank { pirate: boss, players: vec![4], ..sank };
    let joined = (0..60).filter(|tick| !officers_join(&won, *tick, &mut characters).is_empty()).count();
    assert!((5..40).contains(&joined), "a Boss's deck gives an officer about one time in three: {joined}");
    assert_eq!(characters[&4].crew.officers.len(), joined.min(gear::crew::OFFICERS_MOST));
}

fn dice() -> gear::dice::Dice {
    gear::dice::Dice { seed: 1, tick: 0, player: 0 }
}

#[test]
fn a_captain_sails_its_own_way_whatever_the_players_fitting() {
    let (pirate, commission) = hostile();
    let ship = Ship { x: 0.0, y: 0.0, heading: 0.0, ahead: 0.0, abeam: 0.0, turn: 0.0, sail_way: 0.0, rung: 0 };
    let mut fight = Fight::begin(ship, commission, pirate.seed, &Open, 0.0).expect("a fight");
    fight.fit(PLAYER, fitting(&sailor(LEVEL), &[(CAPTAIN, pirate)].into()));
    assert!(matches!(fight.vessel(CAPTAIN).map(|other_ship| &other_ship.sailor), Some(Sailor::Captain(_))));
    assert!(fight.fitting(CAPTAIN).is_none());
}

/// The sea's fights by ship level: a plain player against bold captains of each rank at each level, its ship at the
/// starting level, three under and level with them by its experience (its Rare modules' Prestige carries it past
/// 20, as the table's level shows), `FIGHTS` fights a row on open water. Run by hand, in release:
/// `cargo test -p room --release fights_by_ship_level -- --ignored --nocapture`.
#[test]
#[ignore = "a measurement, run by hand"]
fn fights_by_ship_level() {
    const FIGHTS: usize = 6;
    eprintln!("| Rank | Its level | Ship level | Won | Sunk | Its hull lost |");
    eprintln!("|---|---|---|---|---|---|");
    for rank in [Rank::Minor, Rank::Major, Rank::Elite, Rank::Miniboss, Rank::Boss] {
        for level in [5_u8, 12, 20] {
            for ship in [1, level.saturating_sub(3).max(1), level] {
                let character = sailor(ship);
                let runs: Vec<_> =
                    (0..FIGHTS).map(|nth| fought_with(&character, hostile_of(rank, level, nth))).collect();
                let won = runs.iter().filter(|run| run.0 && !run.1).count();
                let sunk = runs.iter().filter(|run| run.1).count();
                let lost = runs.iter().map(|run| run.2).sum::<f64>() / FIGHTS as f64;
                eprintln!(
                    "| {rank:?} | {level} | {} | {won}/{FIGHTS} | {sunk}/{FIGHTS} | {:.0}% |",
                    character.ship_level(),
                    lost * 100.0
                );
            }
        }
    }
}
