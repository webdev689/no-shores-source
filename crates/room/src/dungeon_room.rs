//! A patrol's dungeon as a room: the Forge's floor in the dungeon's own frame (x east, y south from its north-west
//! corner, its floor at 0 m), one spawn at the way in, and a navmesh over the whole dungeon kept to the floor joined to
//! the way in. Its garrison is the Grey Tithe's dungeon garrison standing where the Forge puts foes: the Reeve, a
//! Miniboss, alone in the end room, and a band in each other room past the way in's, each room's on its free cells
//! nearest its middle, its quiet cells first, round its props. Beside the Reeve's post stands the cache, shut while the Reeve stands; when the Reeve falls it
//! opens and every player then in the room finds a Vestige before it, theirs alone.

use crate::dungeon_ground::clear_of;
use crate::garrison::{DUNGEON, Post, draws_of, index, node_seed};
use crate::{Floor, NODE_FOES_MOST, PlayerId, Room};
use ::foes::Rank::{self, Miniboss};
use ::foes::roster::{REEVE, foe_type};
use combat::sight::bearing;
use dungeon::{CELL_M, Dungeon};
use movement::{Block, Terrain};
use navmesh::NavMesh;
use reach::Section;

/// How far the cache stands from the Reeve's post (m).
const CACHE_FROM_POST_M: f64 = 1.6;
/// The chest the page draws for the cache (`dungeonChest.ts`): half its width, and how far behind its front, away
/// from the post, it reaches with its lid thrown back open (m).
const CHEST_HALF_M: f64 = 0.45;
const CHEST_BACK_M: f64 = 0.82;
/// How far the portal's arch spans either side of its middle along its wall (m): the cache keeps out of that span of
/// the portal's cell, from the wall to the cell's middle, where a body comes to leave.
const ARCH_HALF_M: f64 = 1.3;
/// How far before the cache a Vestige lies (m).
const VESTIGE_BEFORE_M: f64 = 0.8;

/// A dungeon's cache: where it stands (x, y, z), the way it faces, the post of the Reeve it lies by, and whether it
/// stands open.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Cache {
    pub at: [f64; 3],
    pub facing: f64,
    pub post: usize,
    pub open: bool,
}

/// The navmesh's cell in a dungeon: an eighth of the Forge's, so every wall lies on a cell's edge, and the bake holds
/// about a third of the columns the land's 0.25 m would over the dungeon's whole rectangle.
const NAV_CELL_M: f64 = CELL_M / 8.0;

/// A dungeon room's navmesh: over the whole dungeon and its ground's jambs and pillars, kept to the floor the way in
/// stands on, in cells of NAV_CELL_M.
pub(crate) fn baked(floor: &Floor, first: (f64, f64), section: &Section) -> NavMesh {
    let fold = |pick: fn(f64, f64) -> f64, start: f64, axis: usize| {
        section.ring.iter().fold(start, |kept, corner| pick(kept, corner[axis]))
    };
    let bounds = navmesh::Bounds {
        min_x: fold(f64::min, f64::INFINITY, 0),
        min_y: fold(f64::min, f64::INFINITY, 1),
        max_x: fold(f64::max, f64::NEG_INFINITY, 0),
        max_y: fold(f64::max, f64::NEG_INFINITY, 1),
    };
    let agent = navmesh::Agent { cell_size: NAV_CELL_M, ..navmesh::AGENT };
    let anchor = [first.0, first.1, floor.height_at(first.0, first.1)];
    match floor {
        // On the cells' heights alone, the jambs and pillars its colliders: a solid read as ground would make the
        // floor beside it too steep to walk, and narrow every doorway past a body's width. Each stands a body's height
        // at least, since the ground walls a solid however low: no path runs over a pool's rim or a dais.
        Floor::Dungeon(ground) => {
            // Each stands on the dungeon's one floor.
            let standing = |&[min_x, min_y, max_x, max_y, top]: &[f64; 5]| Block {
                min_x,
                min_y,
                max_x,
                max_y,
                top: top.max(agent.height),
                bottom: dungeon::FLOOR_M,
            };
            let solids: Vec<Block> = ground.solids().iter().map(standing).collect();
            NavMesh::bake_anchored(&solids, ground.grid(), bounds, &agent, anchor)
        }
        Floor::Flat | Floor::Sea(_) | Floor::Land(_) => NavMesh::bake_anchored(&[], floor, bounds, &agent, anchor),
    }
}

/// A room's band size: as many foes as the cells its props leave free for them.
fn band_size(cells: usize) -> usize {
    dungeon::posts_for(cells)
}

