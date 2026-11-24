//! A Breach for its host and its page: a run's room opened from its ask (the Breach, its tier and the minute it
//! opens), its plan as the page draws it, how far its company has come, and the host's words to a patrol's room that
//! stands a Breach's gate: a player launched for a run, a run's company inside, and whether a run's gate has opened.

use crate::{Opened, hand_over, keep, with_open};
use gear::breach::{BREACHES, Tier};
use room::breach::plan::{SLAB_CYCLE, SLAB_STANDS, drowned_vale};
use room::{PlayerId, Room};
use serde::Deserialize;
use serde_json::{Value, json};

/// A run's ask: the Breach by the patrol zone its gate stands in, its tier (0 Normal, 1 Hard) and the Unix minute it
/// opens.
#[derive(Deserialize)]
struct RunAsked {
    zone: String,
    tier: usize,
    minute: u64,
}

/// A host's word naming a run and its tier, and for a company inside, its leader's name and the encounter it is on.
#[derive(Deserialize)]
struct RunWord {
    run: String,
    tier: usize,
    #[serde(default)]
    name: String,
    #[serde(default)]
    encounter: u8,
}

fn on_land<T>(ask: impl FnOnce(&mut Room) -> T) -> Option<T> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => Some(ask(room)),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
}

/// A patrol's Breach's gate stood in its node's room where the bake says the layout stood its module.
pub(crate) fn stand_gate(room: &mut Room, kind: room::NodeKind, seat: Option<([f64; 3], u8)>) {
    if let Some((at, quarters)) = seat.filter(|_| kind == room::NodeKind::Patrol) {
        room.open_breach_gate(at, quarters);
    }
}

/// Opens a Breach's run from its ask; answers whether the ask read and names a Breach and a tier.
pub fn open_breach(text: &[u8]) -> bool {
    let Ok(asked) = serde_json::from_slice::<RunAsked>(text) else { return false };
    let breach = BREACHES.iter().find(|breach| breach.zone == asked.zone);
    let (Some(_), Some(&tier)) = (breach, Tier::ALL.get(asked.tier)) else { return false };
    let Some(room) = Room::breach_run(tier, asked.minute) else { return false };
    let bounds = drowned_vale().bounds(0.0);
    let sent = Box::new(crate::sent::Sent::around(protocol::pack::middle_of(Some(bounds))));
    keep(Opened::Land { room: Box::new(room), node: None, refusal: None, sent });
    true
}

/// The Drowned Vale as the page draws it, as JSON: its spaces (each a module stood at a point, turned whole quarters
/// clockwise), its seals with the encounter that opens each and where it stands, its slabs and their measure, which
/// space each encounter is fought in and its name, the shores, each tier's levels and revives, and its rewards' keys.
#[must_use]
pub fn breach_json() -> String {
    let plan = drowned_vale();
    let breach = &BREACHES[0];
    let at = |space: &str, socket: &str| plan.socket(space, socket).map(|(at, _)| at);
    let spaces: Vec<Value> = plan
        .spaces
        .iter()
        .map(|space| json!({ "key": space.key, "module": space.module, "at": space.at, "turn": space.turn }))
        .collect();
    let seals: Vec<Value> = plan
        .seals
        .iter()
        .map(|seal| json!({ "opens": seal.opens, "at": at(&seal.space, &seal.socket), "turn": seal.turn }))
        .collect();
    let slabs: Vec<Value> =
        plan.slabs.iter().map(|slab| json!({ "at": at(&slab.space, &slab.socket), "phase": slab.phase })).collect();
    let encounters: Vec<Value> = breach
        .encounters
        .iter()
        .map(|encounter| {
            let space = plan.encounters.get(encounter.key);
            json!({ "key": encounter.key, "name": encounter.name, "outside": encounter.outside, "space": space })
        })
        .collect();
    let tiers: Vec<Value> = Tier::ALL
        .iter()
        .map(|tier| {
            let (key, name, revives) = (tier.key(), tier.name(), tier.revives());
            json!({ "key": key, "name": name, "level": tier.foes_at(), "opens": tier.opens_at(), "revives": revives })
        })
        .collect();
    json!({
        "id": breach.id,
        "name": breach.name,
        "zone": breach.zone,
        "spaces": spaces,
        "seals": seals,
        "slabs": slabs,
        "slabCycle": SLAB_CYCLE,
        "slabStands": SLAB_STANDS,
        "encounters": encounters,
        "shores": plan.shores,
        "tiers": tiers,
        "banner": breach.banner,
        "dye": breach.dye,
        "horse": breach.horse,
    })
    .to_string()
}

