//! Gear in the room: blows by power and level, foes at their level, kills paid and Vestiges laid and picked up, asks
//! answered where the player stands, and arms taken from the gear worn.

use super::*;
use crate::asks::{NOT_THE_TEST_GROUND, OUT_OF_REACH, answer_code};
use combat::arms::{OffHand, Stroke, WeaponClass};
use combat::{CombatInput, Intent};
use gear::{Ask, Rarity, Refusal, Slot, Vestige};
use movement::Controls;
use std::collections::BTreeMap;

const SWORD: u32 = 2;

fn room() -> Room {
    Room::new(Vec::new(), (0.0, 0.0))
}

fn stand(room: &mut Room, role: ::foes::Role, level: u8, y: f64) -> FighterId {
    let (foe_type, rank) = foes::pirate_in(role).expect("a role the pirates fill");
    stand_type(room, foe_type, rank, level, y)
}

/// Captain Brannoc Thule, a Boss, whose kill always leaves a Vestige.
fn stand_boss(room: &mut Room, level: u8, y: f64) -> FighterId {
    stand_type(room, ::foes::foe_type(12).expect("Thule"), ::foes::Rank::Boss, level, y)
}

fn stand_type(room: &mut Room, foe_type: &'static ::foes::FoeType, rank: ::foes::Rank, level: u8, y: f64) -> FighterId {
    let id = room.next_id();
    let (mut fighter, brain) = ::foes::spawn(foe_type, rank, 0.0, y, core::f64::consts::PI);
    fighter.health *= gear::power::foe_health_times(level);
    fighter.health_max = fighter.health;
    let struck_by = BTreeMap::new();
    room.foes.insert(id, Foe { fighter, brain, caller: None, level, struck_by, shield: None });
    id
}

fn asking(sequence: u32, room: &Room, combat: CombatInput) -> Input {
    let controls = Controls { yaw: 0.0, ..Controls::default() };
    Input { sequence, intent: Intent { controls, combat }, arms: SWORD, seen: room.clock(), ..Input::default() }
}

/// The player chops once and waits for it to land; the events it set off.
/// One swing and its 30 ticks, the chain's first each time, the side cut (`chain.rs`).
fn chop(room: &mut Room, player: PlayerId, from: u32) -> Vec<Event> {
    room.players.get_mut(&player).expect("in").chain = crate::chain::Chain::default();
    let chop = CombatInput { attack: Some(Stroke::Left), ..CombatInput::default() };
    for sequence in from..from + 30 {
        let held = if sequence == from { chop } else { CombatInput::default() };
        room.input(player, asking(sequence, room, held)).unwrap();
        room.tick();
    }
    room.take_events()
}

/// The player asks once, as long after their last ask as the room takes them, and the room answers.
fn ask(room: &mut Room, player: PlayerId, sequence: u32, asked: Asked) -> u8 {
    for _ in 0..crate::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    room.input(player, Input { ask: Some(asked), ..asking(sequence, room, CombatInput::default()) }).unwrap();
    room.tick();
    room.player(player).expect("in the room").answer
}

/// Whether the player's gear is sent to them once the room next may send it.
fn sent(room: &mut Room, player: PlayerId) -> bool {
    for _ in 0..crate::players::GEAR_EVERY_TICKS {
        room.tick();
    }
    room.take_gear_change(player)
}

fn move_to(room: &mut Room, player: PlayerId, x: f64, y: f64) {
    let mut fighter = *room.fighter(player).expect("in the room");
    fighter.body.x = x;
    fighter.body.y = y;
    room.set_fighter(player, fighter);
}

#[test]
fn a_blow_on_a_levelled_foe_rises_with_attack_and_falls_away_below_it() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let level_one = stand(&mut room, ::foes::Role::Brute, 1, -1.5);
    let events = chop(&mut room, player, 1);
    let hit =
        events.iter().find(|event| event.kind == EventKind::Hit && event.striker == player).expect("the chop lands");
    // A level 1 player's Normal sword of level 1 has 10 Attack: two thirds of a level's rise.
    let times = gear::power::by_player(10, 1, 1) * crate::power::PLAYER_HARM;
    assert!((hit.amount - 14.0 * 0.85 * times).abs() < 1e-9, "{} against {}", hit.amount, 14.0 * 0.85 * times);
    assert_eq!(room.foes[&level_one].struck_by.get(&player).map(|(_, hand)| *hand), Some(Slot::Melee));
    let level_five = stand(&mut room, ::foes::Role::Brute, 5, -40.0);
    let striker = *room.fighter(player).expect("in");
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 0,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = combat::judge::swing_blow(player, &striker, &attack, level_five);
    assert_eq!(room.empower(blow, level_five).damage, 0.0, "four levels below, a player strikes for nothing");
    let foe_blow = combat::judge::swing_blow(level_five, room.fighter(level_five).expect("standing"), &attack, player);
    let struck = room.empower(foe_blow, player).damage;
    let times = gear::power::on_player(room.player(player).expect("in").character.defense(), 1, 5);
    let eased = foe_blow.damage * times * crate::power::FOE_HARM;
    assert!((struck - eased).abs() < 1e-9 && times > 2.0, "and the foe strikes them twice as hard as it would");
}

