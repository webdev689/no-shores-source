//! A player's gear through the door: the course's stall and resource nodes laid out, each player's own gear sent to
//! them alone, and their character as it is kept between sessions, given back to them when they return.

use crate::{Opened, PlayerId, floats_of, hand_over, with_open};
use gear::vendor::Vendor;
use room::asks::{Counter, CounterKind};
use serde::Deserialize;

/// Lays out a course's stall and resource nodes: the stall's x and y (not numbers for none), then each node's x, y
/// and resource, little-endian floats. Answers whether a room on land is open and the numbers made a layout.
pub fn furnish(bytes: &[u8]) -> bool {
    let floats = floats_of(bytes);
    let Some((stall, nodes)) = floats.split_first_chunk::<2>() else { return false };
    if !nodes.len().is_multiple_of(3) || nodes.iter().any(|number| !number.is_finite()) {
        return false;
    }
    let stall = stall.iter().all(|number| number.is_finite()).then_some(*stall);
    let nodes = nodes.chunks_exact(3).map(|node| room::ResourceNode {
        x: node[0],
        y: node[1],
        resource: u8::try_from(node[2] as u32).unwrap_or_default(),
    });
    let nodes = nodes.collect();
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.furnish(stall, nodes);
            true
        }
        Opened::Sea(_) | Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// A player's own gear, as its bytes, when it changed since it was last asked; empty when it did not, or in a room
/// that keeps no gear.
#[must_use]
pub fn gear(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            if room.take_gear_change(player) {
                protocol::gear_wire::gear_bytes(room, player)
            } else {
                None
            }
        }
        // A boarder's gear is their deck room's, which holds their character while they fight on its deck; any other
        // player's, the character the sea keeps for them, once it changed.
        Opened::Sea(sea) if sea.on_deck(player) => {
            sea.deck_gear_change(player).and_then(|(room, boarder)| protocol::gear_wire::gear_bytes(room, boarder))
        }
        Opened::Sea(sea) => {
            let minute = sea.minute;
            sea.take_character_change(player).and_then(|character| sea_gear_bytes(character, minute))
        }
        Opened::Fleet(_) => None,
    })
    .flatten()
    .unwrap_or_default()
}

thread_local! {
    /// A room on land holding one player, made once, that writes a player's gear at sea as a land room writes it.
    static GEAR_ROOM: std::cell::RefCell<Option<(room::Room, PlayerId)>> = const { std::cell::RefCell::new(None) };
}

/// A player's gear at sea, from the character the sea keeps for them: written by a room that holds them alone, so
/// with no drops, nodes, wares or casting, none of which the sea has, at the sea's minute, so its day's bounties are
/// today's.
fn sea_gear_bytes(character: &gear::Character, minute: u64) -> Option<Vec<u8>> {
    GEAR_ROOM.with(|held| {
        let mut held = held.borrow_mut();
        if held.is_none() {
            let mut room = room::Room::new(Vec::new(), (0.0, 0.0));
            *held = room.join().map(|player| (room, player));
        }
        let (room, player) = held.as_mut()?;
        // A player new to the room each time, so no sailor's story is carried into the next one's (`Story::merged`).
        room.leave(*player);
        *player = room.join()?;
        room.set_minute(minute);
        room.restore_character(*player, &character.to_json()).then(|| protocol::gear_wire::gear_bytes(room, *player))?
    })
}

/// The open sea keeps characters from now on (`Sea::keep_characters`): its players' courses wait for the keeper's
/// word. 1 if a sea is open, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_keep_characters() -> u32 {
    let kept = with_open(|opened| match opened {
        Opened::Sea(sea) => {
            sea.keep_characters();
            true
        }
        Opened::Land { .. } | Opened::Fleet(_) => false,
    });
    u32::from(kept == Some(true))
}

/// The keeper has no character to give a player (none kept, or the page plays unkept): at sea the course held for
/// them sails (`Sea::none_kept`); on land the character the room holds is theirs from now on (`Room::none_kept`).
#[unsafe(no_mangle)]
pub extern "C" fn room_none_kept(player: PlayerId) {
    with_open(|opened| match opened {
        Opened::Sea(sea) => sea.none_kept(player),
        Opened::Land { room, .. } => room.none_kept(player),
        Opened::Fleet(_) => {}
    });
}

/// Whether what a player's arrival in the next room is judged by (their dive and the lamps they lit) moved since this
/// was last asked, on land (`Room::take_judged_move`): 1 if it did. Asking clears it. No dive moves at sea.
#[unsafe(no_mangle)]
pub extern "C" fn room_judged_moved(player: PlayerId) -> u32 {
    let moved = with_open(|opened| match opened {
        Opened::Land { room, .. } => room.take_judged_move(player),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    });
    u32::from(moved == Some(true))
}

