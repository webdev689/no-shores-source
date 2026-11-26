//! A run's modifiers, each one hook: Brawler, Marksman, Lightswitch (a foe's swing or telegraphed blow) and Burn weigh
//! only the blows they name; Burn's Art's spells deal twice; Ironclad shields more foes and keeps every shield it
//! would have stood with; Juggler drops no ammunition; Trickle slows recharges and Exposure halves heals; and a room
//! with no run is as it was.

use super::*;
use crate::{Floor, NodeKind, PlayerId, Section};
use combat::fighter::FighterId;
use combat::{BlowKind, Ranged, Stroke};
use gear::activities::Modifier;

fn run_of(modifiers: Vec<Modifier>) -> Run {
    Run { modifiers, ..Run::default() }
}

/// A blow of `kind` from `striker`, as a swing or a shot lands it before power.
fn blow_of(striker: PlayerId, kind: BlowKind) -> Blow {
    Blow {
        striker,
        kind,
        from: [0.0, 0.0],
        damage: 10.0,
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

#[test]
fn each_modifier_weighs_only_the_blows_it_names() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("in");
    let foe: FighterId = crate::arts::arts_tests::stand_foe(&mut room, 3.0, 0.0, 100.0);
    let blows = [
        (blow_of(player, BlowKind::Swing(Stroke::Down)), foe),
        (blow_of(player, BlowKind::Shot(Ranged::Bow)), foe),
        (blow_of(foe, BlowKind::Swing(Stroke::Down)), player),
        (blow_of(foe, BlowKind::Shot(Ranged::Crossbow)), player),
    ];
    let mut times = |modifiers: Vec<Modifier>| {
        room.run = Some(run_of(modifiers));
        blows.map(|(blow, defender)| room.modded_blow(&blow, defender))
    };
    assert_eq!(times(vec![]), [1.0; 4]);
    assert_eq!(times(vec![Modifier::Brawler]), [1.5, 1.0, 1.0, 1.0]);
    assert_eq!(times(vec![Modifier::Marksman]), [1.0, 1.5, 1.0, 1.0]);
    assert_eq!(times(vec![Modifier::Lightswitch]), [1.0, 1.0, 2.0, 1.0]);
    assert_eq!(times(vec![Modifier::Burn(1)]), [1.0, 1.0, 2.0, 2.0], "a Storm wearer takes twice");
    assert_eq!(times(vec![Modifier::Burn(2)]), [1.0; 4]);
    room.run = Some(run_of(vec![Modifier::Burn(2)]));
    assert_eq!((room.spell_times(2), room.spell_times(1)), (2.0, 1.0), "Divine's spells deal twice");
    room.run = Some(run_of(vec![Modifier::Trickle, Modifier::Exposure, Modifier::Ironclad]));
    assert_eq!((room.recharge_times(), room.heal_times(), room.shield_chance()), (1.5, 0.5, 0.5));
    room.run = None;
    assert_eq!((room.recharge_times(), room.heal_times(), room.shield_chance()), (1.0, 1.0, 0.2));
}

#[test]
fn lightswitch_doubles_a_foes_telegraphed_blow_on_a_player_and_never_a_players_own() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("in");
    let foe: FighterId = crate::arts::arts_tests::stand_foe(&mut room, 3.0, 0.0, 100.0);
    let slam = BlowKind::Telegraph(combat::shapes::Shape::Slam);
    let mut times = |modifiers: Vec<Modifier>| {
        room.run = Some(run_of(modifiers));
        [room.modded_blow(&blow_of(foe, slam), player), room.modded_blow(&blow_of(player, slam), foe)]
    };
    assert_eq!(times(vec![Modifier::Lightswitch]), [2.0, 1.0]);
    assert_eq!(times(vec![]), [1.0, 1.0]);
}

/// The shields a patrol's garrison stands with, its run's modifiers known before it stands.
fn shields(id: &str, run: Option<Run>) -> Vec<Option<gear::Element>> {
    let ring = vec![[-300.0, -300.0], [300.0, -300.0], [300.0, 300.0], [-300.0, 300.0]];
    let mut room = Room::node(Floor::Flat, Vec::new(), Section { ring, spawns: vec![[0.0, 0.0]], falls_kill: false });
    room.world_seed = crate::garrison::node_seed(id);
    room.foes_most = crate::NODE_FOES_MOST;
    room.run = run;
    room.stand_garrison(NodeKind::Patrol, Some((10, 14)));
    room.garrison.iter().flat_map(|post| post.girds.iter().map(|&(_, shield)| shield)).collect()
}

#[test]
fn ironclad_shields_more_foes_and_every_foe_shielded_without_it_keeps_its_shield() {
    let (mut plain, mut ironclad) = (0, 0);
    for id in ["saltgrass-downs", "gullwing-vale", "driftwood-moors", "highwater-fells", "whitewind-tundra"] {
        let (without, with) = (shields(id, None), shields(id, Some(run_of(vec![Modifier::Ironclad]))));
        assert_eq!(without.len(), with.len());
        for (one, other) in without.iter().zip(&with) {
            if one.is_some() {
                assert_eq!(other, one, "{id}: the same shield of the same element");
            }
        }
        (plain, ironclad) = (plain + without.iter().flatten().count(), ironclad + with.iter().flatten().count());
    }
    assert!(ironclad > plain, "{ironclad} against {plain}");
}

#[test]
fn juggler_drops_no_ammunition_and_trickle_and_exposure_slow_what_returns() {
    for (modifiers, dropped) in [(vec![], (1, 1)), (vec![Modifier::Juggler], (0, 0))] {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.run = Some(run_of(modifiers));
        let player = room.join().expect("in");
        let dice = room.dice(player);
        room.drop_spoils(player, Vec::new(), 4, [2.0, 0.0, 0.0], &dice); // a Miniboss: a box, and a crate taken
        assert_eq!((room.drops.len(), room.players[&player].character.materials.crates), dropped);
    }
    let filled = |modifiers: Vec<Modifier>| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        room.run = Some(run_of(modifiers));
        let player = room.join().expect("in");
        let found = room.players.get_mut(&player).expect("in");
        (found.casting.anima, found.fighter.health) = (0.0, 50.0);
        room.tick();
        room.heal(player, 10.0);
        (room.players[&player].casting.anima, room.players[&player].fighter.health)
    };
    let ((anima, health), (slow, exposed)) = (filled(vec![]), filled(vec![Modifier::Trickle, Modifier::Exposure]));
    assert!(anima > 0.0 && (anima / slow - 1.5).abs() < 1e-9, "two thirds as fast");
    assert_eq!((health, exposed), (60.0, 55.0));
}
