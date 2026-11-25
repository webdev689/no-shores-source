//! A patrol's dungeon as a room: the Forge's floor in the dungeon's own frame (x east, y south from its north-west
//! corner, its floor at 0 m), one spawn at the way in, and a navmesh over the whole dungeon kept to the floor joined to
//! the way in. Its garrison is the Grey Tithe's dungeon garrison standing where the Forge puts foes: its end foe (the
//! Reeve, a Miniboss, or an Elite Dungeon's own Boss) alone in the end room, and a band in each other room past the
//! way in's as far as the room's most foes allow, each room's on its free cells nearest its middle, its quiet cells first, round its props. Beside the end
//! foe's post stands the cache, shut while it stands; when it falls the cache opens and every player then in the room
//! finds a Vestige before it, theirs alone, and a second where the run's first clear pays (`run_room.rs`).

use crate::dungeon_ground::clear_of;
use crate::garrison::{DUNGEON, Post, draws_of, index, node_seed};
use crate::run::Run;
use crate::{Floor, NODE_FOES_MOST, PlayerId, Room};
use ::foes::Rank::{self, Miniboss};
use ::foes::roster::REEVE;
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

/// A dungeon's cache: where it stands (x, y, z), the way it faces, where a Vestige thrown out of it comes to rest, the
/// post of the Reeve it lies by, and whether it stands open.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct Cache {
    pub at: [f64; 3],
    pub facing: f64,
    pub vestige: [f64; 3],
    pub post: usize,
    pub open: bool,
}

/// The navmesh's cell in a dungeon: an eighth of the Forge's, so every wall lies on a cell's edge, and the bake holds
/// about a third of the columns the land's 0.25 m would over the dungeon's whole rectangle.
const NAV_CELL_M: f64 = CELL_M / 8.0;

