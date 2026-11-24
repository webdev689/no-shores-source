//! The door a guild's outpost's room runs its errands through. The host makes a node's room an outpost (`room_outpost`),
//! takes the errands its players' asks hold each tick (`room_outpost_errands`), asks the accounts, and gives each
//! answer back (`room_outpost_answered`); it says each time it stood the plot anew (`room_outpost_stood`), and which
//! player is leaving while their errands settle (`room_outpost_parting`).

use crate::{Opened, hand_over, with_open};
use room::{Errand, Room, What};
use serde::Deserialize;
use serde_json::{Value, json};

/// What makes a room an outpost, as the host writes it: the guild's key, the muster ground's middle, and what begins
/// the accounts' id of each errand.
#[derive(Deserialize)]
struct Told {
    key: String,
    muster: [f64; 2],
    #[serde(default)]
    ids: String,
}

fn on_land<T>(ask: impl FnOnce(&mut Room) -> T) -> Option<T> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => Some(ask(room)),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
}

/// Makes the open room on land a guild's outpost, from the text in `bytes` (`Told`); false for text that is not one, or
/// no room on land.
pub fn outpost(bytes: &[u8]) -> bool {
    let Ok(told) = serde_json::from_slice::<Told>(bytes) else { return false };
    on_land(|room| room.open_outpost(&told.key, told.muster, &told.ids)).is_some()
}

/// An errand as the host reads it: its number, the accounts' id for it, player and account, its kind ('deposit', 'deliver', 'take', 'horn' or
/// 'changed'), and for the first three its amount, for a delivery its structure, and for both its material's name.
fn errand_json(errand: &Errand) -> Value {
    let mut written = json!({ "id": errand.id, "rid": errand.rid, "player": errand.player, "account": errand.account });
    let fields = match errand.what {
        What::Deposit(amount) => json!({ "kind": "deposit", "amount": amount }),
        What::Deliver { structure, stuff, amount } => {
            json!({ "kind": "deliver", "structure": structure, "stuff": stuff.name(), "amount": amount })
        }
        What::Take { stuff, amount } => json!({ "kind": "take", "stuff": stuff.name(), "amount": amount }),
        What::Horn => json!({ "kind": "horn" }),
        What::Changed => json!({ "kind": "changed" }),
    };
    if let (Some(into), Value::Object(more)) = (written.as_object_mut(), fields) {
        into.extend(more);
    }
    written
}

/// The errands held for the host since it last took them, as a JSON list; empty in a room that is no outpost.
pub fn errands() -> String {
    let taken = on_land(Room::outpost_errands).unwrap_or_default();
    Value::Array(taken.iter().map(errand_json).collect()).to_string()
}

/// Makes the open room on land a guild's outpost from the text written at `address`; 1 if it is one now, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_outpost(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller gives `length` readable bytes at `address`.
    u32::from(outpost(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// The errands held for the host (`errands`), handed over as text.
#[unsafe(no_mangle)]
pub extern "C" fn room_outpost_errands() -> u64 {
    hand_over(errands().into_bytes())
}

/// The accounts' answer to an errand by its number: how many they moved, used or gave, or the horn's answer (its tier,
/// or 0, -1 or -2 for why it did not sound); `i32::MIN` when they could not be reached. 1 if the room held such an
/// errand, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_outpost_answered(id: u32, answer: i32) -> u32 {
    let answer = (answer != i32::MIN).then_some(i64::from(answer));
    u32::from(on_land(|room| room.outpost_answered(id, answer)).unwrap_or(false))
}

/// A player leaves while their errands settle (`Room::outpost_parting`); 1 at an outpost, 0 elsewhere.
#[unsafe(no_mangle)]
pub extern "C" fn room_outpost_parting(player: u32) -> u32 {
    u32::from(on_land(|room| room.outpost_parting(player)).unwrap_or(false))
}

/// The host stood the plot anew; 1 in a room on land, 0 elsewhere.
#[unsafe(no_mangle)]
pub extern "C" fn room_outpost_stood() -> u32 {
    u32::from(on_land(Room::outpost_stood).is_some())
}

/// The host stood the plot's Delve Gate: the foot of its steps, x east and y south, and the way out from it in radians
/// clockwise from north; x not a number where no gate stands. 1 in a room on land, 0 elsewhere.
#[unsafe(no_mangle)]
pub extern "C" fn room_outpost_gate(x: f64, y: f64, facing: f64) -> u32 {
    let gate = [x, y, facing].iter().all(|each| each.is_finite()).then_some(([x, y], facing));
    u32::from(on_land(|room| room.outpost_gate(gate)).is_some())
}

#[cfg(test)]
#[path = "outpost_door_tests.rs"]
mod tests;
