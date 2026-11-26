//! An activity's checkpoints, after Destiny's: the ground a company has won, where its fallen stand again by their
//! own respawn. In a dungeon, each room whose band has fallen, each seal broken and the Court once its Boss wakes, each
//! at the doorway its room is entered by, facing in; in a mission, each group's post once it is cleared. The fallen
//! stand at the won checkpoint farthest along, or before any at the way in. In a run's room, kept to one company, a
//! band holds the ground its fall won, standing no more while anyone is in it, so no company fights back through rooms
//! it cleared; a shared room's bands, and an empty run's, stand again after their wait, and an Abyss wipe stands every
//! one (`abyss.rs`).

use crate::{EventKind, Room};
use combat::sight::{apart, bearing};
use dungeon::{Cell, Dungeon, SIDES};
use movement::Body;

/// What wins a checkpoint: a garrison post's group fallen (by the post's number), a seal broken (by its number), or
/// the Court's Boss woken.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Won {
    Post(usize),
    Seal(usize),
    Court,
}

/// One checkpoint: where a fallen player stands at it (x, y, z), the way they face, how far along the activity it lies (a
/// dungeon room's walk from the way in, or a mission post's distance from its first spawn), and what wins it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Checkpoint {
    pub at: [f64; 3],
    pub facing: f64,
    pub along: f64,
    pub won: Won,
}

/// Where a body stands at a dungeon room's checkpoint, and the way it faces: at the middle of the doorway cell the walk
/// from the way in reaches first, facing in from the cell before it; none for a room no doorway opens.
pub(crate) fn doorway_of(dungeon: &Dungeon, walks: &[u32], room: usize) -> Option<([f64; 3], f64)> {
    let doorways: Vec<usize> = dungeon.frames.iter().map(|frame| frame.cell).collect();
    let cells = dungeon.rooms.get(room)?.cells.iter().copied();
    let entered = cells.filter(|cell| doorways.contains(cell)).min_by_key(|&cell| (walks[cell], cell))?;
    let before = SIDES
        .into_iter()
        .filter_map(|side| dungeon.beside(entered, side))
        .filter(|&cell| dungeon.cells[cell] != Cell::Rock && dungeon.room_at(cell) != Some(room))
        .min_by_key(|&cell| (walks[cell], cell))?;
    let at = dungeon.standing_point(entered);
    Some((at, bearing(dungeon.centre(before), [at[0], at[1]])))
}

impl Room {
    /// A dungeon's checkpoints: each room `bands` names by its post's number, then each seal of an Elite Dungeon and
    /// its Court in the end room.
    pub(crate) fn lay_dungeon_checkpoints(&mut self, dungeon: &Dungeon, bands: &[(usize, usize)]) {
        let walks = crate::encounter_plan::walks(dungeon);
        let mut laid = Vec::new();
        let mut lay = |room: usize, won: Won| {
            let along = f64::from(dungeon.rooms.get(room).map_or(0, |found| found.walk));
            if let Some((at, facing)) = doorway_of(dungeon, &walks, room) {
                laid.push(Checkpoint { at, facing, along, won });
            }
        };
        for &(post, room) in bands {
            lay(room, Won::Post(post));
        }
        if let Some(encounters) = self.encounters.as_ref() {
            for (seal, plan) in encounters.plan.seals.iter().enumerate() {
                lay(plan.room, Won::Seal(seal));
            }
            lay(dungeon.end(), Won::Court);
        }
        self.respawning.checkpoints = laid;
    }

