//! What a page playing a course alone may ask of its own room, and a server never does: a room laid over the open
//! sea, a foe of the roster stood where the page puts it, every foe sent away at once, the spawn the next respawn
//! stands the player at, the player stood somewhere at once, and a block stood on the course after it opened or taken
//! from it. A story level is played so: its waves placed, its checkpoints kept, its ways closed until a wave falls, and
//! every body held on its blocks.

use crate::{Floor, PlayerId, Room};
use ::foes::{Rank, foe_type};
use combat::fighter::FighterId;
use movement::blocks::ground_at;
use movement::{Block, Body, Heights, standing};

pub use movement::heights::RIM_CELL_M;

impl Room {
    /// An empty room on a course of blocks laid over the open sea, as a wreck's decks are: the rim round the blocks
    /// holds every body on them, as a ship's deck holds its crew, and its foes' navmesh is the blocks' tops alone. It
    /// holds as many foes as a node, for a wreck's boarders and the crew who fight them.
    #[must_use]
    pub fn over_sea(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        let rim = Heights::rim(&blocks, RIM_CELL_M);
        Self { foes_most: crate::NODE_FOES_MOST, ..Self::on(Floor::Sea(Box::new(rim)), blocks, vec![spawn], None) }
    }

    /// A foe found off the course laid over the sea, where nothing it walks reaches, stands again at its post, as it
    /// was posted: the rim holds bodies, so only a foe set down there comes to it.
    pub(crate) fn keep_on_course(&mut self) {
        let Floor::Sea(rim) = &self.floor else { return };
        let astray: Vec<(FighterId, [f64; 3], f64)> = self
            .foes
            .iter()
            .filter(|(_, foe)| !rim.stands_at(foe.fighter.body.x, foe.fighter.body.y))
            .filter_map(|(id, foe)| foe.brain.home().map(|home| (*id, home.at, home.facing)))
            .collect();
        for (id, [x, y, _], facing) in astray {
            let body = Body { facing, ..self.on_top(x, y) };
            if let Some(foe) = self.foes.get_mut(&id) {
                foe.fighter.body = body;
            }
        }
    }

    /// A body standing at (x, y) on the top of the highest block under it, or on the floor where none stands.
    pub(crate) fn on_top(&self, x: f64, y: f64) -> Body {
        Body { z: ground_at(&self.blocks, &self.floor, x, y, f64::INFINITY), ..standing(x, y) }
    }

    /// Stands a foe of the roster's type `type_number` at rank `rank_number` (its type's first rank when it has not
    /// that one) on the top under (x, y), facing `facing`, its post there, at `level` (0 fights by combat's own
    /// numbers). A Boss stood so calls no one in its phases: the page places every foe its scene holds. None when
    /// no type has that number or the room holds as many foes as it may.
    pub fn stand_foe_at(
        &mut self,
        type_number: u8,
        rank_number: u8,
        (x, y): (f64, f64),
        facing: f64,
        level: u8,
    ) -> Option<FighterId> {
        let found = foe_type(type_number)?;
        if self.living_foes() >= self.foes_most {
            return None;
        }
        let rank = found.rank_or_first(Rank::from_number(rank_number));
        let top = self.on_top(x, y);
        let id = self.stand_foe(found, rank, [x, y, top.z], facing, None);
        self.gird(id, level, None);
        if let Some(foe) = self.foes.get_mut(&id) {
            foe.brain.posted_at([x, y, top.z], facing);
        }
        self.quiet.insert(id);
        Some(id)
    }

    /// Sends every foe away at once, as a scene clears its stage.
    pub fn clear_foes(&mut self) {
        self.send_foes_away();
    }

    /// Where the next respawn stands the player: a checkpoint.
    pub fn set_spawn(&mut self, x: f64, y: f64) {
        self.spawn_points = vec![(x, y)];
    }

    /// Stands a player at once on the top under (x, y), still, keeping their health and what they hold, as when
    /// they fall into the sea and are brought back. False for no such player.
    pub fn put_player(&mut self, player: PlayerId, x: f64, y: f64) -> bool {
        let body = self.on_top(x, y);
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.fighter.body = Body { facing: found.fighter.body.facing, ..body };
        true
    }

    /// Stands a block on the course at once, as a way closing behind a player. The foes' navmesh is not baked again:
    /// their routes still run where it stands, so it is for a way no foe is left to walk.
    pub fn stand_block(&mut self, block: Block) {
        self.blocks.push(block);
    }

    /// Takes a block from the course at once, as a way opening: the first block equal to `block`. False when none is.
    pub fn take_block(&mut self, block: Block) -> bool {
        let Some(found) = self.blocks.iter().position(|stood| *stood == block) else { return false };
        self.blocks.remove(found);
        true
    }
}