/// A dungeon room's navmesh: over the whole dungeon, its ground's jambs and pillars and its blocks (an Ascent's pads),
/// kept to the floor the way in stands on, in cells of NAV_CELL_M.
pub(crate) fn baked(floor: &Floor, blocks: &[Block], first: (f64, f64), section: &Section) -> NavMesh {
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
            let mut solids: Vec<Block> = ground.solids().iter().map(standing).collect();
            // An Ascent's pads too, so no foe paths up their sides or off their tops.
            solids.extend(blocks.iter().map(|pad| Block { top: pad.top.max(agent.height), ..*pad }));
            NavMesh::bake_anchored(&solids, ground.grid(), bounds, &agent, anchor)
        }
        Floor::Flat | Floor::Sea(_) | Floor::Land(_) | Floor::Deck(_) | Floor::Island(_) => {
            NavMesh::bake_anchored(&[], floor, bounds, &agent, anchor)
        }
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
    /// A patrol's dungeon by its number as its patrol's shared room, its garrison standing at the patrol's island band
    /// of `levels`, its first clear at Normal paying the day's while it is its island's dungeon of the day: none for a
    /// number past the patrol's dungeons.
    #[must_use]
    pub fn dungeon(patrol: &str, number: usize, levels: Option<(u8, u8)>) -> Option<Self> {
        if number >= dungeon::PER_PATROL {
            return None;
        }
        let (seed, style) = dungeon::of_patrol(patrol, number);
        let (name, laid) = (format!("{patrol}--dungeon-{number}"), Dungeon::forge(seed, style));
        let mut room = Self::laid_dungeon(&name, &laid, levels, (REEVE, Miniboss), Some(Run::today(patrol, number)))?;
        room.place = Some(gear::gate::Place::PatrolDungeon);
        room.source = gear::Source::Dungeon;
        room.island = gear::activities::island_of(patrol).map(|island| island.continent);
        Some(room)
    }

    /// The room of a laid dungeon: `name` seeds its world, `levels` is its foes' band, `end` the type and rank that
    /// stands alone in its end room, and `run` what its run carries, known before its garrison stands. A Boss's end is
    /// an Elite Dungeon's, which lays its encounters (`encounters.rs`). Gated by its tier alone until its maker says
    /// what place it is. None where its floor cannot be made.
    pub(crate) fn laid_dungeon(
        name: &str,
        dungeon: &Dungeon,
        levels: Option<(u8, u8)>,
        end: (u8, Rank),
        run: Option<Run>,
    ) -> Option<Self> {
        let floor = Floor::of_dungeon(dungeon)?;
        // An Elite Dungeon, whose end is its Boss, lays its encounters: an Ascent's pads are the blocks a body climbs.
        let plan = (end.1 == Rank::Boss).then(|| crate::encounter_plan::plan_encounters(dungeon));
        let pads = plan.as_ref().map(crate::encounter_plan::EncounterPlan::pads).unwrap_or_default();
        let (width, depth) = (dungeon.columns as f64 * CELL_M, dungeon.rows as f64 * CELL_M);
        let ([x, y], [toward_x, toward_y]) = dungeon.arrival();
        let ring = vec![[0.0, 0.0], [width, 0.0], [width, depth], [0.0, depth]];
        // Its jambs and pillars are its ground's own walls, not blocks a body could climb; its pads are blocks.
        let mut room = Self::node(floor, pads, Section { ring, spawns: vec![[x, y]], falls_kill: false });
        room.facing = bearing([x, y], [x + toward_x, y + toward_y]);
        room.ways_out = Some((dungeon.exit_door(), dungeon.portal_door()));
        // Shut by its seas alone, as a node with no patrol is; a patrol's own dungeon is gated as its patrol.
        room.place = Some(gear::gate::Place::Node);
        room.world_seed = node_seed(name);
        room.foes_most = NODE_FOES_MOST;
        room.run = run;
        let bands = room.stand_dungeon_garrison(dungeon, levels, end);
        // Its chests keep out of its seals' rooms, whose pieces fill their floors.
        let kept: Vec<usize> = plan.iter().flat_map(|plan| plan.seals.iter().map(|seal| seal.room)).collect();
        if let Floor::Dungeon(ground) = &room.floor {
            room.finds = crate::finds::Finds::of_dungeon(dungeon, ground, &kept);
        }
        if let Some(plan) = plan {
            room.lay_encounters(plan, levels);
            let end = dungeon.rooms.get(dungeon.end()).map(|end| end.cells.clone()).unwrap_or_default();
            if let Some(encounters) = room.encounters.as_mut() {
                encounters.court_cells = end;
                encounters.reckoning_cells = crate::encounters::court::reckoning_reach(dungeon);
            }
        }
        room.lay_dungeon_checkpoints(dungeon, &bands);
        Some(room)
    }

    /// Posts the end foe alone at the end room's middle, facing the way in, and a band drawn from the dungeon garrison
    /// in each room `band_rooms` names, each foe on a cell nearest its room's middle facing out from it; then girds and
    /// stands them as any garrison, and lays the cache by the end foe. Answers each band's post by its number, with its
    /// room.
    pub(crate) fn stand_dungeon_garrison(
        &mut self,
        dungeon: &Dungeon,
        levels: Option<(u8, u8)>,
        (number, rank): (u8, Rank),
    ) -> Vec<(usize, usize)> {
        let (arrival, _) = dungeon.arrival();
        let end = dungeon.end();
        let reeve = self.placed(dungeon, end, 1).first().copied().unwrap_or([arrival[0], arrival[1], 0.0]);
        let members = vec![(number, rank, reeve, bearing([reeve[0], reeve[1]], arrival))];
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
        let mut bands = Vec::new();
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
            bands.push((self.garrison.len(), room));
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
        bands
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

    /// Each tick: the cache opens as its Reeve's post is cleared, paying every player in the room a dungeon's clear,
    /// and shuts as the Reeve stands again.
    pub(crate) fn keep_cache(&mut self) {
        let Some(cache) = self.cache else { return };
        let Some(post) = self.garrison.get(cache.post) else { return };
        let open = post.cleared_at.is_some();
        if open && !cache.open {
            if let Some(run) = self.run.as_mut() {
                run.won = true;
            }
            let level = self.at_seas(post.girds.first().map_or(0, |&(level, _)| level));
            let players: Vec<PlayerId> = self.players.keys().copied().collect();
            let (cleared, day) =
                (gear::objectives::Feat::Cleared { island: self.island, tier: self.difficulty }, self.day());
            for player in players {
                self.pay_cache(player, &cache, level);
                self.pay_clear(player, level);
                // Counted as the clear pays, for those the room keeps, once a day each however often the cache opens.
                let owner = self.players.get(&player).and_then(|found| found.owner.clone());
                let first =
                    owner.is_some_and(|owner| self.run.as_mut().is_some_and(|run| run.count_clear(&owner, day)));
                if first {
                    self.saw(player, &cleared);
                }
            }
        }
        // As its garrison stands again, its chests and containers are drawn anew.
        if cache.open && !open {
            self.finds.drawn = false;
        }
        self.cache = Some(Cache { open, ..cache });
    }

    /// A dungeon's clear for a player as its cache opens, at the Reeve's level, as the owner chose for a dungeon's
    /// completion: its XP and Aurem, an item as itself coloured as its Miniboss's, and now and then a Vestige.
    fn pay_cache(&mut self, player: PlayerId, cache: &Cache, level: u8) {
        let (dice, difficulty, source) = (self.dice(player), self.difficulty, self.source);
        let Some(found) = self.players.get_mut(&player) else { return };
        let vestiges = found.character.reward_clear(gear::rewards::Clear::Dungeon, level, difficulty, source, &dice);
        found.gear_changed = true;
        // Poured out of the cache onto the floor before it, which `cache_by` keeps clear.
        self.pour(player, vestiges, cache.at, Some(cache.vestige));
    }

    /// The cache of a dungeon's room, as the snapshot carries it: x, y, z, the way it faces, and 1 open or 0 shut.
    #[must_use]
    pub fn cache(&self) -> Option<[f64; 5]> {
        self.cache.map(|cache| [cache.at[0], cache.at[1], cache.at[2], cache.facing, f64::from(u8::from(cache.open))])
    }
}

