//! A course's room as a page playing alone asks of it, and a server never does: a foe of the roster stood where the
//! page puts it, every foe sent away, a checkpoint, the player stood somewhere at once, and a block stood or taken
//! after the room opened (the room crate's `course.rs`). Each answers nothing but whether it was done.

use super::{Opened, with_open};
use movement::Block;
use room::{PlayerId, Room};

/// Runs `ask` on a course's or node's room; None at sea, in a fleet or with no room open.
fn on_land<T>(ask: impl FnOnce(&mut Room) -> T) -> Option<T> {
    with_open(|opened| match opened {
        Opened::Land { room, .. } => Some(ask(room)),
        Opened::Sea(_) | Opened::Fleet(_) => None,
    })
    .flatten()
}

/// Stands a foe of the roster where the page puts it (`Room::stand_foe_at`); its number, or 0 when none stood.
pub fn stand_foe(foe_type: u8, rank: u8, at: (f64, f64), facing: f64, level: u8) -> u32 {
    on_land(|room| room.stand_foe_at(foe_type, rank, at, facing, level)).flatten().unwrap_or(0)
}

/// Sends every foe away at once; false with no room on land.
pub fn clear_foes() -> bool {
    on_land(Room::clear_foes).is_some()
}

/// Sets where the next respawn stands the player; false with no room on land.
pub fn set_spawn(x: f64, y: f64) -> bool {
    on_land(|room| room.set_spawn(x, y)).is_some()
}

/// Stands a player at once on the top under (x, y); false for no such player or no room on land.
pub fn put_player(player: PlayerId, x: f64, y: f64) -> bool {
    on_land(|room| room.put_player(player, x, y)).unwrap_or(false)
}

/// Stands a block on the course, in the room and in this instance's own course for prediction; false with no room
/// on land.
pub fn stand_block(block: Block) -> bool {
    let stood = on_land(|room| room.stand_block(block)).is_some();
    if stood {
        super::fighter_door::COURSE.with(|course| course.borrow_mut().push(block));
    }
    stood
}

/// Takes a block from the course, in the room and in this instance's own course for prediction; false when the room
/// holds no such block or none is open on land.
pub fn take_block(block: Block) -> bool {
    let taken = on_land(|room| room.take_block(block)).unwrap_or(false);
    if taken {
        super::fighter_door::COURSE.with(|course| {
            let mut course = course.borrow_mut();
            if let Some(found) = course.iter().position(|stood| *stood == block) {
                course.remove(found);
            }
        });
    }
    taken
}

/// Stands a foe (`stand_foe`): its type, rank and level as the roster numbers them, where, and the way it faces in
/// radians clockwise from north.
#[unsafe(no_mangle)]
pub extern "C" fn room_stand_foe(foe_type: u32, rank: u32, x: f64, y: f64, facing: f64, level: u32) -> u32 {
    let number = |value: u32| u8::try_from(value).unwrap_or(u8::MAX);
    stand_foe(number(foe_type), number(rank), (x, y), facing, number(level))
}

/// Sends every foe away (`clear_foes`); 1 if done, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_clear_foes() -> u32 {
    u32::from(clear_foes())
}

/// Sets the checkpoint (`set_spawn`); 1 if set, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_set_spawn(x: f64, y: f64) -> u32 {
    u32::from(set_spawn(x, y))
}

/// Stands a player at once (`put_player`); 1 if stood, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_put_player(player: u32, x: f64, y: f64) -> u32 {
    u32::from(put_player(player, x, y))
}

/// The story's sword and shield taken from the deck into a player's pack (`Room::story_take_arms`); 1 if given, 0 if
/// not.
#[unsafe(no_mangle)]
pub extern "C" fn room_story_take_arms(player: u32) -> u32 {
    u32::from(on_land(|room| room.story_take_arms(player)).unwrap_or(false))
}

/// The story sends a foe at a player (`Room::story_hunt`); 1 if sent, 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_story_hunt(foe: u32, player: u32) -> u32 {
    u32::from(on_land(|room| room.story_hunt(foe, player)).unwrap_or(false))
}

/// Stands a block (`stand_block`) from its west, north, east and south edges, its top and its underside; 1 if stood,
/// 0 if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_stand_block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64, bottom: f64) -> u32 {
    u32::from(stand_block(Block { min_x, min_y, max_x, max_y, top, bottom }))
}

/// Takes a block (`take_block`) by its west, north, east and south edges, its top and its underside; 1 if taken, 0
/// if not.
#[unsafe(no_mangle)]
pub extern "C" fn room_take_block(min_x: f64, min_y: f64, max_x: f64, max_y: f64, top: f64, bottom: f64) -> u32 {
    u32::from(take_block(Block { min_x, min_y, max_x, max_y, top, bottom }))
}
