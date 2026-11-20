//! A garrison fits the gear loop: each foe stands at its island's level raised by the voyage's seas, its rank's numbers
//! multiplied on top; one in five stands with a shield of an element drawn evenly, holding half its health, the same
//! on every machine and each time its group stands again; a kill pays as any foe's does; a Boss's called foes fight at
//! its level; and the fight's heat counts a blow as combat is tuned for at any level, a shield's share with it.

use super::garrison_tests::{called_by, into_its_last_phase, levelled, run};
use super::*;
use crate::PlayerId;
use crate::judging::How;
use combat::judge::Blow;
use combat::{BlowKind, Stroke, Verdict};
use gear::{Difficulty, Element, Slot};
use std::collections::{BTreeMap, BTreeSet};

/// A foe's health as its type and rank stand it, before any level.
fn ranked_health(found: &crate::foes::Foe) -> f64 {
    let (fighter, _) = ::foes::spawn(found.brain.foe_type, found.brain.rank, 0.0, 0.0, 0.0);
    fighter.health_max
}

/// A player's swing of `damage` on a foe.
fn blow(striker: PlayerId, damage: f64) -> Blow {
    Blow {
        striker,
        kind: BlowKind::Swing(Stroke::Down),
        from: [0.0, 0.0],
        damage,
        poise: 10.0,
        guard: 0.0,
        parryable: true,
        blockable: true,
        knocks_down: false,
        through: 1.0,
        stagger: 1.0,
        element: 0,
        crit: false,
    }
}

/// Lands `damage` of `striker`'s main hand on `foe`, as the room settles a blow it judged a hit.
fn land(room: &mut Room, striker: PlayerId, foe: FighterId, damage: f64) {
    let hit = Verdict::Hit { damage, poise: 10.0 };
    room.settle(&blow(striker, damage), How::Swing, foe, hit, Some(Slot::Melee));
}

#[test]
fn every_garrison_foe_stands_at_its_islands_level_raised_by_the_seas_its_ranks_health_multiplied_on_top() {
    let normal = levelled(NodeKind::Dungeon, "glade", (7, 10));
    let mut abyss = levelled(NodeKind::Dungeon, "glade", (7, 10));
    abyss.set_difficulty(Difficulty::Abyss);
    assert!(!normal.foes.is_empty());
    let mut levels = BTreeSet::new();
    for (id, found) in &normal.foes {
        assert!((7..=10).contains(&found.level), "within the island's band: {}", found.level);
        levels.insert(found.level);
        let times = gear::power::foe_health_times(found.level);
        assert!((found.fighter.health_max - ranked_health(found) * times).abs() < 1e-9, "its rank's health, levelled");
        let raised = &abyss.foes[id];
        assert_eq!(raised.level, found.level + 3, "Abyss raises it three");
        let times = gear::power::foe_health_times(raised.level);
        assert!((raised.fighter.health_max - ranked_health(raised) * times).abs() < 1e-6, "as if it stood at it");
        assert!((raised.fighter.health - raised.fighter.health_max).abs() < 1e-6, "and whole");
        if let Some(shield) = raised.shield {
            assert!((shield.most - raised.fighter.health_max * 0.5).abs() < 1e-6 && shield.left == shield.most);
        }
    }
    assert!(levels.len() > 1, "drawn across the band: {levels:?}");
    // A node of no island stands its foes at no level: they fight by combat's own numbers, whatever the seas.
    let mut plain = garrison_tests::node(NodeKind::Dungeon, "glade");
    plain.set_difficulty(Difficulty::Abyss);
    assert!(plain.foes.values().all(|found| found.level == 0));
}