#[test]
fn a_foe_asked_for_stands_at_its_level_with_its_health_grown() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let asked = Input { spawn: SpawnAsk::by_role(1, 0), spawn_level: 10, ..asking(1, &room, CombatInput::default()) };
    room.input(player, asked).unwrap();
    room.tick();
    let foe = room.foes_seen().next().expect("a skirmisher stood");
    assert_eq!(foe.level, 10);
    assert!((foe.fighter.health - 45.0 * gear::power::foe_health_times(10)).abs() < 1e-9);
    let plain = Input { spawn: SpawnAsk::by_role(1, 0), ..asking(2, &room, CombatInput::default()) };
    room.input(player, plain).unwrap();
    room.tick();
    let unlevelled = room.foes_seen().find(|seen| seen.level == 0).expect("a foe of no level");
    assert_eq!(unlevelled.fighter.health, 45.0, "a foe of no level is combat's own");
}

#[test]
fn a_kill_pays_those_who_struck_it_and_lays_their_vestige_for_them_alone() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let onlooker = room.join().expect("a room with space");
    let brute = stand(&mut room, ::foes::Role::Brute, 0, -1.5);
    let mut weak = *room.fighter(brute).expect("standing");
    weak.health = 1.0;
    room.set_fighter(brute, weak);
    let events = chop(&mut room, player, 1);
    assert!(events.iter().any(|event| event.kind == EventKind::Killed && event.defender == brute));
    let paid = &room.player(player).expect("in").character;
    assert_eq!((paid.xp, paid.materials.aurem), (55, 4), "a Major brute's worth at level 0: 110 and 8, halved");
    assert_eq!(room.player(onlooker).expect("in").character.xp, 0, "striking nothing earns nothing");
    let sword = paid.worn(Slot::Melee).expect("the sword");
    assert_eq!(sword.xp, 55, "the weapon that struck earns it");

    // The brute's own drop is a roll of the room's dice, so the Boss's is told from it and counted from what the
    // player holds.
    let held = room.player(player).expect("in").character.vestiges_held(false);
    let earlier: Vec<u32> = room.drops_for(player).map(|drop| drop.id).collect();
    let captain = stand_boss(&mut room, 0, -8.0);
    room.mark_struck(player, captain, Slot::Melee);
    room.pay_kill(captain);
    let lying: Vec<Drop> = room.drops_for(player).cloned().collect();
    let vestige = lying.iter().find(|drop| matches!(drop.what, Dropped::Vestige(_)) && !earlier.contains(&drop.id));
    let Drop { id, at, .. } = *vestige.expect("a Boss always leaves a Vestige");
    assert_eq!(room.drops_for(onlooker).count(), 0);
    room.tick();
    assert_eq!(room.player(player).expect("in").character.vestiges_held(false), held, "it lies 6 m away");
    move_to(&mut room, player, at[0], at[1]);
    for _ in 0..VESTIGE_REST_TICKS {
        room.tick();
    }
    assert_eq!(room.player(player).expect("in").character.vestiges_held(false), held + 1, "walked over, it is taken");
    assert!(room.drops_for(player).all(|drop| drop.id != id));
}

#[test]
fn a_vestige_left_lying_goes_to_the_mail_after_two_minutes() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let captain = stand_boss(&mut room, 0, -30.0);
    room.mark_struck(player, captain, Slot::Melee);
    room.pay_kill(captain);
    let rarity = room.drops_for(player).find_map(|drop| match &drop.what {
        Dropped::Vestige(vestige) => Some(vestige.rarity),
        _ => None,
    });
    assert!(rarity.is_some(), "the Captain dropped a Vestige");
    assert_eq!(room.drops_for(player).filter(|drop| matches!(drop.what, Dropped::Vestige(_))).count(), 1);
    for _ in 0..DROP_TICKS {
        room.tick();
    }
    assert_eq!(room.drops_for(player).count(), 0);
    let character = &room.player(player).expect("in").character;
    assert_eq!(character.vestiges_held(false), 0);
    let posted: Vec<_> = character.mail.iter().filter_map(|letter| letter.vestige.as_ref()).collect();
    assert_eq!(posted.iter().map(|vestige| vestige.rarity).collect::<Vec<_>>(), rarity.into_iter().collect::<Vec<_>>());
}