    /// A mission's checkpoints: each of its garrison's posts, facing the encounter's last stand, along by its distance
    /// from the first spawn. Any other node lays none.
    pub(crate) fn lay_post_checkpoints(&mut self) {
        if self.clearing.as_ref().is_none_or(|clearing| clearing.clear != gear::rewards::Clear::Mission) {
            return;
        }
        let first = self.spawn_points.first().copied().unwrap_or_default();
        let last = self.encounter.as_ref().map(|encounter| [encounter.last_stand[0], encounter.last_stand[1]]);
        let laid = self.garrison.iter().enumerate().filter(|(_, post)| !post.arrival).map(|(number, post)| {
            let at = [post.at[0], post.at[1]];
            // The last stand's own post faces the room's way: it has nowhere further on to face.
            let facing = last.filter(|last| apart(at, *last) > 0.5).map_or(self.facing, |last| bearing(at, last));
            Checkpoint { at: post.at, facing, along: apart(at, [first.0, first.1]), won: Won::Post(number) }
        });
        self.respawning.checkpoints = laid.collect();
    }

    /// Whether a checkpoint's ground is won now: its group fallen, its seal broken, or the Court's Boss woken (with no
    /// seal, once reached).
    fn won(&self, won: Won) -> bool {
        match won {
            Won::Post(post) => self.garrison.get(post).is_some_and(|found| found.cleared_at.is_some()),
            Won::Seal(seal) => self.encounters.as_ref().is_some_and(|encounters| {
                encounters.seals.get(seal).is_some_and(|found| found.state == crate::encounters::SealState::Broken)
            }),
            // With seals the Boss wakes as the last breaks; with none it is awake from the first, so the Court's is won
            // only once a living player has stood in it with the Boss (Fury's clock begun).
            Won::Court => self.encounters.as_ref().is_some_and(|encounters| {
                let court = &encounters.court;
                court.woke_at.is_some() && (!encounters.plan.seals.is_empty() || court.fury_from.is_some())
            }),
        }
    }

    /// The checkpoint the fallen stand at now, by its number among the room's: the won one farthest along, the later
    /// laid of two as far; none before any is won.
    pub(crate) fn checkpoint(&self) -> Option<usize> {
        let checkpoints = self.respawning.checkpoints.iter().enumerate();
        let won = checkpoints.filter(|(_, checkpoint)| self.won(checkpoint.won));
        won.max_by(|(_, one), (_, two)| one.along.total_cmp(&two.along)).map(|(number, _)| number)
    }

    /// A body standing at the checkpoint, facing in; none before any is won.
    pub(crate) fn at_checkpoint(&self) -> Option<Body> {
        let checkpoint = self.respawning.checkpoints.get(self.checkpoint()?)?;
        let [x, y, z] = checkpoint.at;
        let body = self.stand((x, y));
        // A dungeon's storeys stand over one another: the fallen stand on the checkpoint's own.
        let z = match self.floor {
            crate::Floor::Dungeon(_) => movement::blocks::ground_at(&self.blocks, &self.floor, x, y, z),
            _ => body.z,
        };
        Some(Body { facing: checkpoint.facing, z, ..body })
    }

    /// Whether a post's group holds the ground its fall won: in a run's room, kept to one company, while someone is in
    /// it; a shared room's groups stand again as any group does, so the next to come finds them.
    pub(crate) fn holds_ground(&self, post: usize) -> bool {
        let won = self.respawning.checkpoints.iter().any(|checkpoint| checkpoint.won == Won::Post(post));
        self.respawning.holds_ground && !self.players.is_empty() && won
    }

    /// Each tick, as the checkpoint stood at moves on to one farther along, every player is told, with no amount: the
    /// page takes an amount aimed at a player for a blow taken.
    pub(crate) fn keep_checkpoints(&mut self, was: Option<usize>) {
        let now = self.checkpoint();
        let along = |number: Option<usize>| number.and_then(|found| self.respawning.checkpoints.get(found));
        let farther = match (along(was), along(now)) {
            (_, None) => false,
            (None, Some(_)) => true,
            (Some(before), Some(after)) => after.along > before.along,
        };
        if farther {
            self.tell_all(EventKind::Checkpoint, 0.0);
        }
    }
}

#[cfg(test)]
#[path = "checkpoints_tests.rs"]
mod checkpoints_tests;
