//! The roster: every type spawns at each of its ranks on its faction's side, with its own arms and its role's numbers
//! scaled by its rank, defence shares capped and reaction floored; a rank it does not come in falls back to its first;
//! each rank throws its own set of telegraphed blows; roles, ranks and factions read back by number.

use combat::arms::{OffHand, Ranged, WeaponClass};
use combat::fighter::{Fighter, Side, Weight};
use combat::shapes::Shape;
use foes::ranks::{CORVANE, DEFENCE_MOST, Phase, REACTION_LEAST, THULE, shapes};
use foes::roster::{COLLECTOR, CROSSBOWMAN, DECKHAND, Domain, HIGH_ASSESSOR, REEVE};
use foes::{Call, FACTIONS, Place, ROSTER, Rank, Role, faction, foe_type, spawn};

const CLOSE: f64 = 1e-9;

#[test]
fn every_type_spawns_at_each_of_its_ranks_on_its_factions_side_with_its_numbers_scaled() {
    let scales = [
        (Rank::Minor, 0.6, 0.7, 0.9, 0.5),
        (Rank::Major, 1.0, 1.0, 1.0, 1.0),
        (Rank::Elite, 2.2, 1.6, 1.15, 1.25),
        (Rank::Miniboss, 4.0, 2.4, 1.25, 1.4),
        (Rank::Boss, 7.0, 3.5, 1.35, 1.5),
    ];
    for foe in &ROSTER {
        let role = foes::roles::numbers(foe.role);
        assert!(!foe.ranks.is_empty(), "{}", foe.name);
        for &rank in foe.ranks {
            let (_, health, poise, might, defence) = *scales.iter().find(|scale| scale.0 == rank).unwrap();
            let (fighter, brain) = spawn(foe, rank, 3.0, -4.0, 1.0);
            let numbers = brain.numbers();
            assert_eq!(fighter.side, Side::from_number(foe.faction), "{}", foe.name);
            assert_eq!(fighter.ally, foe.faction == 0, "{}", foe.name);
            assert_eq!((brain.foe_type.number, brain.rank, brain.phase()), (foe.number, rank, 1));
            assert!((fighter.health_max - role.health * health).abs() < CLOSE, "{} {rank:?}", foe.name);
            assert!((fighter.poise_max - role.poise * poise).abs() < CLOSE, "{} {rank:?}", foe.name);
            assert!(
                (fighter.might - role.might * might).abs() < CLOSE && (brain.might() - fighter.might).abs() < CLOSE
            );
            assert_eq!(fighter.weight, role.weight);
            assert_eq!(fighter.arms, combat::arms_of(foe.right, foe.left, true), "{}", foe.name);
            let shares = [numbers.parry, numbers.block, numbers.dodge];
            let total: f64 = shares.iter().sum();
            let base = foe.base();
            let wanted = (base.parry + base.block + base.dodge) * defence;
            assert!(total <= DEFENCE_MOST + CLOSE && (total - wanted.min(DEFENCE_MOST)).abs() < CLOSE);
            assert!(numbers.reaction >= REACTION_LEAST);
            assert_eq!((fighter.body.x, fighter.body.y, fighter.body.facing, fighter.aim), (3.0, -4.0, 1.0, 1.0));
            assert_eq!(brain.target(), None, "a new foe has seen nobody yet");
        }
    }
}