/// The rooms that stand a band, by walk from the way in: every room past the way in's but the end; when their bands
/// and the Reeve would pass `most`, the most of them that fit, spread evenly along the walk.
fn band_rooms(dungeon: &Dungeon, most: usize) -> Vec<usize> {
    let end = dungeon.end();
    let mut rooms: Vec<usize> =
        (0..dungeon.rooms.len()).filter(|&room| room != end && room != dungeon.way_in.room).collect();
    rooms.sort_by_key(|&room| (dungeon.rooms[room].walk, room));
    let size = |room: &usize| band_size(dungeon.rooms[*room].cells.len());
    for count in (0..=rooms.len()).rev() {
        // The middle of each of `count` equal stretches of the walk.
        let spread: Vec<usize> = (0..count).map(|nth| rooms[(2 * nth + 1) * rooms.len() / (2 * count)]).collect();
        // The Reeve stands too: the bands take what is left of the room's most.
        if spread.iter().map(size).sum::<usize>() < most {
            return spread;
        }
    }
    Vec::new()
}

impl Room {
    /// A patrol's dungeon by its number as a room, its garrison standing at the patrol's island band of `levels`: none
    /// for a number past the patrol's dungeons.
    #[must_use]
    pub fn dungeon(patrol: &str, number: usize, levels: Option<(u8, u8)>) -> Option<Self> {
        if number >= dungeon::PER_PATROL {
            return None;
        }
        let (seed, style) = dungeon::of_patrol(patrol, number);
        Self::dungeon_of(&format!("{patrol}--dungeon-{number}"), seed, style, levels)
    }

    /// The room of a dungeon laid by a seed and a style, where no patrol lays it (a sea island's): `name` seeds its
    /// world, as a patrol's dungeon's room name does, and `levels` is its foes' band, the tier already applied. None
    /// where its floor cannot be made.
    #[must_use]
    pub fn dungeon_of(name: &str, seed: u32, style: dungeon::Style, levels: Option<(u8, u8)>) -> Option<Self> {
        let dungeon = Dungeon::forge(seed, style);
        let floor = Floor::of_dungeon(&dungeon)?;
        let (width, depth) = (dungeon.columns as f64 * CELL_M, dungeon.rows as f64 * CELL_M);
        let ([x, y], [toward_x, toward_y]) = dungeon.arrival();
        let ring = vec![[0.0, 0.0], [width, 0.0], [width, depth], [0.0, depth]];
        // Its jambs and pillars are its ground's own walls, not blocks a body could climb.
        let mut room = Self::node(floor, Vec::new(), Section { ring, spawns: vec![[x, y]] });
        room.facing = bearing([x, y], [x + toward_x, y + toward_y]);
        room.world_seed = node_seed(name);
        room.foes_most = NODE_FOES_MOST;
        room.stand_dungeon_garrison(&dungeon, levels);
        Some(room)
    }

    /// Posts the Reeve alone at the end room's middle, facing the way in, and a band drawn from the dungeon garrison in
    /// each room `band_rooms` names, each foe on a cell nearest its room's middle facing out from it; then girds and
    /// stands them as any garrison, and lays the cache by the Reeve.
    fn stand_dungeon_garrison(&mut self, dungeon: &Dungeon, levels: Option<(u8, u8)>) {
        let (arrival, _) = dungeon.arrival();
        let end = dungeon.end();
        let reeve = self.placed(dungeon, end, 1).first().copied().unwrap_or([arrival[0], arrival[1], 0.0]);
        let members = vec![(REEVE, Miniboss, reeve, bearing([reeve[0], reeve[1]], arrival))];
        self.garrison.push(Post {
            at: reeve,
            members,
            girds: Vec::new(),
            standing: Vec::new(),
            cleared_at: None,
            beat: None,
            leader: None,
            broken: false,
            defending: false,
            fallback: reeve,
            anchor: None,
            arrival: false,
        });
        let mut draws = draws_of(self.world_seed);
        for room in band_rooms(dungeon, self.foes_most) {
            let found = &dungeon.rooms[room];
            let middle = [
                (found.x as f64 + found.width as f64 / 2.0) * CELL_M,
                (found.y as f64 + found.depth as f64 / 2.0) * CELL_M,
            ];
            let places = self.placed(dungeon, room, band_size(found.cells.len()));
            let members: Vec<(u8, Rank, [f64; 3], f64)> = places
                .iter()
                .map(|&place| {
                    let (number, rank) = DUNGEON[index(&mut draws, DUNGEON.len())];
                    (number, rank, place, bearing(middle, [place[0], place[1]]))
                })
                .collect();
            let at = places.first().copied().unwrap_or([middle[0], middle[1], 0.0]);
            self.garrison.push(Post {
                at,
                members,
                girds: Vec::new(),
                standing: Vec::new(),
                cleared_at: None,
                beat: None,
                leader: None,
                broken: false,
                defending: false,
                fallback: at,
                anchor: None,
                arrival: false,
            });
        }
        self.gird_and_stand(levels);
        self.cache = cache_by(&self.floor, dungeon, reeve);
    }

    /// Where `count` foes stand in a room: its free cells nearest its middle, each on the navmesh.
    fn placed(&self, dungeon: &Dungeon, room: usize, count: usize) -> Vec<[f64; 3]> {
        dungeon
            .nearest_middle(room, count)
            .into_iter()
            .map(|cell| {
                let [x, y] = dungeon.centre(cell);
                let place = [x, y, self.floor.height_at(x, y)];
                self.nav.nearest_point(place).unwrap_or(place)
            })
            .collect()
    }

