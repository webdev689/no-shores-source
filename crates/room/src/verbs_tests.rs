//! The weapons' perks that give a status or cut the Arts' cooldowns, which the room alone applies as a blow lands or a
//! foe falls: Exposing Strikes, Thunderclap, Exploit, Marked Shot, Shocking Rounds, Keen Eye, Attuned and Spellfeed.

use crate::foes::Foe;
use crate::perks::trim_of;
use crate::{FighterId, How, PlayerId, Room, loadout_arms};
use combat::{Blow, BlowKind, Fighter, Ranged, Status, Stroke, Trim, Verdict};
use gear::{At, Element, Item, Kind, Rarity, Slot};
use std::collections::BTreeMap;

const SWORDSMAN: u8 = ::foes::roster::COLLECTOR;
const SWING: BlowKind = BlowKind::Swing(Stroke::Down);
const HIT: Verdict = Verdict::Hit { damage: 10.0, poise: 0.0 };
/// The item `room_wearing` puts on the player.
const WORN: u32 = 99;

/// A room with a player wearing a Legendary of `kind` whose first column offers `perk`, bought and chosen, holding
/// it drawn, and two hostile swordsmen before them.
fn room_wearing(kind: Kind, perk: &str) -> (Room, PlayerId, [FighterId; 2]) {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    wear(&mut room, player, WORN, kind, perk);
    let fighter = *room.fighter(player).expect("in");
    room.set_fighter(player, Fighter { arms: loadout_arms(kind), ..fighter });
    room.retrim(player);
    let foes = [stand(&mut room, 0.0, -1.5), stand(&mut room, 1.0, -1.5)];
    (room, player, foes)
}

/// Wears item `id`, a Legendary of `kind` whose first column offers `perk`, bought and chosen, in its kind's slot.
fn wear(room: &mut Room, player: PlayerId, id: u32, kind: Kind, perk: &str) {
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let mut item = Item::new(id, kind, Rarity::Legendary, 20, kind.slot());
    item.layout = vec![vec![perk.to_owned()]];
    item.bought |= item.node_bit(0, 0).expect("a node");
    item.chosen[0] = 0;
    if let Some(worn) = character.worn(kind.slot()).map(|worn| worn.id) {
        character.items.remove(&worn);
    }
    character.items.insert(id, (item, At::Worn(kind.slot())));
}

fn stand(room: &mut Room, x: f64, y: f64) -> FighterId {
    let id = room.next_id();
    let foe_type = ::foes::foe_type(SWORDSMAN).expect("the hostiles' swordsman");
    let (fighter, brain) = ::foes::spawn(foe_type, ::foes::Rank::Major, x, y, 0.0);
    let fighter = Fighter { health: 1000.0, health_max: 1000.0, ..fighter };
    room.foes.insert(id, Foe { fighter, brain, caller: None, level: 0, struck_by: BTreeMap::new(), shield: None });
    id
}

