//! A patrol's chests and containers as its node file names them: the bake writes its chest places and its props that
//! hold things; a page playing alone writes the chest places and every prop of its layout, of which the room takes
//! those that hold things as the bake would (`dungeon::models::held_by`).

use room::Room;
use serde::Deserialize;

/// What a patrol's node file names of its finds.
#[derive(Debug, Deserialize, Default)]
pub(crate) struct Finds {
    /// Its chest places, each x, y and the way it faces.
    #[serde(default)]
    chests: Vec<[f64; 3]>,
    /// Its props that hold things, each its box across, its foot, its top and its model.
    #[serde(default)]
    holders: Vec<[f64; 7]>,
    /// Its layout's props, each its model, its box across and its origin's height.
    #[serde(default)]
    props: Vec<[f64; 6]>,
}

/// Makes a patrol's room stand its chests and make its holders searchable.
pub(crate) fn lay(room: &mut Room, finds: Finds) {
    let held = finds.props.iter().filter_map(|&[model, west, north, east, south, up]| {
        dungeon::models::held_by(model as u32, [west, north, east, south], up)
    });
    room.lay_finds(&finds.chests, finds.holders.into_iter().chain(held).collect());
}