#[test]
fn spot_checks_of_the_ranks_multipliers_and_caps() {
    let numbers = |number: u8, rank: Rank| foe_type(number).unwrap().numbers(rank, 1);
    // The crew's swordsman as a Minor: lighter, slower to answer, half as sure.
    let minor = numbers(14, Rank::Minor);
    assert!((minor.health - 42.0).abs() < CLOSE && (minor.poise - 24.5).abs() < CLOSE);
    assert!((minor.might - 0.9).abs() < CLOSE && minor.reaction == 20);
    assert!((minor.parry - 0.075).abs() < CLOSE && (minor.block - 0.175).abs() < CLOSE);
    assert!((minor.dodge - 0.05).abs() < CLOSE && !minor.elite && !minor.feints);
    // The crew's captain as an Elite: its shares, 0.55 together, a quarter more; its reaction floored.
    let elite = numbers(17, Rank::Elite);
    assert!((elite.health - 352.0).abs() < CLOSE && (elite.poise - 96.0).abs() < CLOSE);
    assert!((elite.might - 1.38).abs() < CLOSE && elite.reaction == 13);
    assert!((elite.parry - 0.2 * 1.25).abs() < CLOSE);
    assert!((elite.parry + elite.block + elite.dodge - 0.55 * 1.25).abs() < CLOSE && elite.elite && !elite.feints);
    // The Reeve is a captain of the Grey Tithe, as the crew's captain is; the Boss seven captains.
    assert_eq!(numbers(6, Rank::Elite), foes::roles::Numbers { right: "mace_iron", left: "shield_kite_iron", ..elite });
    let boss = numbers(12, Rank::Boss);
    assert!((boss.health - 1120.0).abs() < CLOSE && boss.reaction == 13 && boss.feints && boss.phases == 3);
    // Each of a captain's ranks defends more than the one below, every one under the cap.
    let defends = |rank: Rank| {
        let found = numbers(17, rank);
        found.parry + found.block + found.dodge
    };
    let (miniboss, boss_defends) = (defends(Rank::Miniboss), boss.parry + boss.block + boss.dodge);
    assert!(defends(Rank::Elite) < miniboss && miniboss < boss_defends && boss_defends < 0.85, "{boss_defends}");
    assert_eq!(numbers(17, Rank::Miniboss).phases, 2);
    // A brute never defends at any rank.
    let bosun = numbers(10, Rank::Elite);
    assert_eq!((bosun.parry, bosun.block, bosun.dodge), (0.0, 0.0, 0.0));
}

#[test]
fn a_rank_a_type_does_not_come_in_falls_back_to_its_first() {
    let marksman = foe_type(5).unwrap();
    assert_eq!(marksman.rank_or_first(Some(Rank::Minor)), Rank::Elite);
    assert_eq!(spawn(marksman, Rank::Minor, 0.0, 0.0, 0.0).1.rank, Rank::Elite);
    assert_eq!(spawn(foe_type(12).unwrap(), Rank::Major, 0.0, 0.0, 0.0).1.rank, Rank::Boss);
    assert_eq!(spawn(foe_type(4).unwrap(), Rank::Boss, 0.0, 0.0, 0.0).1.rank, Rank::Major);
    assert_eq!(foe_type(1).unwrap().rank_or_first(None), Rank::Minor);
    assert_eq!(spawn(foe_type(2).unwrap(), Rank::Major, 0.0, 0.0, 0.0).1.rank, Rank::Major, "one it comes in");
}

#[test]
fn each_rank_throws_its_own_set_of_telegraphed_blows() {
    let captain = [Shape::Sweep, Shape::Lunge, Shape::Charge, Shape::Leap];
    let set =
        |role: &[Shape], shooter: bool, rank: Rank, phase: u8| shapes(role, shooter, rank, &THULE, phase).to_vec();
    assert!(set(&captain, false, Rank::Minor, 1).is_empty());
    assert_eq!(set(&captain, false, Rank::Major, 1), [Shape::Sweep, Shape::Lunge], "half, the gap-closers left out");
    assert_eq!(set(&[Shape::Slam, Shape::Sweep], false, Rank::Major, 1), [Shape::Slam]);
    assert_eq!(set(&[Shape::Lunge], false, Rank::Major, 1), [Shape::Lunge], "half of one, rounded up");
    assert_eq!(set(&captain, false, Rank::Elite, 1), captain);
    let swordsman = [Shape::Sweep, Shape::Lunge];
    assert_eq!(set(&swordsman, false, Rank::Miniboss, 1), captain, "a melee Miniboss adds the gap-closers");
    assert_eq!(set(&[Shape::Aimed], true, Rank::Miniboss, 1), [Shape::Aimed], "a shooter adds none");
    assert_eq!(set(&captain, false, Rank::Boss, 1), [Shape::Sweep, Shape::Lunge]);
    assert_eq!(set(&captain, false, Rank::Boss, 2), captain);
    let last = [Shape::Sweep, Shape::Lunge, Shape::Charge, Shape::Leap, Shape::Slam, Shape::Ring];
    assert_eq!(set(&captain, false, Rank::Boss, 3), last);
    assert_eq!(foe_type(12).unwrap().numbers(Rank::Boss, 3).shapes.to_vec(), last);
    let corvane = |phase: u8| foe_type(HIGH_ASSESSOR).unwrap().numbers(Rank::Boss, phase).shapes.to_vec();
    assert_eq!(corvane(1), [Shape::Sweep, Shape::Lunge], "the levy");
    assert_eq!(corvane(2), [Shape::Sweep, Shape::Lunge, Shape::Slam], "the summons adds the slam");
    let seizure = [Shape::Sweep, Shape::Lunge, Shape::Slam, Shape::Charge, Shape::Leap, Shape::Ring];
    assert_eq!(corvane(3), seizure, "the seizure adds the charge, the leap and the ring");
}

