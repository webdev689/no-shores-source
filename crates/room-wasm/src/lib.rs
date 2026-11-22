//! The room for its Cloudflare host and for a browser playing alone. Each WebAssembly instance keeps one room: a
//! course's, a node's, the sea's or a fleet's. The host opens it, lets players join and leave, hands it each player's
//! input bytes as they come, ticks it, and sends out the bytes it answers. A browser also steps its own player's
//! fighter here, by the same rules, to predict it. The rules stay in the combat and room crates and the messages in the
//! protocol crate.
#![allow(unsafe_code, reason = "the WebAssembly door hands raw memory between JavaScript and Rust")]

use land::ground::Ground;
use movement::Block;
use movement::floats::BLOCK_FLOATS;
use protocol::SeaInput;
use room::asks::{Counter, CounterKind};
use room::deck::WalkRefused;
use room::fleet::Fleet;
use room::sea::{CourseRefused, HelmRefused, Sea};
use room::winds::epoch_of;
use room::{Floor, NodeKind, PlayerId, Refused, Room, Section};
use sent::Sent;
use serde::Deserialize;
use std::cell::RefCell;

mod course_door;
mod deck_door;
mod dungeon_door;
mod snapshot_door;
pub use snapshot_door::snapshot;
mod fighter_door;
mod fleet_door;
mod gear_door;
mod isle_door;
mod public_door;
mod roster_door;
mod run_door;
mod sea_door;
mod sent;
mod waters_door;

pub use dungeon_door::open_dungeon;
pub use fighter_door::{arms_code, predict, set_course, set_ground, set_heights};
pub use gear_door::{character, furnish, gear, restore_character, set_difficulty, set_minute, shut};
pub use public_door::parting;
pub use run_door::{activities_json, gates_json, open_run};

/// The room an instance keeps: on land, with its node's id and window rect when it is a node's, and why it takes no
/// player when its node is locked; the sea; or a fleet.
#[derive(Debug)]
enum Opened {
    Land { room: Box<Room>, node: Option<(String, [f64; 4])>, refusal: Option<String>, sent: Box<Sent> },
    Sea(Box<Sea>),
    Fleet(Box<Fleet>),
}

thread_local! {
    static OPEN: RefCell<Option<Opened>> = const { RefCell::new(None) };
    /// The wall's time at the open room's first tick, milliseconds since 1970, as its host last set it: world time's
    /// own start until a host sets it.
    static EPOCH_MS: std::cell::Cell<f64> = const { std::cell::Cell::new(sky::clock::EPOCH_UNIX_MS) };
}

/// What became of an input the host handed over.
pub const TAKEN: i32 = 0;
pub const NOT_AN_INPUT: i32 = 1;
pub const OUT_OF_ORDER: i32 = 2;
pub const NO_SUCH_PLAYER: i32 = 3;
/// At sea, a second course in one tick, dropped as a flood.
pub const TOO_SOON: i32 = 4;
/// A course that reads but the sea's law refuses: it crosses land, or its pace or points are not allowed.
pub const REFUSED: i32 = 5;

/// A node's file as the bake writes it; the room reads its id, kind, name, section, window, rect and boxes, whether
/// it is locked, a patrol's resource places (where its nodes stand), and the places the houses' roads name and the
/// paths their figures walk. A page playing alone writes its own, never locked.
#[derive(Debug, Deserialize)]
struct NodeFile {
    id: String,
    kind: NodeKind,
    #[serde(default)]
    name: String,
    #[serde(default)]
    locked: bool,
    #[serde(default)]
    continent: String,
    ring: Vec<[f64; 2]>,
    spawns: Vec<[f64; 2]>,
    bounds: [f64; 4],
    ground: Ground,
    boxes: Vec<[f64; BLOCK_FLOATS]>,
    #[serde(default)]
    counters: Vec<gear_door::NodeCounter>,
    /// In Overlook's social space, where a player stands to read the bounty board.
    #[serde(default)]
    board: Option<[f64; 2]>,
    #[serde(default)]
    shape_spots: Vec<[f64; 2]>,
    #[serde(default)]
    grounds: Option<public_door::NodeGrounds>,
    #[serde(default)]
    resources: Vec<[f64; 2]>,
    #[serde(default)]
    places: Vec<gear::quests::Place>,
    #[serde(default)]
    paths: Vec<Vec<[f64; 2]>>,
}

fn floats_of(bytes: &[u8]) -> Vec<f64> {
    bytes.chunks_exact(8).map(|chunk| f64::from_le_bytes(chunk.try_into().unwrap_or_default())).collect()
}