#[test]
fn asks_are_answered_where_the_player_stands() {
    let mut room = room();
    room.furnish(Some([20.0, 0.0]), vec![ResourceNode { x: 0.0, y: 10.0, resource: 0 }]);
    let player = room.join().expect("a room with space");
    let vestige = Vestige::new(500, Rarity::Magic, Slot::Legs, 3);
    let character = &mut room.players.get_mut(&player).expect("in").character;
    character.pick_up(vestige);
    let picked = *character.vestiges.keys().max().expect("picked up");
    assert_ne!(picked, 500, "numbered by the character that took it");
    let identify = Asked::Gear(Ask::Identify { vestige: picked });
    assert_eq!(ask(&mut room, player, 1, identify.clone()), answer_code(Err(Refusal::NotHere)));
    move_to(&mut room, player, 18.0, 0.0);
    assert_eq!(ask(&mut room, player, 2, identify), 0, "within reach of the stall");
    let found = room.player(player).expect("in");
    let made = found.character.item(found.identified).expect("what the Vestige opened to");
    assert_eq!((made.kind, made.level), (gear::Kind::Legs, 3));

    assert_eq!(ask(&mut room, player, 3, Asked::Gather { node: 0 }), OUT_OF_REACH, "the node is 20 m off");
    move_to(&mut room, player, 1.0, 9.0);
    assert_eq!(ask(&mut room, player, 4, Asked::Gather { node: 0 }), 0);
    // Held two seconds, it is gathered.
    for _ in 0..crate::asks::GATHER_TICKS {
        room.tick();
    }
    assert_eq!(room.player(player).expect("in").character.materials.resource(0), 3);
    assert_eq!(ask(&mut room, player, 5, Asked::Gather { node: 0 }), OUT_OF_REACH, "spent until they leave");
    assert_eq!(room.player(player).expect("in").answered, 5);
}

#[test]
fn a_social_space_serves_each_ask_at_its_own_counter() {
    use crate::asks::{Counter, CounterKind};
    let mut room = room();
    let counters = [(CounterKind::Mage, [10.0, 0.0]), (CounterKind::Vault, [-10.0, 0.0])];
    room.counters = Some(counters.map(|(kind, at)| Counter { kind, at }).to_vec());
    let player = room.join().expect("a room with space");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    character.pick_up(Vestige::new(1, Rarity::Magic, Slot::Legs, 3));
    let picked = *character.vestiges.keys().max().expect("picked up");
    let identify = Asked::Gear(Ask::Identify { vestige: picked });
    let store = Asked::Gear(Ask::StoreVestige { vestige: picked });
    assert_eq!(ask(&mut room, player, 1, identify.clone()), answer_code(Err(Refusal::NotHere)), "mid-plaza");
    assert!(room.in_social_space(player) && !room.at_mage(player));
    move_to(&mut room, player, 8.0, 1.0);
    assert!(room.at_mage(player));
    assert_eq!(ask(&mut room, player, 2, store.clone()), answer_code(Err(Refusal::NotHere)), "not the vault's");
    move_to(&mut room, player, -9.0, 0.0);
    assert_eq!(ask(&mut room, player, 3, store), 0, "at the vault");
    let vend = Asked::Gear(Ask::Vend { vendor: gear::vendor::Vendor::Weaponsmith, ware: 0, day: 0 });
    assert_eq!(ask(&mut room, player, 4, vend), answer_code(Err(Refusal::NotHere)), "no Weaponsmith here");
    let emblem = Asked::Gear(Ask::BuyEmblem { emblem: 0 });
    assert_eq!(ask(&mut room, player, 5, emblem), answer_code(Err(Refusal::NotHere)), "no Tailor here");
    assert_eq!(crate::asks::counter_for(&Ask::BuyEmblem { emblem: 0 }), Some(CounterKind::Tailor));
}