fn blow(player: PlayerId, kind: BlowKind) -> Blow {
    Blow {
        striker: player,
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

fn has(room: &Room, fighter: FighterId, status: Status) -> bool {
    room.fighter(fighter).expect("in the room").statuses.has(status)
}

/// One swing a moment after the last, landing on each foe in turn as `verdict`.
fn swing(room: &mut Room, player: PlayerId, on: &[FighterId], verdict: Verdict) {
    room.clock += 30;
    for foe in on {
        room.settle(&blow(player, SWING), How::Swing, *foe, verdict, Some(Slot::Melee));
    }
}

fn shoot(room: &mut Room, player: PlayerId, ranged: Ranged, on: FighterId, verdict: Verdict) {
    room.clock += 30;
    room.settle(&blow(player, BlowKind::Shot(ranged)), How::Shot, on, verdict, Some(Slot::Ranged));
}

#[test]
fn the_verbs_are_the_rooms_alone_and_trim_nothing_a_browser_predicts() {
    let melee = ["exposing_strikes", "thunderclap", "exploit", "keen_eye", "attuned", "spellfeed"];
    let worn = melee.map(|perk| (Kind::Sword, perk)).into_iter();
    for (kind, perk) in worn.chain([(Kind::Bow, "marked_shot"), (Kind::Bow, "shocking_rounds")]) {
        let (room, player, _) = room_wearing(kind, perk);
        let character = &room.player(player).expect("in").character;
        assert!(character.has_drawn_trait(perk, kind.slot()), "{perk} is worn");
        assert_eq!(trim_of(character, kind.slot()), Trim::PLAIN, "{perk}");
    }
}

#[test]
fn a_loadouts_perks_work_only_while_it_is_drawn() {
    let (mut room, player, _) = room_wearing(Kind::Sword, "honed");
    wear(&mut room, player, WORN + 1, Kind::Bow, "quick_hands");
    room.retrim(player);
    let trim = |room: &Room| room.fighter(player).expect("in").trim;
    assert_eq!(trim(&room), Trim { damage: 1.05, ..Trim::PLAIN }, "the sword drawn: its Honed, not the bow's perk");
    let _ = room.take_gear_change(player);
    let bow = loadout_arms(Kind::Bow).code();
    room.input(player, crate::Input { sequence: 1, arms: bow, seen: room.clock(), ..crate::Input::default() }).unwrap();
    room.tick();
    assert_eq!(trim(&room), Trim { reload: 0.85, ..Trim::PLAIN }, "the bow drawn: its Quick Hands alone");
    assert_eq!(room.player(player).expect("in").trim, trim(&room), "the trim their gear carries");
    assert!(room.take_gear_change(player), "sent at once, so their browser predicts them by it");

    let (mut room, player, [exposed, other]) = room_wearing(Kind::Sword, "exploit");
    wear(&mut room, player, WORN + 1, Kind::Bow, "keen_eye");
    assert!(room.give(exposed, Status::Expose, None, None));
    assert!(room.empower(blow(player, SWING), exposed).crit, "the sword's Exploit with the sword drawn");
    swing(&mut room, player, &[other], Verdict::Hit { damage: 5_000.0, poise: 0.0 });
    assert!(!has(&room, player, Status::Crit), "the bow's Keen Eye waits for the bow");
    let fighter = *room.fighter(player).expect("in");
    room.set_fighter(player, Fighter { arms: loadout_arms(Kind::Bow), ..fighter });
    assert!(!room.empower(blow(player, SWING), exposed).crit, "the fists with the bow drawn take no Exploit");
}

#[test]
fn no_weapons_perk_fires_on_a_spells_kill() {
    let kill = Verdict::Hit { damage: 5_000.0, poise: 0.0 };
    for perk in ["bloodletter", "keen_eye", "spellfeed"] {
        let (mut room, player, [first, second]) = room_wearing(Kind::Sword, perk);
        let found = room.players.get_mut(&player).expect("in");
        found.casting.tenets = [0.5, 0.5];
        found.fighter.stamina = 10.0;
        room.settle(&blow(player, BlowKind::Spell(1)), How::Spell, first, kill, Some(Slot::Melee));
        let found = room.player(player).expect("in");
        let unmoved = (found.fighter.stamina, found.casting.tenets, found.fighter.statuses.has(Status::Crit));
        assert_eq!(unmoved, (10.0, [0.5, 0.5], false), "{perk} on a spell's kill");
        swing(&mut room, player, &[second], kill);
        let found = room.player(player).expect("in");
        let moved = (found.fighter.stamina, found.casting.tenets, found.fighter.statuses.has(Status::Crit));
        assert_ne!(moved, unmoved, "{perk} on a swing's kill");
    }
}

#[test]
fn every_third_blow_in_a_row_on_one_foe_exposes_it() {
    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "exposing_strikes");
    swing(&mut room, player, &[first], HIT);
    swing(&mut room, player, &[first], HIT);
    assert!(!has(&room, first, Status::Expose), "two in a row");
    swing(&mut room, player, &[first], HIT);
    assert!(has(&room, first, Status::Expose), "the third");

    let (mut room, player, [first, second_foe]) = room_wearing(Kind::Sword, "exposing_strikes");
    swing(&mut room, player, &[first], HIT);
    swing(&mut room, player, &[first], HIT);
    swing(&mut room, player, &[second_foe], HIT);
    swing(&mut room, player, &[first], HIT);
    assert!(!has(&room, first, Status::Expose), "a blow on another foe starts the row again");
    swing(&mut room, player, &[second_foe, first], HIT);
    swing(&mut room, player, &[first, second_foe], HIT);
    assert!(has(&room, first, Status::Expose), "a sweep that strikes it with others keeps its row");
    assert!(!has(&room, second_foe, Status::Expose), "two in a row on the other");

    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "exposing_strikes");
    swing(&mut room, player, &[first], HIT);
    swing(&mut room, player, &[first], HIT);
    swing(&mut room, player, &[first], Verdict::Parried);
    swing(&mut room, player, &[first], HIT);
    assert!(!has(&room, first, Status::Expose), "a blow parried breaks the row");

    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "light_grip");
    (0..3).for_each(|_| swing(&mut room, player, &[first], HIT));
    assert!(!has(&room, first, Status::Expose), "not without the perk");
}