fn with_open<T>(use_open: impl FnOnce(&mut Opened) -> T) -> Option<T> {
    OPEN.with(|open| open.borrow_mut().as_mut().map(use_open))
}

fn keep(opened: Opened) {
    OPEN.with(|open| *open.borrow_mut() = Some(opened));
}

/// Opens a new room on a course: the spawn's x and y, then the blocks, six numbers each (`BLOCK_FLOATS`), little-endian floats.
/// Answers whether the numbers made a course.
pub fn open(bytes: &[u8]) -> bool {
    open_course(bytes, Room::new)
}

/// Opens a new room on a course laid over the open sea, written as `open` reads one: its foes walk its blocks alone.
pub fn open_over_sea(bytes: &[u8]) -> bool {
    open_course(bytes, Room::over_sea)
}

fn open_course(bytes: &[u8], room_on: fn(Vec<Block>, (f64, f64)) -> Room) -> bool {
    let floats = floats_of(bytes);
    let Some((spawn, blocks)) = floats.split_first_chunk::<2>() else { return false };
    if !blocks.len().is_multiple_of(BLOCK_FLOATS) {
        return false;
    }
    let blocks =
        blocks.chunks_exact(BLOCK_FLOATS).filter_map(|numbers| numbers.try_into().ok()).map(Block::from_floats);
    let blocks: Vec<Block> = blocks.collect();
    fighter_door::COURSE.with(|course| *course.borrow_mut() = blocks.clone().into());
    keep(Opened::Land {
        room: Box::new(room_on(blocks, (spawn[0], spawn[1]))),
        node: None,
        refusal: None,
        sent: Box::default(),
    });
    true
}

/// Opens a new node's room from its file's text: its bodies stand on its window of the ground among its boxes, its
/// kind's garrison stands, and it judges against its section. Answers whether the text was a node with a section and
/// a spawn.
pub fn open_node(text: &[u8]) -> bool {
    let Ok(node) = serde_json::from_slice::<NodeFile>(text) else { return false };
    if node.ring.len() < 3 || node.spawns.is_empty() {
        return false;
    }
    let blocks = node.boxes.iter().map(Block::from_floats);
    let section = Section { ring: node.ring, spawns: node.spawns, falls_kill: node.kind == NodeKind::Social };
    // Its garrison stands at its island's levels; a city's social space serves a player's gear at its counters; a
    // patrol keeps its island's resource nodes and lays its dungeons' entrances; an Elite Dungeon's node lays its one.
    let levels = gear::world::island_levels(&node.continent);
    let floor = Floor::Land(Box::new(node.ground));
    let mut room = Room::garrisoned(floor, blocks.collect(), section, node.kind, (&node.id, levels));
    room.set_island(&node.continent);
    room.counters = (node.kind == NodeKind::Social).then(|| {
        let board = node.board.map(|at| Counter { kind: CounterKind::Board, at });
        node.counters.iter().filter_map(gear_door::counter_of).chain(board).collect()
    });
    room.shape_spots = node.shape_spots;
    room.set_places(node.places);
    room.set_paths(node.paths);
    if let Some(grounds) = node.grounds {
        room.open_public(&node.id, grounds.into(), levels);
    }
    let resource = gear::catalogue::catalogue().resources.iter().position(|found| found.continent == node.continent);
    if node.kind == NodeKind::Patrol
        && let Some(resource) = resource
    {
        room.start_patrol(&node.id, u8::try_from(resource).unwrap_or_default(), &node.resources);
    }
    if node.kind == NodeKind::Dungeon {
        room.lay_elite_entrance(&node.id);
    }
    let refusal = lock_words(node.locked, &node.name);
    let sent = Box::new(Sent::around(protocol::pack::middle_of(Some(node.bounds))));
    keep(Opened::Land { room: Box::new(room), node: Some((node.id, node.bounds)), refusal, sent });
    true
}

/// Why a locked node's room takes no player, in the words the page shows; None while it is open.
fn lock_words(locked: bool, name: &str) -> Option<String> {
    locked.then(|| format!("{name} is locked"))
}