#[test]
fn one_garrison_foe_in_five_is_drawn_a_shield_of_an_element_drawn_evenly_and_a_level_drawn_evenly() {
    let seed = node_seed("glade");
    let girds: Vec<(u8, Option<Element>)> = (0..6000).map(|nth| gird_of(seed, nth, Some((1, 4)))).collect();
    let share = |count: usize| count as f64 / girds.len() as f64;
    let shields: Vec<Element> = girds.iter().filter_map(|(_, shield)| *shield).collect();
    assert!((share(shields.len()) - 0.2).abs() < 0.02, "one in five: {}", share(shields.len()));
    for element in Element::ALL {
        let each = shields.iter().filter(|shield| **shield == element).count() as f64 / shields.len() as f64;
        assert!((each - 1.0 / 3.0).abs() < 0.04, "{element:?} evenly: {each}");
    }
    for level in 1..=4 {
        let each = share(girds.iter().filter(|(drawn, _)| *drawn == level).count());
        assert!((each - 0.25).abs() < 0.03, "level {level} evenly: {each}");
    }
    assert_eq!(gird_of(seed, 7, None).0, 0, "no island, no level");
    assert_eq!(gird_of(seed, 7, Some((1, 4))), gird_of(seed, 7, Some((1, 4))), "the same draw every time");
}

#[test]
fn a_garrisons_shields_hold_half_its_foes_health_on_every_machine_and_stand_again_with_their_group() {
    let shields = |room: &Room| -> BTreeMap<FighterId, gear::element::Shield> {
        room.foes.iter().filter_map(|(id, found)| found.shield.map(|shield| (*id, shield))).collect()
    };
    let (id, mut room) = ["glade", "fen", "barrow", "tor", "weir", "holt"]
        .into_iter()
        .map(|id| (id, levelled(NodeKind::Dungeon, id, (4, 7))))
        .find(|(_, room)| !shields(room).is_empty())
        .expect("a shield among six garrisons");
    for (foe, shield) in shields(&room) {
        let health = room.foes[&foe].fighter.health_max;
        assert!((shield.most - health * 0.5).abs() < 1e-9 && shield.left == shield.most, "half its health, whole");
    }
    assert_eq!(shields(&room), shields(&levelled(NodeKind::Dungeon, id, (4, 7))), "the node's seed draws them");
    // A shielded group cleared stands again with the same shields, by its members' order.
    let post = (0..room.garrison.len())
        .find(|&post| room.garrison[post].standing.iter().any(|foe| room.foes[foe].shield.is_some()))
        .expect("a shielded group");
    let elements = |room: &Room| -> Vec<Option<Element>> {
        let standing = &room.garrison[post].standing;
        standing.iter().map(|foe| room.foes[foe].shield.map(|shield| shield.element)).collect()
    };
    let before = elements(&room);
    for foe in room.garrison[post].standing.clone() {
        let fighter = &mut room.foes.get_mut(&foe).expect("standing").fighter;
        fighter.health = 0.0;
        fighter.action = combat::fighter::Action::Dead { elapsed: 0 };
    }
    run(&mut room, STAND_AGAIN + 60);
    assert!(room.garrison[post].cleared_at.is_none(), "stood again");
    assert_eq!(elements(&room), before);
}

#[test]
fn a_garrison_kill_pays_by_its_level_and_seas_every_player_whose_blow_landed_in_its_last_ten_seconds() {
    let mut room = levelled(NodeKind::Patrol, "glade", (4, 7));
    room.set_difficulty(Difficulty::Elite);
    let (early, late) = (room.join().expect("room"), room.join().expect("room"));
    let foe = room.garrison[0].standing[0];
    room.foes.get_mut(&foe).expect("standing").shield = None;
    let (level, role) = (room.foes[&foe].level, room.foes[&foe].brain.role() as u8);
    assert!((6..=9).contains(&level), "the island's 4 to 7, two higher at Elite difficulty: {level}");
    let had = |room: &Room, player: PlayerId| {
        let character = &room.players[&player].character;
        (character.xp, u64::from(character.materials.aurem))
    };
    let (early_had, late_had) = (had(&room, early), had(&room, late));
    land(&mut room, early, foe, 1.0);
    room.clock += gear::rewards::SHARE_TICKS + 1;
    land(&mut room, late, foe, 1e9);
    let worth = gear::rewards::worth(match role {
        1 => gear::rewards::Foe::Skirmisher,
        2 => gear::rewards::Foe::Swordsman,
        3 => gear::rewards::Foe::Brute,
        4 => gear::rewards::Foe::Archer,
        _ => gear::rewards::Foe::Captain,
    });
    let paid = |amount: u32| (f64::from(amount * (5 + u32::from(level)) / 10) * 1.5).round() as u64;
    let (late_has, early_has) = (had(&room, late), had(&room, early));
    let gained = (late_has.0 - late_had.0, late_has.1 - late_had.1);
    assert_eq!(
        gained,
        (paid(worth.xp), paid(worth.aurem)),
        "its role's worth at its level, half again at Elite difficulty"
    );
    assert_eq!(early_has, early_had, "a blow over ten seconds old shares none");
}