/// A player's character as it is kept between sessions, as JSON's bytes, at sea with their ship's hurts in it (a new
/// one until the accounts gave theirs); empty with no such player, and in a fleet room.
#[must_use]
pub fn character(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.kept_character(player),
        Opened::Sea(sea) => sea.kept_character(player),
        Opened::Fleet(_) => None,
    })
    .flatten()
    .map(String::into_bytes)
    .unwrap_or_default()
}

/// Gives a player the character kept for them, from JSON's bytes, at sea their ship the hurts kept in it; false if
/// it is not one or they are not in.
pub fn restore_character(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(text) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.restore_character(player, text),
        Opened::Sea(sea) => sea.restore_character(player, text),
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// A player's character as kept (`character`) with the account's shared part (`gear::shared`) parted out of it, as
/// JSON's bytes: `{ "body": <the character's JSON>, "vault": <the shared part's JSON> }`; empty as `character` is.
#[must_use]
pub fn kept(player: PlayerId) -> Vec<u8> {
    let Some(mut character) = String::from_utf8(character(player)).ok().as_deref().and_then(gear::Character::from_json)
    else {
        return Vec::new();
    };
    let vault = character.part_shared().to_json();
    serde_json::json!({ "body": character.to_json(), "vault": vault }).to_string().into_bytes()
}

/// A kept character and the account's shared part, as the keeper gives them.
#[derive(Deserialize)]
struct Joined {
    body: String,
    vault: Option<String>,
}

/// Gives a player their kept character with the account's shared part joined into it, from JSON's bytes as `kept`
/// answers them (`vault` null for none kept yet); false if either is not one, or as `restore_character` is.
pub fn restore_joined(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(joined) = serde_json::from_slice::<Joined>(bytes) else { return false };
    let Some(mut character) = gear::Character::from_json(&joined.body) else { return false };
    if let Some(vault) = joined.vault {
        let Some(shared) = gear::shared::Shared::from_json(&vault) else { return false };
        character.join_shared(shared);
    }
    restore_character(player, character.to_json().as_bytes())
}

/// Why the open room's gate shuts to a player's character kept as JSON's bytes, in its words (`gear::gate`), with the
/// story they already hold in the room carried forward (`Room::shut_to`), or at sea the sea's tier (`Sea::shut`); empty
/// bytes are a new character's. Empty when it may enter, in a fleet, or when the bytes are no character, which the
/// restore refuses.
#[must_use]
pub fn shut(player: PlayerId, bytes: &[u8]) -> String {
    let character = if bytes.is_empty() {
        Some(gear::Character::starting())
    } else {
        std::str::from_utf8(bytes).ok().and_then(gear::Character::from_json)
    };
    let Some(character) = character else { return String::new() };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.shut_to(player, &character).map(gear::gate::Shut::reason),
        Opened::Sea(sea) => sea.shut(&character).map(gear::gate::Shut::reason),
        Opened::Fleet(_) => None,
    })
    .flatten()
    .unwrap_or_default()
}

/// Why the gate shuts to a player's character written at `address` (`shut`), as its words' bytes, packed as
/// `hand_over` packs.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_shut(player: PlayerId, address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(shut(player, unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
}

/// Notes the account, written in `bytes`, that keeps a player's character (`Room::own`); false if it is not text or
/// they are not in.
pub fn own(player: PlayerId, bytes: &[u8]) -> bool {
    let Ok(owner) = std::str::from_utf8(bytes) else { return false };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.own(player, owner),
        Opened::Sea(sea) => sea.own(player, owner),
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Holds a player's inputs (`held` 1) or lets them play (0): held, each is taken in its order and played as standing
/// still. 1 if the player is in a room on land, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_hold(player: PlayerId, held: u32) -> u32 {
    let held = with_open(|opened| match opened {
        Opened::Land { room, .. } => room.hold(player, held != 0),
        Opened::Sea(_) | Opened::Fleet(_) => false,
    });
    u32::from(held.unwrap_or(false))
}

/// Notes the account written at `address` that keeps a player's character; 1 if noted, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_own(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(own(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// A player's own gear's bytes, empty when it has not changed.
#[unsafe(no_mangle)]
pub extern "C" fn room_gear(player: PlayerId) -> u64 {
    hand_over(gear(player))
}

/// A player's character as kept, as JSON's bytes (`character`), packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_character(player: PlayerId) -> u64 {
    hand_over(character(player))
}