    /// Each tick: the cache opens as its Reeve's post is cleared, a Vestige lying before it for every player in the
    /// room, and shuts as the Reeve stands again.
    pub(crate) fn keep_cache(&mut self) {
        let Some(cache) = self.cache else { return };
        let Some(post) = self.garrison.get(cache.post) else { return };
        let open = post.cleared_at.is_some();
        if open && !cache.open {
            let level = self.at_seas(post.girds.first().map_or(0, |&(level, _)| level));
            let players: Vec<PlayerId> = self.players.keys().copied().collect();
            for player in players {
                self.lay_cache_vestige(player, &cache, level);
            }
        }
        self.cache = Some(Cache { open, ..cache });
    }

    /// A sure Vestige for a player before the cache, at the Reeve's level and in the colours a Reeve's kill drops.
    fn lay_cache_vestige(&mut self, player: PlayerId, cache: &Cache, level: u8) {
        let boss = foe_type(REEVE)
            .and_then(|reeve| crate::power::worth_of(reeve.role as u8))
            .is_some_and(|worth| gear::rewards::worth(worth).boss);
        let dice = self.dice(player);
        let Some((rarity, slot, level)) = gear::vestige::dropped(1.0, boss, level, &dice) else { return };
        let Some(found) = self.players.get_mut(&player) else { return };
        let vestige = gear::Vestige::new(found.character.take_id(), rarity, slot, level);
        found.gear_changed = true;
        let (east, south) = (libm::sin(cache.facing), -libm::cos(cache.facing));
        let at = [cache.at[0] + east * VESTIGE_BEFORE_M, cache.at[1] + south * VESTIGE_BEFORE_M, cache.at[2]];
        // Thrown out of the cache onto the floor before it, which `cache_by` keeps clear, as a kill throws its drops.
        self.lay(player, crate::Dropped::Vestige(vestige), at, cache.at);
    }

    /// The cache of a dungeon's room, as the snapshot carries it: x, y, z, the way it faces, and 1 open or 0 shut.
    #[must_use]
    pub fn cache(&self) -> Option<[f64; 5]> {
        self.cache.map(|cache| [cache.at[0], cache.at[1], cache.at[2], cache.facing, f64::from(u8::from(cache.open))])
    }
}

/// The cache by the Reeve's post, facing it: the first of the eight ways round it (north first, clockwise),
/// CACHE_FROM_POST_M from it, that is open floor with nothing between, where the whole chest, its lid open, keeps
/// clear of rock, of every solid and of the portal's arch; else at the post itself.
fn cache_by(floor: &Floor, dungeon: &Dungeon, post: [f64; 3]) -> Option<Cache> {
    let Floor::Dungeon(ground) = floor else { return None };
    // The arch's span of the portal's cell, from its wall to the cell's middle.
    let [cell_x, cell_y] = dungeon.centre(dungeon.portal.cell);
    let [toward_x, toward_y] = dungeon.portal.side.unit();
    let deep = CELL_M / 4.0;
    let (middle_x, middle_y) = (cell_x + toward_x * deep, cell_y + toward_y * deep);
    let (half_x, half_y) = if toward_x == 0.0 { (ARCH_HALF_M, deep) } else { (deep, ARCH_HALF_M) };
    let arch = [middle_x - half_x, middle_y - half_y, middle_x + half_x, middle_y + half_y];
    let diagonal = CACHE_FROM_POST_M * core::f64::consts::FRAC_1_SQRT_2;
    let ways = [(0.0, -1.0), (1.0, -1.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (-1.0, 1.0), (-1.0, 0.0), (-1.0, -1.0)];
    let found = ways.into_iter().find_map(|(east, south): (f64, f64)| {
        let across = if east != 0.0 && south != 0.0 { diagonal } else { CACHE_FROM_POST_M };
        let (x, y) = (post[0] + east * across, post[1] + south * across);
        let reach = CHEST_BACK_M / CACHE_FROM_POST_M;
        let back = [x + (x - post[0]) * reach, y + (y - post[1]) * reach];
        // Nothing between the post and the cache, where the Vestiges lie, and the chest clear all round.
        let fits = ground.clear_between([post[0], post[1]], [x, y], 0.0)
            && !floor.walled((post[0], post[1]), (x, y))
            && ground.clear_between([x, y], back, CHEST_HALF_M)
            && clear_of(arch, [x, y], back, CHEST_HALF_M);
        fits.then_some((x, y))
    });
    // No dungeon the tests lay comes here, but a dungeon without its cache would never open its portal.
    let (x, y) = found.unwrap_or((post[0], post[1]));
    Some(Cache {
        at: [x, y, floor.height_at(x, y)],
        facing: if found.is_some() { bearing([x, y], [post[0], post[1]]) } else { 0.0 },
        post: 0,
        open: false,
    })
}

#[cfg(test)]
#[path = "dungeon_room_tests.rs"]
mod dungeon_room_tests;