#[test]
fn thule_fights_in_the_phases_he_always_had_and_corvane_in_his_own() {
    let thule = foe_type(12).unwrap();
    assert_eq!(thule.boss_phases, &THULE);
    let numbers = |phase: &Phase| (phase.from, phase.windup, phase.cooldown, phase.might, phase.chains);
    let deckhands = Call { foe_type: DECKHAND, rank: Rank::Minor, count: 2, place: Place::Beside };
    assert_eq!(
        THULE.map(|phase| numbers(&phase)),
        [(1.0, 1.0, 1.0, 1.0, 1), (2.0 / 3.0, 0.85, 0.8, 1.0, 2), (1.0 / 3.0, 0.75, 0.6, 1.25, 2)]
    );
    assert_eq!(THULE.map(|phase| phase.calls), [None, None, Some(deckhands)], "his crew into his last stand");
    let corvane = foe_type(HIGH_ASSESSOR).unwrap();
    assert_eq!((corvane.name, corvane.faction, corvane.domain), ("High Assessor Corvane", 1, Domain::Land));
    assert_eq!(
        (corvane.role, corvane.ranks, corvane.right, corvane.left),
        (Role::Captain, &[Rank::Boss][..], "flail_iron", "shield_kite_iron")
    );
    assert_eq!(corvane.boss_phases, &CORVANE);
    assert_eq!(
        CORVANE.map(|phase| numbers(&phase)),
        [(1.0, 1.0, 1.0, 1.0, 1), (2.0 / 3.0, 0.85, 1.0, 1.0, 1), (1.0 / 3.0, 0.85, 0.6, 1.25, 1)]
    );
    let crossbowmen = Call { foe_type: CROSSBOWMAN, rank: Rank::Minor, count: 2, place: Place::Behind };
    let collectors = Call { foe_type: COLLECTOR, rank: Rank::Major, count: 2, place: Place::Beside };
    assert_eq!(CORVANE.map(|phase| phase.calls), [None, Some(crossbowmen), Some(collectors)]);
    let (fighter, brain) = spawn(corvane, Rank::Boss, 0.0, 0.0, 0.0);
    assert_eq!((fighter.arms.melee, fighter.arms.off_hand), (WeaponClass::Flail, OffHand::Shield));
    assert!((fighter.health_max - 1120.0).abs() < CLOSE && (fighter.poise_max - 210.0).abs() < CLOSE);
    assert_eq!((brain.numbers().phases, foe_type(17).unwrap().numbers(Rank::Miniboss, 1).phases), (3, 2));
}

#[test]
fn shooters_hold_their_own_weapons_and_the_marksman_stands_off_farther() {
    let ranged = |number: u8| spawn(foe_type(number).unwrap(), Rank::Major, 0.0, 0.0, 0.0).0.arms.ranged;
    assert_eq!(ranged(3), Some(Ranged::Crossbow));
    assert_eq!(ranged(5), Some(Ranged::Thunderlock));
    assert_eq!(ranged(9), Some(Ranged::Pistolet));
    assert_eq!(ranged(16), Some(Ranged::Bow));
    assert!((foe_type(5).unwrap().numbers(Rank::Elite, 1).standoff - 1.5).abs() < CLOSE);
    let collector = spawn(foe_type(2).unwrap(), Rank::Major, 0.0, 0.0, 0.0).0.arms;
    assert_eq!((collector.melee, collector.off_hand), (WeaponClass::Sword, OffHand::Shield));
    // The hookman's axe takes both hands, so the combat rules leave its shield out of the fight.
    let hookman = spawn(foe_type(8).unwrap(), Rank::Major, 0.0, 0.0, 0.0).0.arms;
    assert_eq!((hookman.melee, hookman.off_hand), (WeaponClass::Axe, OffHand::Empty));
}