/// A new character wearing a plain sword and armour (`Character::kitted`), as JSON's bytes packed as `hand_over`
/// packs: what scripted players start from, a new player arriving with nothing.
#[unsafe(no_mangle)]
pub extern "C" fn room_kitted() -> u64 {
    hand_over(gear::Character::kitted().to_json().into_bytes())
}

/// What still lies for a player goes to their mail (`Room::mail_lying`), at sea from the captain's deck they stand on.
/// A host calls it as the player leaves, before it reads their character for its last save; a fleet keeps none.
#[unsafe(no_mangle)]
pub extern "C" fn room_mail_lying(player: PlayerId) {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.mail_lying(player),
        Opened::Sea(sea) => sea.mail_lying(player),
        Opened::Fleet(_) => {}
    });
}

/// Gives a player the character written at `address` as JSON; 1 if it was one and they are in, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_restore_character(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(restore_character(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// A player's character as kept with the shared part apart (`kept`), packed as `hand_over` packs.
#[unsafe(no_mangle)]
pub extern "C" fn room_kept(player: PlayerId) -> u64 {
    hand_over(kept(player))
}

/// Gives a player the character and shared part written at `address` (`restore_joined`); 1 if given, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_restore_joined(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(restore_joined(player, unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Lays out the course's stall and resource nodes written at `address`; 1 if laid, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_furnish(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(furnish(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Sets the difficulty a node's room's voyage set out at, or the sea's tier: 0 Normal, 1 Elite, 2 Abyss; false for no
/// such difficulty, a fleet, or no room open.
pub fn set_difficulty(number: u32) -> bool {
    let Some(difficulty) = usize::try_from(number).ok().and_then(|index| gear::Difficulty::ALL.get(index).copied())
    else {
        return false;
    };
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.set_difficulty(difficulty);
            true
        }
        Opened::Sea(sea) => {
            sea.set_difficulty(difficulty);
            true
        }
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Sets a node's room's difficulty, or the sea's tier (`set_difficulty`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_difficulty(number: u32) -> u32 {
    u32::from(set_difficulty(number))
}

/// Sets the minute, counted from the epoch, whose day sets the wares a room's vendors show and whose week sets when
/// Shape comes and where he stands, or the sea's; false in a fleet.
pub fn set_minute(minute: u32) -> bool {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.set_minute(u64::from(minute));
            true
        }
        Opened::Sea(sea) => {
            sea.minute = u64::from(minute);
            true
        }
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Draws a room's chances from the host's own secret seeds, the loot's and the world's, each from its two halves: a
/// room on land's, or the sea's flotsam and boarded decks; false with a fleet.
pub fn reseed(seeds: [u32; 4]) -> bool {
    let whole = |low: u32, high: u32| u64::from(high) << 32 | u64::from(low);
    let (loot, world) = (whole(seeds[0], seeds[1]), whole(seeds[2], seeds[3]));
    with_open(|opened| match opened {
        Opened::Land { room, .. } => {
            room.reseed(loot, world);
            true
        }
        Opened::Sea(sea) => {
            sea.reseed(loot, world);
            true
        }
        Opened::Fleet(_) => false,
    })
    .unwrap_or(false)
}

/// Reseeds the room (`reseed`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_reseed(loot_low: u32, loot_high: u32, world_low: u32, world_high: u32) -> u32 {
    u32::from(reseed([loot_low, loot_high, world_low, world_high]))
}

/// Sets the room's minute (`set_minute`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_minute(minute: u32) -> u32 {
    u32::from(set_minute(minute))
}

/// A social space's counter as the bake writes it: its station, and its middle.
#[derive(Debug, Deserialize)]
pub(crate) struct NodeCounter {
    kind: String,
    at: [f64; 2],
}

/// A counter that serves a player's gear, from its station's name: a faction's by the faction's key.
pub(crate) fn counter_of(found: &NodeCounter) -> Option<Counter> {
    let faction = || gear::factions::factions().factions.iter().find(|faction| faction.key == found.kind);
    let kind = match found.kind.as_str() {
        "mage" => CounterKind::Mage,
        "vault" => CounterKind::Vault,
        "armorsmith" => CounterKind::Vendor(Vendor::Armorsmith),
        "weaponsmith" => CounterKind::Vendor(Vendor::Weaponsmith),
        "harbourmaster" => CounterKind::Vendor(Vendor::Shipwright),
        "tailor" => CounterKind::Tailor,
        "tack" => CounterKind::Tack,
        "mail" => CounterKind::Mail,
        _ => CounterKind::Faction(faction()?.id),
    };
    Some(Counter { kind, at: found.at })
}

#[cfg(test)]
#[path = "gear_door_tests.rs"]
mod gear_door_tests;