/// Why the open room takes no player: a locked node's says so; None for any other room.
pub fn refusal() -> Option<String> {
    with_open(|opened| match opened {
        Opened::Land { refusal, .. } => refusal.clone(),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
}

/// The sea's opening text with its ports: `{ "layout": <layout file>, "ports": [{ "id", "name", "continent",
/// "centre": [x, y] }] }`, the ports as the waters' door takes them.
#[derive(Deserialize)]
struct SeaRequest {
    layout: world::layout::Layout,
    ports: Vec<world::traffic::Port>,
}

/// Opens the sea round the continents of a layout, its hostile ships' chances drawn from `seed`: the text is a layout file,
/// or a layout with its ports (`SeaRequest`), whose lanes the Grey Tithe patrols. Answers whether the text was either.
pub fn open_sea(text: &[u8], seed: u32) -> bool {
    let Ok(text) = std::str::from_utf8(text) else { return false };
    let opened = match serde_json::from_str::<SeaRequest>(text) {
        Ok(request) => Some((request.layout, request.ports)),
        Err(_) => world::layout::parse(text).ok().map(|layout| (layout, Vec::new())),
    };
    let Some((layout, ports)) = opened else { return false };
    let mut sea = Sea::new(&layout, deck_door::sloop_deck().clone(), seed, &ports);
    sea.set_hull_decks(deck_door::hull_decks().to_vec());
    sea.set_world_start(EPOCH_MS.get() / 1000.0);
    keep(Opened::Sea(Box::new(sea)));
    true
}

/// Opens a fleet room on the open sea.
pub fn open_fleet() {
    keep(Opened::Fleet(Box::new(Fleet::new())));
    // Its predictions take the same world time as the room.
    set_epoch(EPOCH_MS.get());
}

/// Sets the wall's time at the open room's first tick, milliseconds since 1970: the room's world time runs from it,
/// and its welcome says so. A room opened later keeps it too.
pub fn set_epoch(unix_ms: f64) {
    EPOCH_MS.set(unix_ms);
    with_open(|opened| match opened {
        Opened::Sea(sea) => sea.set_world_start(unix_ms / 1000.0),
        Opened::Fleet(fleet) => fleet.set_epoch(unix_ms),
        Opened::Land { .. } => {}
    });
    fleet_door::set_world_start(unix_ms / 1000.0);
}

/// Lets the open room take players' asks for foes, as a course's room does; a node's room otherwise takes none.
pub fn take_foe_asks() {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.take_foe_asks();
        }
    });
}

/// Plays the prologue's wreck in the open room: no Art, the player waking hurt with no weapon, and every boarder on
/// one side and held to a Major; see `Room::story_wreck`.
pub fn story_wreck() {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.story_wreck();
        }
    });
}

/// A player's input bytes, read and handed to the room: an input on land; at sea a course, orders, a step on deck or
/// the helm. One of the answers above.
pub fn input(player: PlayerId, bytes: &[u8]) -> i32 {
    let answer = with_open(|opened| match opened {
        Opened::Land { room, .. } => match protocol::read_inputs(bytes) {
            Err(_) => NOT_AN_INPUT,
            // Those it carries from before that the room already had are passed over: they were taken.
            Ok(inputs) => {
                let had = room.heard(player).map_or(0, |(received, ..)| received);
                let fresh = inputs.into_iter().filter(|input| input.sequence > had);
                let mut answer = TAKEN;
                for input in fresh {
                    answer = match room.input(player, input) {
                        Ok(()) => TAKEN,
                        Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                        Err(Refused::BadLook) => NOT_AN_INPUT,
                        Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
                    };
                    if answer != TAKEN {
                        break;
                    }
                }
                answer
            }
        },
        Opened::Sea(sea) => {
            // A boarder's inputs on the captain's deck are a land room's.
            if sea.on_deck(player)
                && let Ok(input) = protocol::read_input(bytes)
            {
                return match sea.deck_input(player, input) {
                    Ok(()) => TAKEN,
                    Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                    Err(Refused::BadLook) => NOT_AN_INPUT,
                    Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
                };
            }
            let asked = match protocol::read_sea_input(bytes) {
                Err(_) => return NOT_AN_INPUT,
                Ok(SeaInput::Course(points, pace)) => sea.course(player, &points, pace),
                Ok(SeaInput::Face(heading)) => sea.face(player, heading),
                Ok(SeaInput::Orders(orders)) => sea.orders(player, orders),
                Ok(SeaInput::Chase(ship)) => {
                    sea.chase(player, ship);
                    return TAKEN;
                }
                Ok(SeaInput::Walk(sequence, controls)) => {
                    return match sea.walk(player, sequence, controls) {
                        Ok(()) => TAKEN,
                        Err(WalkRefused::OutOfOrder { .. }) => OUT_OF_ORDER,
                        Err(WalkRefused::BadControls) => NOT_AN_INPUT,
                        Err(WalkRefused::NotAboard) => REFUSED,
                    };
                }
                Ok(SeaInput::Repair) => return if sea.repair(player).is_ok() { TAKEN } else { REFUSED },
                Ok(SeaInput::Board) => return if sea.board(player).is_ok() { TAKEN } else { REFUSED },
                Ok(SeaInput::LeaveDeck) => return if sea.leave_deck(player).is_ok() { TAKEN } else { REFUSED },
                Ok(helm @ (SeaInput::LeaveHelm | SeaInput::TakeHelm)) => {
                    let asked =
                        if helm == SeaInput::LeaveHelm { sea.leave_helm(player) } else { sea.take_helm(player) };
                    return match asked {
                        Ok(()) => TAKEN,
                        Err(HelmRefused::NoSuchPlayer) => NO_SUCH_PLAYER,
                        Err(_) => REFUSED,
                    };
                }
            };
            match asked {
                Ok(()) => TAKEN,
                Err(CourseRefused::NoSuchPlayer) => NO_SUCH_PLAYER,
                Err(CourseRefused::TooSoon) => TOO_SOON,
                Err(_) => REFUSED,
            }
        }
        Opened::Fleet(fleet) => match protocol::fleet::read_orders(bytes) {
            Err(_) => NOT_AN_INPUT,
            Ok(orders) => match fleet.input(player, orders) {
                Ok(()) => TAKEN,
                Err(Refused::OutOfOrder { .. }) => OUT_OF_ORDER,
                Err(Refused::BadLook) => NOT_AN_INPUT,
                Err(Refused::NoSuchPlayer) => NO_SUCH_PLAYER,
            },
        },
    });
    answer.unwrap_or(NO_SUCH_PLAYER)
}