#[test]
fn the_bounty_board_takes_bounties_at_its_own_counter_alone() {
    use crate::asks::{Counter, CounterKind};
    let mut room = room();
    room.counters = Some(vec![Counter { kind: CounterKind::Board, at: [10.0, 0.0] }]);
    room.set_minute(29_919_420);
    let player = room.join().expect("a room with space");
    room.players.get_mut(&player).expect("in").character.story.prologue = true;
    let take = Asked::Gear(Ask::TakeBounty { place: 2, day: 20_778 });
    assert_eq!(ask(&mut room, player, 1, take.clone()), answer_code(Err(Refusal::NotHere)), "mid-plaza");
    move_to(&mut room, player, 8.0, 0.0);
    assert_eq!(ask(&mut room, player, 2, take), 0, "at the board");
    assert_eq!(room.player(player).expect("in").character.activity.today.bounties.get(&2), Some(&0));
    assert_eq!(crate::asks::counter_for(&Ask::TurnInBounty { place: 2, day: 20_778 }), Some(CounterKind::Board));
}

#[test]
fn the_mail_hands_over_its_letters_at_its_own_counter_alone() {
    use crate::asks::{Counter, CounterKind};
    use gear::mail::{Posted, Source};
    let mut room = room();
    let mage = Counter { kind: CounterKind::Mage, at: [-10.0, 0.0] };
    room.counters = Some(vec![Counter { kind: CounterKind::Mail, at: [10.0, 0.0] }, mage]);
    let player = room.join().expect("a room with space");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    character.post(Source::LeftLying, Posted::Vestige(Vestige::new(0, Rarity::Rare, Slot::Head, 4)));
    let take = Asked::Gear(Ask::TakeLetter { letter: character.mail[0].id });
    assert_eq!(ask(&mut room, player, 1, take.clone()), answer_code(Err(Refusal::NotHere)), "mid-plaza");
    move_to(&mut room, player, -8.0, 0.0);
    assert_eq!(ask(&mut room, player, 2, take.clone()), answer_code(Err(Refusal::NotHere)), "at the Mage's");
    move_to(&mut room, player, 8.0, 0.0);
    assert_eq!(ask(&mut room, player, 3, take), 0, "at the mail counter");
    let character = &room.player(player).expect("in").character;
    assert!(character.mail.is_empty() && character.vestiges_held(false) == 1);
    assert_eq!(crate::asks::counter_for(&Ask::TakeAllLetters), Some(CounterKind::Mail));
}

#[test]
fn walking_to_or_from_the_mage_sends_the_gear_again() {
    use crate::asks::{Counter, CounterKind};
    let mut room = room();
    room.counters = Some(vec![Counter { kind: CounterKind::Mage, at: [10.0, 0.0] }]);
    let player = room.join().expect("a room with space");
    assert!(sent(&mut room, player), "on joining");
    assert!(!sent(&mut room, player), "nothing changed");
    move_to(&mut room, player, 9.0, 0.0);
    assert!(sent(&mut room, player), "at the Mage, whose Open the page now shows");
    assert!(!sent(&mut room, player));
    move_to(&mut room, player, -9.0, 0.0);
    assert!(sent(&mut room, player), "away again");
}

#[test]
fn the_test_ground_alone_grants_gear() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let grant = Asked::Grant(Grant::Named("harbourwarden".to_owned()));
    assert_eq!(ask(&mut room, player, 1, grant.clone()), 0);
    let held = &room.player(player).expect("in").character;
    let named = held.items.values().find(|(item, _)| item.named.as_deref() == Some("harbourwarden"));
    assert!(named.is_some_and(|(item, _)| item.rarity == Rarity::Legendary && item.attack() == Some(248)));
    assert_eq!(ask(&mut room, player, 2, Asked::Grant(Grant::Xp(190_000))), 0);
    assert_eq!(room.player(player).expect("in").character.level(), 20);
    room.section = Some(Section {
        ring: vec![[-50.0, -50.0], [50.0, -50.0], [50.0, 50.0]],
        spawns: vec![[0.0, 0.0]],
        falls_kill: false,
    });
    assert_eq!(ask(&mut room, player, 3, grant), NOT_THE_TEST_GROUND, "a node's room hands nothing out");
}