#[test]
fn roles_ranks_types_and_factions_read_back_by_number() {
    for role in Role::ALL {
        assert_eq!(Role::from_number(role as u8), Some(role));
    }
    assert_eq!((Role::from_number(0), Role::from_number(6)), (None, None));
    let names: Vec<&str> = Role::ALL.iter().map(|role| role.name()).collect();
    assert_eq!(names, ["skirmisher", "swordsman", "brute", "archer", "captain"]);
    for rank in Rank::ALL {
        assert_eq!(Rank::from_number(rank as u8), Some(rank));
    }
    assert_eq!(Rank::from_number(0), None);
    let numbers: Vec<u8> = ROSTER.iter().map(|foe| foe.number).collect();
    assert_eq!(numbers, (1..=45).collect::<Vec<u8>>(), "numbered 1 to 45 in order");
    assert_eq!(foe_type(0), None);
    let tithe = faction(1).unwrap();
    assert_eq!((tithe.name, tithe.side()), ("The Grey Tithe", Side::Faction(1)));
    let land: Vec<&str> = tithe.types(Domain::Land).map(|foe| foe.name).collect();
    let wardens = foes::ROSTER[20..38].iter().map(|foe| foe.name);
    let tithe_land = ["Runner", "Collector", "Crossbowman", "Enforcer", "Marksman", "Reeve", "High Assessor Corvane"];
    let after = wardens.chain(["Tithe-Taker"]);
    assert_eq!(land, tithe_land.into_iter().chain(after).collect::<Vec<_>>(), "the Elite Dungeons' Bosses after");
    assert_eq!(tithe.types(Domain::Deck).last().unwrap().name, "Captain Brannoc Thule");
    assert_eq!(faction(2), None, "no faction of that number");
    let crew: Vec<(u8, Side)> =
        (13..=17).map(|number| foe_type(number).unwrap()).map(|foe| (foe.faction, foe.side())).collect();
    assert_eq!(crew, [(foes::factions::CREW, Side::Players); 5], "the crew's own types, on the players' side");
    let lattice = faction(3).unwrap();
    let crystal: Vec<&str> = lattice.types(Domain::Land).map(|foe| foe.name).collect();
    assert_eq!(crystal, ["Husk", "Flicker", "Idol", "Ravager", "Bulwark", "Heart"]);
    assert_eq!((lattice.types(Domain::Deck).count(), lattice.screens), (0, false), "on land only, never screened");
    assert_eq!(FACTIONS.len(), 2);
    assert_eq!(spawn(foe_type(14).unwrap(), Rank::Major, 0.0, 0.0, 0.0).0.weight, Weight::Medium);
}

#[test]
fn each_elite_dungeon_has_a_boss_of_its_own_of_its_garrisons_faction_fighting_corvanes_three_phases() {
    let bosses: Vec<&foes::FoeType> = ROSTER.iter().filter(|foe| (21..=38).contains(&foe.number)).collect();
    assert_eq!(bosses.len(), 18);
    let garrison = foe_type(REEVE).unwrap().faction;
    for boss in &bosses {
        assert_eq!(
            (boss.ranks, boss.faction, boss.domain, boss.role),
            (&[Rank::Boss][..], garrison, Domain::Land, Role::Captain)
        );
        assert_eq!(boss.boss_phases, &CORVANE[..], "{}", boss.name);
    }
    let names: std::collections::BTreeSet<&str> = bosses.iter().map(|boss| boss.name).collect();
    assert_eq!(names.len(), 18, "each its own name");
    assert_eq!(
        (foe_type(21).unwrap().name, foe_type(38).unwrap().name),
        ("Wreck-Reeve Oswin Tarr", "Catacomb-Reeve Silas Brine")
    );
}

#[test]
fn the_bulwark_raises_its_shield_as_a_swordsman_does_until_its_change_drops_it() {
    let bulwark = foe_type(foes::roster::BULWARK).expect("the Bulwark");
    let (fighter, brain) = spawn(bulwark, Rank::Elite, 0.0, 0.0, 0.0);
    let swordsman = foes::roles::numbers(Role::Swordsman).block;
    let shielded = foes::roster::standing(&brain, &fighter);
    assert!((shielded.block - swordsman * 1.25).abs() < CLOSE, "an Elite's share of a swordsman's block");
    assert_eq!(
        foes::roster::standing(&brain, &Fighter { health: fighter.health_max * 0.6, ..fighter }).block,
        shielded.block
    );
    let changed = Fighter { health: fighter.health_max / 2.0, ..fighter };
    assert_eq!(foes::roster::standing(&brain, &changed).block, 0.0, "at half its health its shield is gone");
    // Another brute keeps its role's never-guarding way.
    let (fighter, brain) = spawn(foe_type(4).expect("the Enforcer"), Rank::Major, 0.0, 0.0, 0.0);
    assert_eq!(foes::roster::standing(&brain, &fighter).block, 0.0);
}
