//! The Atheric weapons' perks the room plays: each intrinsic and own node, the leaps, bursts and bites they strike,
//! what they count, and that nothing chains from a chain.

use super::CHAIN;
use crate::foes::Foe;
use crate::judging::{EventKind, How};
use crate::perks::trim_of;
use crate::power::{FOE_HARM, PLAYER_HARM};
use crate::{FighterId, PlayerId, Room, loadout_arms};
use combat::{Blow, BlowKind, Fighter, Ranged, Status, Stroke, Trim, Verdict, ticks};
use gear::grid::Column;
use gear::{At, Element, Item, Kind, Rarity, Slot};
use std::collections::BTreeMap;

const SWORDSMAN: u8 = ::foes::roster::COLLECTOR;
const SWING: BlowKind = BlowKind::Swing(Stroke::Down);
const HIT: Verdict = Verdict::Hit { damage: 10.0, poise: 0.0 };
const KILL: Verdict = Verdict::Hit { damage: 5_000.0, poise: 0.0 };
const WORN: u32 = 99;
const HEALTH: f64 = 1000.0;

/// A room with a player wearing the Atheric `named`, its own node bought and chosen if `own`, holding it drawn, and a
/// foe standing at each of `at` (metres east of the first, all 1.5 m before the player).
fn room_with(named: &str, own: bool, at: &[f64]) -> (Room, PlayerId, Vec<FighterId>) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    let entry = gear::catalogue::catalogue().named(named).expect("an Atheric");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let kind = entry.kind;
    let mut item = gear::vestige::named_item(WORN, entry, kind.slot());
    if own {
        let column = item.columns().iter().position(|column| *column == Column::Signature).expect("its own");
        item.bought |= item.node_bit(column, 0).expect("a node");
        item.chosen[column] = 0;
    }
    if let Some(worn) = character.worn(kind.slot()).map(|worn| worn.id) {
        character.items.remove(&worn);
    }
    character.items.insert(WORN, (item, At::Worn(kind.slot())));
    let fighter = *room.fighter(player).expect("in");
    room.set_fighter(player, Fighter { arms: loadout_arms(kind), ..fighter });
    room.retrim(player);
    let foes = at.iter().map(|east| stand(&mut room, *east)).collect();
    (room, player, foes)
}