#[test]
fn a_player_holds_only_what_their_gear_puts_in_their_hands() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let warhammer = combat::arms::Arms { melee: WeaponClass::Warhammer, ranged: None, off_hand: OffHand::Empty };
    let input = Input { arms: warhammer.code(), ..asking(1, &room, CombatInput::default()) };
    room.input(player, input).unwrap();
    room.tick();
    assert_eq!(room.fighter(player).expect("in").arms, combat::arms::BARE_HANDS, "no warhammer is worn");
    let torch = combat::arms::Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Torch };
    room.input(player, Input { arms: torch.code(), ..asking(2, &room, CombatInput::default()) }).unwrap();
    room.tick();
    assert_eq!(room.fighter(player).expect("in").arms, torch, "a torch beside the sword worn");
    crate::power::hold(&mut room, player, gear::Kind::Warhammer);
    let both = combat::arms::Arms { melee: WeaponClass::Warhammer, ..torch };
    room.input(player, Input { arms: both.code(), ..asking(3, &room, CombatInput::default()) }).unwrap();
    for _ in 0..3 {
        room.tick();
    }
    assert_eq!(room.fighter(player).expect("in").arms, combat::arms::BARE_HANDS, "no hand is left for a torch");
}

#[test]
fn a_players_gear_is_theirs_to_be_sent_whenever_it_changes() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    assert!(room.take_gear_change(player), "sent once on joining");
    assert!(!sent(&mut room, player));
    room.input(player, asking(1, &room, CombatInput::default())).unwrap();
    room.tick();
    assert!(!sent(&mut room, player), "an input that asks nothing changes nothing");
    ask(&mut room, player, 2, Asked::Gear(Ask::TakeOff { slot: Slot::Head }));
    assert!(room.take_gear_change(player));
    room.players.get_mut(&player).expect("in").gear_changed = true;
    assert!(!room.take_gear_change(player), "not so soon after the last send");
    assert!(sent(&mut room, player), "but once the room may send again");
    assert!(room.player(player).is_some_and(|found| found.character.worn(Slot::Head).is_none()));
}

#[test]
fn a_blow_that_cannot_harm_its_foe_shares_nothing_of_its_kill() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    let foe = stand(&mut room, ::foes::Role::Brute, 9, -1.5);
    let striker = *room.fighter(player).expect("in");
    let attack = combat::fighter::Attack {
        stroke: Stroke::Down,
        elapsed: 0,
        strike: 24,
        end: 60,
        swing: combat::fighter::Swing::Plain,
        left_hand: false,
    };
    let blow = room.empower(combat::judge::swing_blow(player, &striker, &attack, foe), foe);
    assert_eq!(blow.damage, 0.0, "eight levels below");
    room.settle(&blow, How::Swing, foe, Verdict::Hit { damage: 0.0, poise: 0.0 }, Some(Slot::Melee));
    assert!(room.foes[&foe].struck_by.is_empty(), "no share of a kill it could not help");
}

#[test]
fn a_node_whose_resource_is_full_is_left_standing() {
    let mut room = room();
    room.furnish(None, vec![ResourceNode { x: 0.0, y: 1.0, resource: 0 }]);
    let player = room.join().expect("a room with space");
    let most = gear::character::STOCK_MOST;
    room.players.get_mut(&player).expect("in").character.materials.add(gear::character::Stuff::Resource(0), most);
    assert_eq!(ask(&mut room, player, 1, Asked::Gather { node: 0 }), crate::asks::STOCK_FULL);
    assert!(room.player(player).expect("in").spent.is_empty(), "not spent");
}

#[test]
fn asks_wait_their_turn_and_one_that_changes_how_a_player_fights_is_sent_at_once() {
    let mut room = room();
    let player = room.join().expect("a room with space");
    assert!(room.take_gear_change(player), "sent once on joining");
    for slot in [Slot::Head, Slot::Torso, Slot::Legs] {
        room.take_ask(player, Asked::Gear(Ask::TakeOff { slot }));
    }
    let answered = |room: &Room| room.player(player).expect("in").answered;
    assert_eq!(answered(&room), 1, "the first at once, the rest held");
    assert!(!room.take_gear_change(player), "armour changes nothing of the fight, so it waits its turn");
    for _ in 0..=2 * crate::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    assert_eq!(answered(&room), 3, "each in its turn, none let go");
    let character = &room.player(player).expect("in").character;
    assert!([Slot::Head, Slot::Torso, Slot::Legs].iter().all(|slot| character.worn(*slot).is_none()));

    for _ in 0..crate::asks::ASK_EVERY_TICKS {
        room.tick();
    }
    room.players.get_mut(&player).expect("in").gear_changed = true;
    assert!(room.take_gear_change(player), "sent, so the next must wait");
    room.take_ask(player, Asked::Gear(Ask::TakeOff { slot: Slot::Melee }));
    assert!(room.take_gear_change(player), "a hand emptied changes how they fight: sent at once");
}