/// The welcome's bytes for a player: their number, every dress in the room so far, and a node's id and rect.
#[must_use]
pub fn joined(player: PlayerId) -> Vec<u8> {
    with_open(|opened| match opened {
        Opened::Land { room, node, .. } => {
            let node = node.as_ref().map(|(id, bounds)| (id.as_str(), *bounds));
            protocol::joined_bytes(player, &room.dresses().collect::<Vec<_>>(), node, epoch_of(EPOCH_MS.get()))
        }
        Opened::Sea(_) | Opened::Fleet(_) => protocol::joined_bytes(player, &[], None, epoch_of(EPOCH_MS.get())),
    })
    .unwrap_or_default()
}

/// Hands bytes to JavaScript as one number: the address in the high 32 bits, the length in the low 32. WebAssembly's
/// addresses are 32 bits; anywhere else the packing would lose them, so it refuses.
fn hand_over(bytes: Vec<u8>) -> u64 {
    let bytes = bytes.into_boxed_slice();
    let length = u32::try_from(bytes.len()).expect("an answer fits in 4 GB");
    let address = u32::try_from(Box::into_raw(bytes).cast::<u8>() as usize).expect("WebAssembly addresses are 32 bits");
    (u64::from(address) << 32) | u64::from(length)
}

/// Reserves `length` bytes for JavaScript to write into.
#[unsafe(no_mangle)]
pub extern "C" fn reserve(length: usize) -> *mut u8 {
    Box::into_raw(vec![0_u8; length].into_boxed_slice()).cast::<u8>()
}

/// Gives back memory from `reserve`, or from an answer.
///
/// # Safety
/// `address` and `length` must be exactly what `reserve` returned, or what an answer's number held, and used once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn release(address: *mut u8, length: usize) {
    // SAFETY: the caller hands back a boxed slice this module made, with its own length, once.
    drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(address, length)) });
}

/// Opens a room on the course written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens a room on the course over the open sea written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_over_sea(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_over_sea(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens a node's room from its file's text written at `address`, `length` bytes long; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_node(address: *const u8, length: usize) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_node(unsafe { std::slice::from_raw_parts(address, length) }))
}

/// Opens the sea round the layout file's text written at `address`, `length` bytes long, its hostiles drawn from
/// `seed`; 1 if it opened, 0 if not.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_open_sea(address: *const u8, length: usize, seed: u32) -> u32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    u32::from(open_sea(unsafe { std::slice::from_raw_parts(address, length) }, seed))
}

/// Opens a fleet room on the open sea; always 1.
#[unsafe(no_mangle)]
pub extern "C" fn room_open_fleet() -> u32 {
    open_fleet();
    1
}

/// Sets the world time the open sea or fleet room's clock started at, seconds since the Unix epoch, so its weather
/// is the world's then; a fleet room's predictions take it too. Its host calls it once it has opened the room.
#[unsafe(no_mangle)]
pub extern "C" fn room_world_start(seconds: f64) {
    with_open(|opened| match opened {
        Opened::Sea(sea) => sea.set_world_start(seconds),
        Opened::Fleet(fleet) => fleet.set_world_start(seconds),
        Opened::Land { .. } => {}
    });
    fleet_door::set_world_start(seconds);
}