/// The cache by the Reeve's post, facing it: the first of the eight ways round it (north first, clockwise),
/// CACHE_FROM_POST_M from it, that is open floor with nothing between, where the whole chest, its lid open, keeps
/// clear of rock, of every solid and of the portal's arch; else on the post itself, facing the first way with open
/// floor VESTIGE_BEFORE_M off and nothing between. Its Vestige lies VESTIGE_BEFORE_M before it, or on the post where
/// no way has such floor.
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
    let open_from_post = |[x, y]: [f64; 2]| {
        ground.clear_between([post[0], post[1]], [x, y], 0.0) && !floor.walled((post[0], post[1]), (x, y))
    };
    let ways = [(0.0, -1.0), (1.0, -1.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (-1.0, 1.0), (-1.0, 0.0), (-1.0, -1.0)];
    let found = ways.into_iter().find_map(|(east, south): (f64, f64)| {
        let across = if east != 0.0 && south != 0.0 { diagonal } else { CACHE_FROM_POST_M };
        let (x, y) = (post[0] + east * across, post[1] + south * across);
        let reach = CHEST_BACK_M / CACHE_FROM_POST_M;
        let back = [x + (x - post[0]) * reach, y + (y - post[1]) * reach];
        // Nothing between the post and the cache, where the Vestiges lie, and the chest clear all round.
        let fits = open_from_post([x, y])
            && ground.clear_between([x, y], back, CHEST_HALF_M)
            && clear_of(arch, [x, y], back, CHEST_HALF_M);
        fits.then_some((x, y))
    });
    let before = |[x, y]: [f64; 2], facing: f64| {
        [x + libm::sin(facing) * VESTIGE_BEFORE_M, y - libm::cos(facing) * VESTIGE_BEFORE_M]
    };
    let (at, facing, vestige) = if let Some((x, y)) = found {
        let facing = bearing([x, y], [post[0], post[1]]);
        ([x, y], facing, before([x, y], facing))
    } else {
        // No Reeve the tests' dungeons stand comes here, but a dungeon without its cache would never open its portal.
        let at = [post[0], post[1]];
        let facings = ways.map(|(east, south)| bearing([0.0, 0.0], [east, south]));
        let open = facings.into_iter().find(|&facing| open_from_post(before(at, facing)));
        (at, open.unwrap_or(0.0), open.map_or(at, |facing| before(at, facing)))
    };
    let height = floor.height_at(at[0], at[1]);
    Some(Cache { at: [at[0], at[1], height], facing, vestige: [vestige[0], vestige[1], height], post: 0, open: false })
}

#[cfg(test)]
#[path = "dungeon_room_tests.rs"]
mod dungeon_room_tests;