#[test]
fn a_shield_takes_blows_before_health_and_its_own_element_breaks_it_fastest() {
    use gear::element::{Element, MATCHED, MISMATCHED, Shield};
    let mut room = room();
    let player = room.join().expect("a room with space");
    // Each blow on a foe stood fresh, its shield whole, so its own answer never spoils the next.
    let strike = |room: &mut Room, element: Option<Element>, left: f64, from: u32| {
        room.foes.clear();
        for _ in 0..120 {
            room.tick();
        }
        let foe = stand(room, ::foes::Role::Brute, 1, -1.5);
        room.foes.get_mut(&foe).expect("stood").shield = Some(Shield { left, ..Shield::whole(Element::Volt, 1_000.0) });
        let character = &mut room.players.get_mut(&player).expect("in").character;
        for (item, at) in character.items.values_mut() {
            if *at == gear::At::Worn(Slot::Melee) {
                item.element = element;
            }
        }
        let health = room.foes[&foe].fighter.health;
        let events = chop(room, player, from);
        let took = events.iter().find(|event| event.kind == EventKind::Shielded).map_or(0.0, |event| event.amount);
        let broke = events.iter().any(|event| event.kind == EventKind::ShieldBroken);
        let poise = room.foes[&foe].fighter.poise;
        (took, broke, health - room.foes[&foe].fighter.health, poise)
    };
    let (plain, broke, harmed, poise) = strike(&mut room, None, 500.0, 1);
    assert!(plain > 0.0 && !broke);
    assert_eq!(harmed, 0.0, "nothing reaches its health while the shield holds");
    assert_eq!(poise, 0.0, "nor its poise");
    let (matched, ..) = strike(&mut room, Some(Element::Volt), 500.0, 31);
    let (other, ..) = strike(&mut room, Some(Element::Blaze), 500.0, 61);
    assert!((matched - plain * MATCHED).abs() < 1e-6, "{matched} against {plain}");
    assert!((other - plain * MISMATCHED).abs() < 1e-6, "{other} against {plain}");
    // A shield almost gone breaks under the next blow, and the rest of that blow reaches health.
    let (_, broke, harmed, _) = strike(&mut room, None, 1.0, 91);
    assert!(broke);
    assert!((harmed - (plain - 1.0)).abs() < 1e-6, "{harmed}");
}

#[test]
fn the_test_grounds_hands_pass_over_a_carried_weapon_above_the_players_level_and_hand_out_one_of_theirs() {
    use crate::asks::Grant;
    use gear::Kind;
    let mut room = room();
    let player = room.join().expect("a room with space");
    room.answer(player, Asked::Grant(Grant::Item { kind: Kind::Crossbow, rarity: Rarity::Normal, level: 50 }));
    let ranged = |room: &Room| room.player(player).and_then(|found| found.character.worn(Slot::Ranged)).cloned();
    let crossbows = |room: &Room| {
        room.player(player)
            .expect("in")
            .character
            .items
            .values()
            .filter(|(item, _)| item.kind == Kind::Crossbow)
            .count()
    };
    for kind in [Kind::Crossbow, Kind::Bow, Kind::Crossbow] {
        room.answer(player, Asked::Grant(Grant::Worn(kind)));
        assert_eq!(room.player(player).expect("in").answer, 0, "{kind:?} worn, never refused as too high");
        let worn = ranged(&room).expect("a Ranged weapon worn");
        assert_eq!((worn.kind, worn.level), (kind, 1));
    }
    assert_eq!(crossbows(&room), 2, "the level 50 one kept, and the one handed out worn again");
}

#[test]
fn the_test_grounds_hands_pass_over_a_carried_atheric_while_another_loadout_wears_one() {
    use crate::asks::Grant;
    use gear::{Item, Kind, character::At};
    let mut room = room();
    let player = room.join().expect("a room with space");
    let character = &mut room.players.get_mut(&player).expect("in").character;
    let [mace, bow] = [Kind::Mace, Kind::Bow].map(|kind| {
        let id = character.take_id();
        character.items.insert(id, (Item::new(id, kind, Rarity::Atheric, 1, kind.slot()), At::Carried));
        id
    });
    room.answer(player, Asked::Grant(Grant::Worn(Kind::Mace)));
    room.answer(player, Asked::Grant(Grant::Worn(Kind::Bow)));
    let found = room.player(player).expect("in");
    assert_eq!(found.answer, 0, "a bow worn, not refused for its Atheric");
    let worn = found.character.worn(Slot::Ranged).expect("a bow worn");
    assert_eq!((worn.kind, worn.rarity), (Kind::Bow, Rarity::Normal), "a Normal one handed out");
    assert_eq!(found.character.at(bow), Some(At::Carried), "the Atheric one still carried");
    assert_eq!(found.character.at(mace), Some(At::Worn(Slot::Melee)), "the Atheric mace carried was worn");
}