/// Sets the wall's time at the room's first tick, milliseconds since 1970: the same instant `room_world_start` sets,
/// in the unit the sky's clock reads.
#[unsafe(no_mangle)]
pub extern "C" fn room_epoch(unix_ms: f64) {
    set_epoch(unix_ms);
}

/// How long one of the room's ticks is, in seconds: its host ticks it that often.
#[unsafe(no_mangle)]
pub extern "C" fn room_tick_seconds() -> f64 {
    movement::TICK_SECONDS
}

/// A new player's number, or 0 with no room open, the room full or its node locked (`room_refusal` says which).
#[unsafe(no_mangle)]
pub extern "C" fn room_join() -> PlayerId {
    with_open(|opened| match opened {
        Opened::Land { room, refusal: None, .. } => room.join(),
        Opened::Land { .. } => None,
        Opened::Sea(sea) => Some(sea.join()),
        Opened::Fleet(fleet) => fleet.join(),
    })
    .flatten()
    .unwrap_or(0)
}

/// Why the open room takes no player (`refusal`), as UTF-8; empty when it takes them.
#[unsafe(no_mangle)]
pub extern "C" fn room_refusal() -> u64 {
    hand_over(refusal().unwrap_or_default().into_bytes())
}

/// The welcome's bytes for a player.
#[unsafe(no_mangle)]
pub extern "C" fn room_joined(player: PlayerId) -> u64 {
    hand_over(joined(player))
}

#[unsafe(no_mangle)]
pub extern "C" fn room_leave(player: PlayerId) {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.leave(player),
        Opened::Sea(sea) => sea.leave(player),
        Opened::Fleet(fleet) => fleet.leave(player),
    });
}

/// Hands the room the player's input written at `address`, `length` bytes long; answers what became of it.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_input(player: PlayerId, address: *const u8, length: usize) -> i32 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    input(player, unsafe { std::slice::from_raw_parts(address, length) })
}

#[unsafe(no_mangle)]
pub extern "C" fn room_tick() {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => room.tick(),
        Opened::Sea(sea) => sea.tick(),
        Opened::Fleet(fleet) => fleet.tick(),
    });
}

/// Takes the snapshot after the last tick, for `room_snapshot_for` to hand each player theirs.
#[unsafe(no_mangle)]
pub extern "C" fn room_snapshot_prepare() {
    snapshot_door::prepare();
}

/// The prepared snapshot's bytes as one player is sent them: on land what changed since the one their screen last
/// showed; at sea only what is theirs of the sea's own part.
#[unsafe(no_mangle)]
pub extern "C" fn room_snapshot_for(player: PlayerId) -> u64 {
    hand_over(snapshot_door::snapshot_for(player))
}

/// The Sloop's build as the naval rules hold it, as JSON (`deck_door::sloop_build_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_sloop() -> u64 {
    hand_over(deck_door::sloop_build_json().into_bytes())
}

/// The port cities' ids as JSON (`world::ports::MAIN_PORTS`): every other city is a ruin.
#[unsafe(no_mangle)]
pub extern "C" fn room_main_ports() -> u64 {
    hand_over(serde_json::to_vec(&world::ports::MAIN_PORTS).unwrap_or_default())
}

/// Every enemy type the rules know, as JSON (`roster_door::roster_json`).
#[unsafe(no_mangle)]
pub extern "C" fn room_roster() -> u64 {
    hand_over(roster_door::roster_json().into_bytes())
}

/// Lets the open room take players' asks for foes; see `take_foe_asks`.
#[unsafe(no_mangle)]
pub extern "C" fn room_take_foe_asks() {
    take_foe_asks();
}

/// Plays the prologue's wreck in the open room; see `story_wreck`.
#[unsafe(no_mangle)]
pub extern "C" fn room_story_wreck() {
    story_wreck();
}

#[cfg(test)]
#[path = "climb_door_tests.rs"]
mod climb_door_tests;
#[cfg(test)]
#[path = "course_door_tests.rs"]
mod course_door_tests;
#[cfg(test)]
#[path = "door_tests.rs"]
mod door_tests;
#[cfg(test)]
#[path = "fleet_door_tests.rs"]
mod fleet_door_tests;
#[cfg(test)]
#[path = "garrison_door_tests.rs"]
mod garrison_door_tests;
#[cfg(test)]
#[path = "load_tests.rs"]
mod load_tests;
#[cfg(test)]
#[path = "public_door_tests.rs"]
mod public_door_tests;