fn stand(room: &mut Room, east: f64) -> FighterId {
    let id = room.next_id();
    let foe_type = ::foes::foe_type(SWORDSMAN).expect("the hostiles' swordsman");
    let (fighter, brain) = ::foes::spawn(foe_type, ::foes::Rank::Major, east, -1.5, 0.0);
    let fighter = Fighter { health: HEALTH, health_max: HEALTH, ..fighter };
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

fn blow(striker: FighterId, kind: BlowKind) -> Blow {
    Blow {
        striker,
        kind,
        from: [0.0, 0.0],
        damage: 10.0,
        poise: 0.0,
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

fn taken(room: &Room, foe: FighterId) -> f64 {
    HEALTH - room.fighter(foe).expect("in the room").health
}

fn close(first: f64, second: f64) -> bool {
    (first - second).abs() < 1e-6
}

/// The events told of a kind of blow, as (defender, from, element).
fn told(room: &Room, how: How) -> Vec<(FighterId, Option<FighterId>, u8)> {
    let hits = room.events.iter().filter(|event| event.how == Some(how) && event.kind == EventKind::Hit);
    hits.map(|event| (event.defender, event.from, event.element)).collect()
}

fn landed(room: &mut Room, player: PlayerId, kind: BlowKind, foe: FighterId, verdict: Verdict) {
    room.clock += 30;
    let hand = if matches!(kind, BlowKind::Shot(_)) { Slot::Ranged } else { Slot::Melee };
    let how = if matches!(kind, BlowKind::Shot(_)) { How::Shot } else { How::Swing };
    room.settle(&blow(player, kind), how, foe, verdict, Some(hand));
}

#[test]
fn ten_atheric_weapons_each_have_an_intrinsic_and_an_own_node_of_their_own() {
    let content = gear::catalogue::catalogue();
    let weapons: Vec<_> =
        content.items.iter().filter(|item| item.rarity == Rarity::Atheric && item.kind.weapon()).collect();
    assert_eq!(weapons.len(), 10);
    for weapon in weapons {
        let intrinsic = weapon.intrinsic.as_deref().expect("an intrinsic");
        assert!(content.trait_fits(intrinsic, weapon.kind, Some(&weapon.id)), "{intrinsic} is {}'s", weapon.id);
        assert_eq!(weapon.layout.iter().map(Vec::len).collect::<Vec<_>>(), [3, 1, 2, 2], "{}'s grid", weapon.id);
    }
    assert!(content.trait_def("updraft").is_none(), "Updraft is gone");
}

#[test]
fn the_perks_that_give_and_take_trim_two_numbers_one_each_way() {
    let trimmed = |kind: Kind, perk: &str| {
        let mut room = Room::new(Vec::new(), (0.0, 0.0));
        let player = room.join().expect("a room with space");
        let character = &mut room.players.get_mut(&player).expect("in").character;
        let mut item = Item::new(WORN, kind, Rarity::Legendary, 20, kind.slot());
        item.layout = vec![vec![perk.to_owned()]];
        item.bought |= item.node_bit(0, 0).expect("a node");
        item.chosen[0] = 0;
        character.items.insert(WORN, (item, At::Worn(kind.slot())));
        trim_of(character, kind.slot())
    };
    let plain = Trim::PLAIN;
    assert_eq!(trimmed(Kind::Sword, "heavy_head"), Trim { damage: 1.12, swing_stamina: 1.2, ..plain });
    assert_eq!(trimmed(Kind::Sword, "feather_edge"), Trim { swing_stamina: 0.75, poise_given: 0.85, ..plain });
    assert_eq!(trimmed(Kind::Bow, "overdrawn"), Trim { aimed: 1.2, reload: 1.2, ..plain });
    assert_eq!(trimmed(Kind::Bow, "hair_trigger"), Trim { reload: 0.75, aimed: 0.9, ..plain });
    assert_eq!(trimmed(Kind::Sword, "reckless"), Trim { damage: 1.1, drawn_poise_taken: 1.2, ..plain });
    assert_eq!(trimmed(Kind::Bow, "guarded"), Trim { drawn_poise_taken: 0.8, damage: 0.95, ..plain });
}

#[test]
fn an_atherics_intrinsic_is_on_while_it_is_worn_and_its_own_node_only_once_chosen() {
    let (room, player, _) = room_with("the_reefwall", false, &[]);
    let trim = room.fighter(player).expect("in").trim;
    assert_eq!((trim.block_stamina, trim.riposte), (15.0, 1.0), "Coral Guard, unbought Riptide");
    let (room, player, _) = room_with("the_reefwall", true, &[]);
    assert_eq!(room.fighter(player).expect("in").trim.riposte, 1.5, "Riptide chosen");
}

#[test]
fn storm_gull_leaps_from_foe_to_foe_in_volt_and_squall_line_charges_each() {
    let (mut room, player, foes) = room_with("gullwing", true, &[0.0, 6.0, 12.0, 30.0]);
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    room.settle(&shot, How::Shot, foes[0], HIT, Some(Slot::Ranged));
    room.storm_gull(&shot, foes[0], &HIT);
    let leaps = told(&room, How::Leap);
    let volt = Element::Volt as u8;
    assert_eq!(leaps, vec![(foes[1], Some(foes[0]), volt), (foes[2], Some(foes[1]), volt)], "each from the last");
    assert!(close(taken(&room, foes[1]), 5.0) && close(taken(&room, foes[2]), 5.0), "half the shot");
    assert_eq!(taken(&room, foes[3]), 0.0, "30 m off: past 8 m of any foe struck");
    assert!(foes[1..3].iter().all(|foe| room.fighter(*foe).expect("in").statuses.has(Status::Charge)));

    let (mut room, player, foes) = room_with("gullwing", false, &[0.0, 6.0]);
    room.storm_gull(&shot, foes[0], &Verdict::Dodged { perfect: false });
    assert_eq!(taken(&room, foes[1]), 0.0, "a shot dodged leaps nowhere");
    let shot = blow(player, BlowKind::Shot(Ranged::Bow));
    room.storm_gull(&shot, foes[0], &HIT);
    assert!(!room.fighter(foes[1]).expect("in").statuses.has(Status::Charge), "no Charge without Squall Line");
}

#[test]
fn an_arrow_loosed_from_the_draw_is_aimed_and_a_quick_one_is_not() {
    let (mut room, player, foes) = room_with("gullwing", false, &[0.0, 6.0]);
    let held = room.held(player, Slot::Ranged).expect("a player");
    // A quick shot, one drawn, and one drawn a moment with Hair Trigger's softer aim.
    for (power, leaps) in [(1.0, false), (1.2, true), (0.9, true)] {
        let shot = combat::shots::loose(player, Ranged::Bow, [0.0, 0.0, 1.0], 0.0, 0.0, power);
        room.shots.push((shot, Some(crate::power::Loosed { aimed: crate::power::aimed(&shot), ..held })));
        let before = taken(&room, foes[1]);
        for _ in 0..10 {
            room.fly_shots();
        }
        assert_eq!(taken(&room, foes[1]) > before, leaps, "power {power}");
    }
}

#[test]
fn pulled_under_drags_the_foes_round_the_slain_and_exposes_them() {
    let (mut room, player, foes) = room_with("the_drowned_oath", true, &[0.0, 3.0, 9.0]);
    landed(&mut room, player, SWING, foes[0], KILL);
    assert!(close(taken(&room, foes[1]), 10.0 / 3.0), "a third of the blow");
    assert_eq!(told(&room, How::Burst), vec![(foes[1], Some(foes[0]), Element::Cosmic as u8)]);
    assert!(room.fighter(foes[1]).expect("in").statuses.has(Status::Expose));
    assert_eq!(taken(&room, foes[2]), 0.0, "9 m off");
}

#[test]
fn a_burst_passes_by_the_foes_its_own_sweep_strikes_so_one_blow_strikes_a_foe_once() {
    let (mut room, player, foes) = room_with("the_drowned_oath", true, &[0.0, 3.0, 2.0]);
    // A sweep strikes the first two: the kill on the first drags under the third alone.
    room.sweep = vec![foes[0], foes[1]];
    landed(&mut room, player, SWING, foes[0], KILL);
    assert_eq!(taken(&room, foes[1]), 0.0, "struck by the sweep itself, never by its burst");
    assert!(!room.fighter(foes[1]).expect("in").statuses.has(Status::Expose), "nor Exposed before its own blow");
    assert!(close(taken(&room, foes[2]), 10.0 / 3.0));
}

#[test]
fn bursts_from_one_sweep_strike_a_bystander_once() {
    // The sweep slays the first two; the third stands within 4 m of both and outside the sweep.
    let (mut room, player, foes) = room_with("the_drowned_oath", true, &[0.0, 2.0, 1.0]);
    if let Some(foe) = room.foes.get_mut(&foes[2]) {
        foe.fighter.body.y += 1.0;
    }
    room.sweep = vec![foes[0], foes[1]];
    landed(&mut room, player, SWING, foes[0], KILL);
    landed(&mut room, player, SWING, foes[1], KILL);
    assert!(close(taken(&room, foes[2]), 10.0 / 3.0), "dragged under once: {}", taken(&room, foes[2]));
}

#[test]
fn a_punch_with_a_ranged_atheric_drawn_sets_off_none_of_its_perks() {
    let (mut room, player, foes) = room_with("lanternfall", true, &[0.0, 3.0]);
    landed(&mut room, player, SWING, foes[0], KILL);
    assert_eq!(taken(&room, foes[1]), 0.0, "no Lantern's Wake from a fist");
    assert!(told(&room, How::Burst).is_empty());
}

#[test]
fn lanterns_wake_bursts_in_blaze_and_last_light_reloads() {
    let (mut room, player, foes) = room_with("lanternfall", true, &[0.0, 3.0]);
    let fighter = *room.fighter(player).expect("in");
    room.set_fighter(player, Fighter { action: combat::fighter::Action::Reload { left: 90 }, ..fighter });
    landed(&mut room, player, BlowKind::Shot(Ranged::Thunderlock), foes[0], KILL);
    assert!(close(taken(&room, foes[1]), 5.0), "half the shot");
    assert_eq!(told(&room, How::Burst), vec![(foes[1], Some(foes[0]), Element::Blaze as u8)]);
    assert_eq!(room.fighter(player).expect("in").action, combat::fighter::Action::Idle, "reloaded at once");
}

#[test]
fn knell_rings_out_on_a_stagger_by_poise_alone() {
    let (mut room, player, foes) = room_with("the_last_bell", true, &[0.0, 4.0]);
    landed(&mut room, player, SWING, foes[0], HIT);
    assert_eq!(taken(&room, foes[1]), 0.0, "no stagger, no ring");
    landed(&mut room, player, SWING, foes[0], Verdict::Hit { damage: 10.0, poise: 1_000.0 });
    assert!(room.fighter(foes[0]).expect("in").staggered());
    assert!(close(taken(&room, foes[1]), 2.5), "a quarter of the blow");
    assert_eq!(told(&room, How::Burst), vec![(foes[1], Some(foes[0]), Element::Volt as u8)]);
}

#[test]
fn coral_guard_bites_back_on_a_block_by_the_weapons_attack() {
    let (mut room, player, foes) = room_with("the_reefwall", false, &[0.0]);
    let fighter = *room.fighter(player).expect("in");
    room.set_fighter(player, Fighter { stamina: 20.0, ..fighter });
    let blocked = Verdict::Blocked { damage: 2.0, stamina: 0.0 };
    room.settle(&blow(foes[0], SWING), How::Swing, player, blocked, None);
    let character = &room.player(player).expect("in").character;
    let on_player = gear::power::on_player(character.defense(), character.level(), 0) * FOE_HARM;
    let by_player = gear::power::by_player(character.attack(Slot::Melee).expect("worn"), character.level(), 0);
    assert!(close(taken(&room, foes[0]), 10.0 / on_player * 0.2 * by_player * PLAYER_HARM), "a fifth, by its Attack");
    assert_eq!(told(&room, How::Bite).len(), 1);
    assert_eq!(room.fighter(player).expect("in").stamina, 35.0, "15 stamina back");
    room.settle(&blow(foes[0], SWING), How::Swing, player, HIT, None);
    assert_eq!(told(&room, How::Bite).len(), 1, "a blow that lands bites nothing");
    // A block whose chip slays its player bites nothing either.
    let fighter = *room.fighter(player).expect("in");
    let dying = Fighter { health: 0.0, action: combat::fighter::Action::Dead { elapsed: 0 }, ..fighter };
    room.atheric_after(&blow(foes[0], SWING), player, &fighter, &blocked, &dying);
    assert_eq!(told(&room, How::Bite).len(), 1, "the dead bite nothing");
}

#[test]
fn riptide_exposes_the_foe_a_riposte_lands_on() {
    let (mut room, player, foes) = room_with("the_reefwall", true, &[0.0]);
    landed(&mut room, player, SWING, foes[0], HIT);
    assert!(!room.fighter(foes[0]).expect("in").statuses.has(Status::Expose), "a swing is no riposte");
    let riposte = Blow { parryable: false, ..blow(player, SWING) };
    room.settle(&riposte, How::Riposte, foes[0], HIT, Some(Slot::Melee));
    assert!(room.fighter(foes[0]).expect("in").statuses.has(Status::Expose));
}

#[test]
fn thousand_cuts_strikes_each_swing_in_a_row_harder_to_half_again() {
    let (mut room, player, foes) = room_with("saltfang", false, &[0.0, 2.0]);
    let mut struck = Vec::new();
    for _ in 0..7 {
        room.clock += 30;
        struck.push(room.empower(blow(player, SWING), foes[0]).damage);
        room.settle(&blow(player, SWING), How::Swing, foes[0], HIT, Some(Slot::Melee));
    }
    let shares: Vec<f64> = struck.iter().map(|damage| (damage / struck[0] * 10.0).round() / 10.0).collect();
    assert_eq!(shares, [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.5]);
    room.clock += 30;
    room.settle(&blow(player, SWING), How::Swing, foes[1], HIT, Some(Slot::Melee));
    room.clock += 30;
    assert!(close(room.empower(blow(player, SWING), foes[0]).damage, struck[0]), "a swing on another ends the row");
}

#[test]
fn bleed_the_tide_long_wait_and_undercurrent_give_their_statuses_on_a_kill() {
    for (named, kind, status, seconds) in [
        ("saltfang", SWING, Status::Haste, 4.0),
        ("widows_walk", BlowKind::Shot(Ranged::Crossbow), Status::Veiled, 3.0),
        ("deepwatch", SWING, Status::Linked, 3.0),
    ] {
        let (mut room, player, foes) = room_with(named, true, &[0.0]);
        landed(&mut room, player, kind, foes[0], KILL);
        assert_eq!(room.fighter(player).expect("in").statuses.left(status), ticks(seconds), "{named}");
        let (mut room, player, foes) = room_with(named, false, &[0.0]);
        landed(&mut room, player, kind, foes[0], KILL);
        assert!(!room.fighter(player).expect("in").statuses.has(status), "{named} unbought");
    }
}

#[test]
fn vigil_crits_a_shot_past_20_m() {
    let (room, player, _) = room_with("widows_walk", false, &[]);
    let shot = blow(player, BlowKind::Shot(Ranged::Crossbow));
    assert!(room.vigil(shot, 25.0).crit && !room.vigil(shot, 15.0).crit);
    let (room, player, _) = room_with("brass_chorus", false, &[]);
    assert!(!room.vigil(blow(player, BlowKind::Shot(Ranged::DoublePistolet)), 25.0).crit, "Vigil's alone");
}

#[test]
fn call_and_answer_strikes_every_second_shot_that_lands_harder_and_encore_gives_back_two_shots() {
    let (mut room, player, foes) = room_with("brass_chorus", true, &[0.0, 2.0]);
    let shot = BlowKind::Shot(Ranged::DoublePistolet);
    let mut struck = Vec::new();
    for verdict in [HIT, Verdict::Dodged { perfect: false }, HIT, HIT] {
        struck.push(room.empower(blow(player, shot), foes[0]).damage);
        landed(&mut room, player, shot, foes[0], verdict);
    }
    let shares: Vec<f64> = struck.iter().map(|damage| (damage / struck[0] * 10.0).round() / 10.0).collect();
    assert_eq!(shares, [1.0, 1.4, 1.4, 1.0], "a shot dodged answers nothing");
    let shots = |room: &Room| room.player(player).expect("in").character.shots();
    room.players.get_mut(&player).expect("in").character.ammo = 0;
    landed(&mut room, player, shot, foes[1], KILL);
    assert_eq!(shots(&room), 2);
    assert_eq!(room.fighter(player).expect("in").ammo, Some(2), "loaded at once");
}

#[test]
fn conduit_cuts_the_tenets_for_each_blow_that_lands() {
    let (mut room, player, foes) = room_with("deepwatch", false, &[0.0]);
    room.players.get_mut(&player).expect("in").casting.tenets = [0.5, 0.5];
    landed(&mut room, player, SWING, foes[0], HIT);
    landed(&mut room, player, SWING, foes[0], Verdict::Dodged { perfect: false });
    let tenets = room.player(player).expect("in").casting.tenets;
    assert!(close(tenets[0], 0.52) && close(tenets[1], 0.52), "{tenets:?}");
    // The page is told as a Tenet comes ready, not at every blow.
    let changed = |room: &mut Room| std::mem::take(&mut room.players.get_mut(&player).expect("in").gear_changed);
    changed(&mut room);
    landed(&mut room, player, SWING, foes[0], HIT);
    assert!(!changed(&mut room), "a cut that readies nothing sends no gear");
    room.players.get_mut(&player).expect("in").casting.tenets = [0.99, 0.5];
    landed(&mut room, player, SWING, foes[0], HIT);
    assert!(changed(&mut room), "one that readies a Tenet does");
}

#[test]
fn a_shorter_linked_given_over_a_sunwells_keeps_its_share() {
    let (mut room, player, _) = room_with("deepwatch", false, &[]);
    room.give(player, Status::Linked, Some(600), Some(player));
    room.spells.linked.insert(player, 1.5);
    room.give(player, Status::Linked, Some(180), Some(player));
    assert_eq!(room.spells.linked.get(&player), Some(&1.5), "the longer Linked held, its share with it");
    room.give(player, Status::Linked, Some(900), Some(player));
    assert_eq!(room.spells.linked.get(&player), None, "one that outlasts it heals as written");
}

#[test]
fn an_arrow_on_a_foe_slain_this_tick_leaps_nowhere() {
    let (mut room, player, foes) = room_with("gullwing", false, &[0.0, 6.0]);
    let held = room.held(player, Slot::Ranged).expect("a player");
    if let Some(foe) = room.foes.get_mut(&foes[0]) {
        foe.fighter.health = 1.0;
    }
    for _ in 0..2 {
        let shot = combat::shots::loose(player, Ranged::Bow, [0.0, 0.0, 1.0], 0.0, 0.0, 1.2);
        room.shots.push((shot, Some(crate::power::Loosed { aimed: true, ..held })));
    }
    for _ in 0..10 {
        room.fly_shots();
    }
    assert_eq!(told(&room, How::Leap).len(), 1, "the arrow that slew it leaps; the one on its body does not");
}

#[test]
fn an_arrow_takes_the_perks_of_the_bow_it_was_loosed_from_whatever_is_worn_as_it_lands() {
    // Gullwing carried, a plain bow worn in its place: answers the plain bow's number.
    let swap = |room: &mut Room, player: PlayerId| {
        let character = &mut room.players.get_mut(&player).expect("in").character;
        let id = character.take_id();
        if let Some((_, at)) = character.items.get_mut(&WORN) {
            *at = At::Carried;
        }
        character.items.insert(id, (Item::new(id, Kind::Bow, Rarity::Rare, 20, Slot::Ranged), At::Worn(Slot::Ranged)));
        id
    };
    // Loosed from Gullwing, which is taken off as the arrow flies: it leaps.
    let (mut room, player, _) = room_with("gullwing", false, &[0.0, 6.0]);
    let held = room.held(player, Slot::Ranged).expect("a player");
    let shot = combat::shots::loose(player, Ranged::Bow, [0.0, 0.0, 1.0], 0.0, 0.0, 1.2);
    room.shots.push((shot, Some(crate::power::Loosed { aimed: true, ..held })));
    swap(&mut room, player);
    for _ in 0..10 {
        room.fly_shots();
    }
    assert_eq!(told(&room, How::Leap).len(), 1, "Gullwing's arrow leaps though Gullwing is put away");
    // Loosed from a plain bow, Gullwing worn as it flies: it does not.
    let (mut room, player, _) = room_with("gullwing", false, &[0.0, 6.0]);
    let plain = swap(&mut room, player);
    let held = room.held(player, Slot::Ranged).expect("a player");
    assert_eq!(held.item, Some(plain));
    let shot = combat::shots::loose(player, Ranged::Bow, [0.0, 0.0, 1.0], 0.0, 0.0, 1.2);
    room.shots.push((shot, Some(crate::power::Loosed { aimed: true, ..held })));
    if let Some(character) = room.players.get_mut(&player).map(|found| &mut found.character) {
        character.items.get_mut(&plain).expect("held").1 = At::Carried;
        character.items.get_mut(&WORN).expect("held").1 = At::Worn(Slot::Ranged);
    }
    for _ in 0..10 {
        room.fly_shots();
    }
    assert!(told(&room, How::Leap).is_empty(), "a plain bow's arrow, Gullwing worn as it lands");
}

#[test]
fn a_shot_loosed_from_the_draw_is_marked_aimed_as_it_leaves() {
    let (mut room, player, _) = room_with("gullwing", false, &[]);
    let fighter = *room.fighter(player).expect("in");
    for (power, aimed) in [(1.0, false), (1.2, true), (0.9, true)] {
        let shot = combat::shots::loose(player, Ranged::Bow, [0.0, 0.0, 1.0], 0.0, 0.0, power);
        room.happened(player, &fighter, Some(combat::Happening::Loosed(shot)), &[]);
        let loosed = room.shots.last().and_then(|(_, loosed)| *loosed).expect("loosed by a player");
        assert_eq!(loosed.aimed, aimed, "power {power}");
    }
}

#[test]
fn swell_builds_with_kills_for_ten_seconds_to_half_again_and_the_ninth_bursts_on_the_ninth_swing() {
    let (mut room, player, foes) = room_with("the_ninth_wave", true, &[0.0, 3.0, 9.0]);
    let plain = room.empower(blow(player, SWING), foes[2]).damage;
    let share = |room: &Room| (room.empower(blow(player, SWING), foes[2]).damage / plain * 10.0).round() / 10.0;
    for kills in 1..=6 {
        let foe = stand(&mut room, 20.0);
        landed(&mut room, player, SWING, foe, KILL);
        assert_eq!(share(&room), 1.0 + 0.1 * f64::from(kills.min(5)), "{kills} kills");
    }
    room.clock += u64::from(ticks(10.0));
    assert_eq!(share(&room), 1.0, "run out");
    let foe = stand(&mut room, 20.0);
    landed(&mut room, player, SWING, foe, KILL);
    assert_eq!(share(&room), 1.1, "begun again");

    let (mut room, player, foes) = room_with("the_ninth_wave", true, &[0.0, 3.0, 9.0]);
    for swing in 1..=9 {
        room.clock += 30;
        // A sweep that strikes two foes counts once.
        for foe in [foes[0], foes[2]] {
            room.settle(&blow(player, SWING), How::Swing, foe, HIT, Some(Slot::Melee));
        }
        assert_eq!(taken(&room, foes[1]) > 0.0, swing == 9, "swing {swing}");
    }
    assert!(close(taken(&room, foes[1]), 5.0), "half the blow");
    assert_eq!(told(&room, How::Burst), vec![(foes[1], Some(foes[0]), Element::Volt as u8)]);
}

#[test]
fn nothing_chains_from_a_chain_and_its_kill_pays_the_loadout() {
    let (mut room, player, foes) = room_with("the_drowned_oath", true, &[0.0, 3.0]);
    let chain = blow(player, BlowKind::Spell(CHAIN));
    room.settle(&chain, How::Burst, foes[0], KILL, Some(Slot::Melee));
    assert_eq!(taken(&room, foes[1]), 0.0, "no Pulled Under from a burst's kill");
    let (mut room, player, foes) = room_with("lanternfall", true, &[0.0, 3.0]);
    room.foes.get_mut(&foes[1]).expect("in").fighter.health = 1.0;
    landed(&mut room, player, BlowKind::Shot(Ranged::Thunderlock), foes[0], KILL);
    let slain = room.foes.get(&foes[1]).expect("still lying");
    assert!(slain.fighter.dead(), "the burst killed it");
    assert_eq!(slain.struck_by.get(&player).map(|struck| struck.1), Some(Slot::Ranged), "shared by the Ranged");
    assert_eq!(told(&room, How::Burst).len(), 1, "and burst no more");
}