#[test]
fn a_kills_pay_by_rank_is_its_ranks_health_against_a_majors() {
    let foe_type = ::foes::foe_type(14).expect("the pirates' swordsman");
    let major = foe_type.numbers(::foes::Rank::Major, 1).health;
    for (rank, pay) in ::foes::Rank::ALL.into_iter().zip(gear::rewards::RANK_PAY) {
        assert!((foe_type.numbers(rank, 1).health / major - pay).abs() < 1e-12, "{rank:?}");
    }
}

/// The fight measured for the balance's record: a level 1 player with the starting sword, swinging and never
/// guarding, against one level 1 foe of each rank; felling it with the player's health held whole, and being felled
/// by it standing still. Run by hand to print the table:
/// `cargo test -p room --release measure_blows -- --ignored --nocapture`.
#[test]
#[ignore = "a measurement, printed by hand in release"]
fn measure_blows() {
    use ::foes::Rank;
    let rows = [
        ("Minor Swordsman", 14, Rank::Minor),
        ("Major Hookman", 8, Rank::Major),
        ("Major Brute", 15, Rank::Major),
        ("Elite Captain", 17, Rank::Elite),
        ("Miniboss Captain", 17, Rank::Miniboss),
        ("Boss (Thule)", 12, Rank::Boss),
    ];
    eprintln!("| Foe | Felled in | Fells the player in |");
    for (name, number, rank) in rows {
        let foe_type = ::foes::foe_type(number).expect("a type");
        let mut arena = room();
        let player = arena.join().expect("a room with space");
        let foe = stand_type(&mut arena, foe_type, rank, 1, -1.5);
        let (mut landed, mut ticks) = (0, 0_u32);
        while ticks < 60 * 600 {
            let (me, them) = (*arena.fighter(player).expect("in"), arena.fighter(foe).copied());
            let Some(them) = them.filter(|found| !found.dead()) else { break };
            arena.set_fighter(player, combat::fighter::Fighter { health: me.health_max, ..me });
            let attack = (ticks % 30 == 0).then_some(Stroke::Down);
            let mut input = asking(ticks + 1, &arena, CombatInput { attack, ..CombatInput::default() });
            input.intent.controls.yaw = combat::sight::bearing([me.body.x, me.body.y], [them.body.x, them.body.y]);
            let near = libm::hypot(me.body.x - them.body.x, me.body.y - them.body.y);
            input.intent.controls.forward = if near > 1.6 { 1.0 } else { 0.0 };
            arena.input(player, input).unwrap();
            arena.tick();
            ticks += 1;
            let hits = arena.take_events();
            landed += hits.iter().filter(|hit| hit.kind == EventKind::Hit && hit.striker == player).count();
        }
        let mut arena = room();
        let player = arena.join().expect("a room with space");
        stand_type(&mut arena, foe_type, rank, 1, -1.5);
        let mut felled = 0_u32;
        while felled < 60 * 600 && !arena.fighter(player).expect("in").dead() {
            arena.input(player, asking(felled + 1, &arena, CombatInput::default())).unwrap();
            arena.tick();
            felled += 1;
        }
        let seconds = |ticks: u32| f64::from(ticks) / 60.0;
        eprintln!("| {name} | {landed} blows, {:.1} s | {:.1} s |", seconds(ticks), seconds(felled));
    }
}

#[test]
fn the_vendors_day_turns_at_nine_utc_and_every_player_is_sent_the_new_wares() {
    let mut room = Room::new(Vec::new(), (0.0, 0.0));
    let player = room.join().expect("a room with space");
    room.set_minute(29_919_419); // A Friday, 08:59 UTC.
    assert_eq!(room.day(), 20_777);
    assert!(room.take_gear_change(player));
    room.set_minute(29_919_419);
    assert!(!room.player(player).expect("in").gear_changed, "the same day sends nothing");
    room.set_minute(29_919_420);
    assert_eq!(room.day(), 20_778);
    assert!(room.player(player).expect("in").gear_changed, "the new day's wares go out");
    let here = room.here(player, &gear::Ask::UseCrate);
    assert_eq!((here.day, here.week), (20_778, 2_968));
}