#[test]
fn a_bosss_called_foes_fight_at_its_level_and_stand_with_no_shield() {
    let mut room = levelled(NodeKind::Boss, "summit", (13, 16));
    let boss = *room.foes.iter().find(|(_, found)| found.brain.rank == ::foes::Rank::Boss).expect("a Boss").0;
    let level = room.foes[&boss].level;
    into_its_last_phase(&mut room, boss);
    let called = called_by(&room, boss);
    assert!(!called.is_empty(), "its phases called");
    for id in called {
        let found = &room.foes[&id];
        assert_eq!((found.level, found.shield), (level, None));
        let times = gear::power::foe_health_times(level);
        assert!((found.fighter.health_max - ranked_health(found) * times).abs() < 1e-6);
    }
}

#[test]
fn the_fights_heat_counts_a_blow_as_combat_is_tuned_for_at_any_level_and_what_a_shield_took() {
    let mut room = levelled(NodeKind::Patrol, "glade", (26, 30));
    let player = room.join().expect("room");
    let foe = room.garrison[0].standing[0];
    room.foes.get_mut(&foe).expect("standing").shield = None;
    let times = gear::power::foe_health_times(room.foes[&foe].level);
    let heat = room.director.heat;
    // A matched player's blow is its tuned 10 times what the foe's level makes its health.
    land(&mut room, player, foe, 10.0 * times);
    let dealt = room.director.heat - heat;
    assert!((dealt - 10.0 * ::foes::director::DEALT_GAIN).abs() < 1e-9, "{dealt}");
    // A blow a shield holds whole still heats the fight, by what the shield took.
    let found = room.foes.get_mut(&foe).expect("standing");
    found.shield = Some(gear::element::Shield::whole(Element::Volt, 1e6));
    found.fighter.poise = 0.0;
    let (heat, health) = (room.director.heat, room.foes[&foe].fighter.health);
    land(&mut room, player, foe, 10.0 * times);
    assert_eq!(room.foes[&foe].fighter.health, health, "held whole");
    assert_eq!(room.foes[&foe].fighter.poise, 0.0, "a blow the shield holds whole fills no poise");
    assert!((room.director.heat - heat - dealt).abs() < 1e-9);
}

#[test]
fn a_boss_or_a_miniboss_never_stands_with_a_shield_while_the_foes_about_it_may() {
    let (mut leaders, mut shielded_others) = (0, 0);
    for nth in 0..60 {
        let id = format!("node-{nth}");
        for kind in [NodeKind::Boss, NodeKind::Dungeon] {
            let room = levelled(kind, &id, (7, 10));
            for found in room.foes.values() {
                if matches!(found.brain.rank, ::foes::Rank::Boss | ::foes::Rank::Miniboss) {
                    leaders += 1;
                    assert!(found.shield.is_none(), "a {:?} stood shielded in {id}", found.brain.rank);
                } else if found.shield.is_some() {
                    shielded_others += 1;
                }
            }
        }
    }
    assert!(leaders >= 100, "every boss and dungeon node has its leader: {leaders}");
    assert!(shielded_others > 0, "the foes about them still may carry one");
}