#[test]
fn a_blow_that_breaks_a_guard_charges_the_foe_with_thunderclap() {
    let broken = Verdict::GuardBroken { damage: 5.0 };
    let (mut room, player, [first, second]) = room_wearing(Kind::Sword, "thunderclap");
    swing(&mut room, player, &[first], broken);
    assert!(has(&room, first, Status::Charge), "Thunderclap");
    shoot(&mut room, player, Ranged::Pistolet, second, broken);
    assert!(!has(&room, second, Status::Charge), "a Melee perk: a shot is no blow");
    swing(&mut room, player, &[second], HIT);
    assert!(!has(&room, second, Status::Charge), "a blow that breaks no guard");
    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "light_grip");
    swing(&mut room, player, &[first], broken);
    assert!(!has(&room, first, Status::Charge), "not without the perk");
}

#[test]
fn blows_on_an_exposed_foe_crit_with_exploit() {
    let (mut room, player, [first, second]) = room_wearing(Kind::Sword, "exploit");
    assert!(room.give(first, Status::Expose, None, None));
    assert!(room.empower(blow(player, SWING), first).crit, "Exploit");
    assert!(!room.empower(blow(player, SWING), second).crit, "a foe not Exposed");
    assert!(!room.empower(blow(player, BlowKind::Shot(Ranged::Bow)), first).crit, "a shot is no blow");
    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "light_grip");
    assert!(room.give(first, Status::Expose, None, None));
    assert!(!room.empower(blow(player, SWING), first).crit, "not without the perk");
}

#[test]
fn a_players_first_shot_to_land_on_a_foe_exposes_it_with_marked_shot() {
    let unexposed = |room: &mut Room, foe: FighterId| {
        let fighter = *room.fighter(foe).expect("standing");
        room.set_fighter(foe, Fighter { statuses: combat::status::Statuses::NONE, ..fighter });
    };
    let (mut room, player, [first, second]) = room_wearing(Kind::Bow, "marked_shot");
    shoot(&mut room, player, Ranged::Bow, first, HIT);
    assert!(has(&room, first, Status::Expose), "the first shot to land on it");
    unexposed(&mut room, first);
    shoot(&mut room, player, Ranged::Bow, first, HIT);
    assert!(!has(&room, first, Status::Expose), "a foe is marked once");
    shoot(&mut room, player, Ranged::Bow, second, Verdict::Dodged { perfect: false });
    assert!(!has(&room, second, Status::Expose), "a shot that does not land marks nothing");
    shoot(&mut room, player, Ranged::Bow, second, HIT);
    assert!(has(&room, second, Status::Expose), "so the next that lands is its first");

    let other = room.join().expect("a room with space");
    wear(&mut room, other, WORN, Kind::Bow, "marked_shot");
    unexposed(&mut room, first);
    shoot(&mut room, other, Ranged::Bow, first, HIT);
    assert!(has(&room, first, Status::Expose), "each player marks a foe their own once");

    shoot(&mut room, player, Ranged::Bow, second, Verdict::Hit { damage: 5_000.0, poise: 0.0 });
    shoot(&mut room, player, Ranged::Bow, first, HIT);
    assert_eq!(room.player(player).expect("in").counts.marked, [first], "a foe that fell is forgotten");

    let (mut room, player, [first, _]) = room_wearing(Kind::Bow, "quick_hands");
    shoot(&mut room, player, Ranged::Bow, first, HIT);
    assert!(!has(&room, first, Status::Expose), "not without the perk");
}