#[test]
fn a_ware_shown_before_nine_utc_sells_till_then_and_is_refused_once_the_day_turns() {
    use crate::asks::{Counter, CounterKind};
    use gear::vendor::Vendor;
    let mut room = room();
    room.counters = Some(vec![Counter { kind: CounterKind::Vendor(Vendor::Weaponsmith), at: [10.0, 0.0] }]);
    room.set_minute(29_919_419); // A Friday, 08:59 UTC: still the clock's day 20,777.
    let player = room.join().expect("a room with space");
    move_to(&mut room, player, 8.0, 0.0);
    room.players.get_mut(&player).expect("in").character.materials.add_aurem(10_000);
    let vend = |day| Asked::Gear(Ask::Vend { vendor: Vendor::Weaponsmith, ware: 0, day });
    assert_eq!(ask(&mut room, player, 1, vend(20_777)), 0, "sold at 08:59 as that day's");
    room.set_minute(29_919_420);
    assert_eq!(ask(&mut room, player, 2, vend(20_777)), answer_code(Err(Refusal::NotSold)), "shown before 09:00");
    assert_eq!(ask(&mut room, player, 3, vend(20_778)), 0, "the new day's");
}

#[test]
fn returning_to_the_ship_waits_ten_seconds_past_a_foes_blow_and_is_refused_while_fallen() {
    use crate::asks::{Asked, FALLEN, FIGHTING, TO_SHIP};
    let mut room = room();
    let player = room.join().expect("a room with space");
    let mut sequence = 0;
    let mut to_ship = |room: &mut Room| {
        for _ in 0..crate::asks::ASK_EVERY_TICKS {
            room.tick();
        }
        sequence += 1;
        let input = crate::Input { sequence, ask: Some(Asked::ToShip), seen: room.clock(), ..crate::Input::default() };
        room.input(player, input).unwrap();
        room.tick();
        room.player(player).expect("in").answer
    };
    assert_eq!(to_ship(&mut room), TO_SHIP, "at peace, a yes no other ask gives");
    let foe = stand_type(&mut room, ::foes::foe_type(14).expect("a type"), ::foes::Rank::Minor, 1, -1.5);
    let whole = room.fighter(player).expect("in").health;
    while room.fighter(player).expect("in").health >= whole {
        room.tick();
        assert!(room.clock() < 60 * 60, "the foe strikes within a minute");
    }
    room.foes.remove(&foe);
    let struck = room.clock();
    let kept = room.player(player).expect("in").struck_at;
    assert!(kept.is_some_and(|tick| tick + 1 >= struck && tick <= struck), "the blow's tick kept: {kept:?}");
    assert_eq!(to_ship(&mut room), FIGHTING, "struck a moment ago");
    while room.clock() <= room.player(player).expect("in").struck_at.unwrap() + 600 {
        room.tick();
    }
    assert_eq!(to_ship(&mut room), TO_SHIP, "ten seconds past the blow");
    let mut fallen = *room.fighter(player).expect("in");
    fallen.action = combat::Action::Dead { elapsed: 0 };
    room.set_fighter(player, fallen);
    assert_eq!(to_ship(&mut room), FALLEN, "fallen, they wait to stand again");
}

#[test]
fn a_page_saying_its_player_is_mounted_rides_only_with_a_horse_and_never_on_a_boarded_deck() {
    let ask_mounted = |room: &mut Room, player: PlayerId, sequence: u32| {
        let mut input = asking(sequence, room, CombatInput::default());
        input.intent.controls.mounted = true;
        room.input(player, input).unwrap();
        room.tick();
        room.player(player).expect("in").mounted
    };
    let mut room = room();
    let player = room.join().expect("a room with space");
    assert!(ask_mounted(&mut room, player, 1), "on the horse every rider starts with");
    room.players.get_mut(&player).expect("in").character.cosmetics.coat.clear();
    assert!(!ask_mounted(&mut room, player, 2), "without one, on foot");
    let mut deck = Room::deck(&crate::deck::test_deck(), 1, ::foes::Rank::Minor, 1);
    let boarder = deck.join().expect("a deck with space");
    assert!(!ask_mounted(&mut deck, boarder, 1), "no horse comes aboard");
}