/// How far the open run's company has come, as JSON for its host to tell its gate: the tier and the encounter it is
/// on, the count of encounters once all are won; null in any other room.
#[must_use]
pub fn progress_json() -> String {
    let progress = on_land(|room| room.breach_progress()).flatten();
    let progress =
        progress.map(|(tier, on)| json!({ "tier": Tier::ALL.iter().position(|each| *each == tier), "encounter": on }));
    progress.unwrap_or(Value::Null).to_string()
}

/// The host's word to a patrol's room with a Breach's gate: `player` came launched for a run at its tier. Answers
/// whether the room has a gate to hold them.
pub fn breach_company(player: PlayerId, text: &[u8]) -> bool {
    let Ok(word) = serde_json::from_slice::<RunWord>(text) else { return false };
    let Some(&tier) = Tier::ALL.get(word.tier) else { return false };
    on_land(|room| room.breach_company(player, &word.run, tier)).unwrap_or(false)
}

/// The host's word from a run to its gate's room: its company is inside, on an encounter (or done, past the last).
pub fn breach_inside(text: &[u8]) -> bool {
    let Ok(word) = serde_json::from_slice::<RunWord>(text) else { return false };
    let Some(&tier) = Tier::ALL.get(word.tier) else { return false };
    on_land(|room| room.breach_inside(&word.run, &word.name, tier, word.encounter)).is_some()
}

/// Whether a run's gate has opened in the open room, for the host to let its company through.
#[must_use]
pub fn breach_opened(run: &[u8]) -> bool {
    let run = String::from_utf8_lossy(run);
    on_land(|room| room.breach_opened(&run)).unwrap_or(false)
}

/// The text written at `address`, `length` bytes long.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
unsafe fn text_at<'text>(address: *const u8, length: usize) -> &'text [u8] {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    unsafe { std::slice::from_raw_parts(address, length) }
}

/// Opens a Breach's run from its ask written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_breach(address: *const u8, length: usize) -> u32 {
    // SAFETY: as this function's own.
    u32::from(open_breach(unsafe { text_at(address, length) }))
}

/// The Drowned Vale as the page draws it (`breach_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_breach() -> u64 {
    hand_over(breach_json().into_bytes())
}

/// How far the open run's company has come (`progress_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_breach_progress() -> u64 {
    hand_over(progress_json().into_bytes())
}

/// A player launched for a run, its word written at `address`, `length` bytes long (`breach_company`); 1 if held.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_breach_company(player: PlayerId, address: *const u8, length: usize) -> u32 {
    // SAFETY: as this function's own.
    u32::from(breach_company(player, unsafe { text_at(address, length) }))
}

/// A run's company inside, its word written at `address`, `length` bytes long (`breach_inside`); 1 if heard.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_breach_inside(address: *const u8, length: usize) -> u32 {
    // SAFETY: as this function's own.
    u32::from(breach_inside(unsafe { text_at(address, length) }))
}

/// Whether the run named at `address`, `length` bytes long, has had its gate open (`breach_opened`); 1 if so.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_breach_opened(address: *const u8, length: usize) -> u32 {
    // SAFETY: as this function's own.
    u32::from(breach_opened(unsafe { text_at(address, length) }))
}

#[cfg(test)]
#[path = "breach_door_tests.rs"]
mod tests;