#[test]
fn every_fifth_shot_that_lands_charges_with_shocking_rounds() {
    let (mut room, player, [first, second]) = room_wearing(Kind::Pistolet, "shocking_rounds");
    for _ in 0..4 {
        shoot(&mut room, player, Ranged::Pistolet, first, HIT);
    }
    shoot(&mut room, player, Ranged::Pistolet, first, Verdict::Dodged { perfect: false });
    assert!(!has(&room, first, Status::Charge), "four landed, and one that did not");
    shoot(&mut room, player, Ranged::Pistolet, first, HIT);
    assert!(has(&room, first, Status::Charge), "the fifth that lands");
    for _ in 0..4 {
        shoot(&mut room, player, Ranged::Pistolet, second, HIT);
    }
    assert!(!has(&room, second, Status::Charge), "the count starts again");
    shoot(&mut room, player, Ranged::Pistolet, second, HIT);
    assert!(has(&room, second, Status::Charge), "on any foe");
}

#[test]
fn a_kill_gives_crit_with_keen_eye_and_cuts_the_tenets_with_spellfeed() {
    let kill = Verdict::Hit { damage: 5_000.0, poise: 0.0 };
    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "keen_eye");
    swing(&mut room, player, &[first], HIT);
    assert!(!has(&room, player, Status::Crit), "no kill");
    swing(&mut room, player, &[first], kill);
    let left = room.fighter(player).expect("in").statuses.left(Status::Crit);
    assert_eq!(left, 240, "Crit for 4 s");

    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, "spellfeed");
    room.players.get_mut(&player).expect("in").casting.tenets = [0.5, 0.25];
    swing(&mut room, player, &[first], kill);
    let tenets = room.player(player).expect("in").casting.tenets;
    assert!((tenets[0] - 0.53).abs() < 1e-9 && (tenets[1] - 0.28).abs() < 1e-9, "3% off each: {tenets:?}");
}

/// The damage a blow of `kind` from a sword of `element` and `perk` deals, in a room with Arts or without.
fn struck(perk: &str, element: Element, kind: BlowKind, arts: bool) -> f64 {
    let (mut room, player, [first, _]) = room_wearing(Kind::Sword, perk);
    if !arts {
        room.forbid_arts();
    }
    let found = room.players.get_mut(&player).expect("in");
    found.character.items.get_mut(&WORN).expect("worn").0.element = Some(element);
    room.empower(blow(player, kind), first).damage
}

#[test]
fn a_weapon_in_the_arts_element_strikes_harder_with_attuned() {
    let plain = struck("light_grip", Element::Volt, SWING, true);
    assert!((struck("attuned", Element::Volt, SWING, true) - plain * 1.1).abs() < 1e-9, "Volt, as Storm worn");
    assert!((struck("attuned", Element::Blaze, SWING, true) - plain).abs() < 1e-9, "another element");
    assert!((struck("attuned", Element::Volt, SWING, false) - plain).abs() < 1e-9, "no Art worn here");
    let spell = struck("light_grip", Element::Volt, BlowKind::Spell(1), true);
    assert!(
        (struck("attuned", Element::Volt, BlowKind::Spell(1), true) - spell).abs() < 1e-9,
        "no weapon's perk touches a spell"
    );
}
