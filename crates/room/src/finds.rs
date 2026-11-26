//! Chests and containers to search, after Destiny 1's loot chests. In a patrol a few chests stand at once at places
//! drawn among its layout's (`layout::chests`), each moving on to another after a while, the next a little after the
//! last, and a share of its props that hold things is searchable, drawn again now and then. In every dungeon a chest
//! stands in a room of each block, against a wall, a vault's chest in each vault, and a share of its crates, shelves,
//! wardrobes and tombs is searchable, all drawn again as its garrison stands again. Each player opens each chest and
//! searches each container once (`find_holds.rs`). The draws are made on the room's loot seed at its first tick, once
//! its host has reseeded it, so no player can foresee them.

use crate::{PlayerId, Room};
use dungeon::{CELL_M, Cell, Dungeon, SIDES};
use gear::dice::{Dice, Purpose};
use gear::finds::Find;
use movement::Terrain;
use std::collections::BTreeMap;

/// How long a patrol's chest stands at one place, and how long its searchable containers stay so, ticks.
pub const CHEST_TURN_TICKS: u64 = 60 * 300;
pub const SEARCH_TURN_TICKS: u64 = 60 * 600;
/// A patrol stands a chest for every so many places, so many at least and at most.
const PLACES_A_CHEST: usize = 5;
const PATROL_CHESTS: [usize; 2] = [2, 4];
/// One container in so many is searchable, a patrol's and a dungeon's, and at most so many at once.
const PATROL_SHARE: usize = 6;
const DUNGEON_SHARE: usize = 4;
pub const SEARCHABLE_MOST: usize = 16;
/// A dungeon's chest (the cache's, `dungeonChest.ts`): how far its back stands off the wall it is against, so its lid
/// swinging back as it opens (up to 0.15 m behind it) keeps clear of the 0.3 m a kit piece stands proud of a wall;
/// half its depth and half its width, metres.
const OFF_WALL_M: f64 = 0.5;
/// How far a second chest in a dungeon's room stands from every other, metres: two cells.
const SECOND_APART_M: f64 = 2.0 * CELL_M;
pub const CHEST_HALF_DEEP_M: f64 = 0.25;
pub const CHEST_HALF_WIDE_M: f64 = 0.45;
/// The draws' own stream of the room's loot seed, apart from every roll of its players' loot.
const FINDS_STREAM: u64 = 0x0F1D_5000_C4E5_7000;

/// A place a chest may stand: x, y, z and the way its front faces, radians clockwise from north.
pub type ChestPlace = [f64; 4];
/// A prop that holds things: its box across (west, north, east, south), its foot and its top, metres, and its model.
pub type Holder = [f64; 7];

/// A chest standing: its place among the room's, its number, the tick it moves on (never, in a dungeon), and whether
/// it is a vault's, the finer chest in gold, rather than a plain one.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Chest {
    pub place: usize,
    pub number: u32,
    pub until: u64,
    pub vault: bool,
}

/// How many plain chests a dungeon stands: one for each block. Its vaults' chests stand besides (`Finds::vaults`).
pub(crate) fn dungeon_chests(dungeon: &Dungeon) -> usize {
    dungeon.squares.len()
}

/// A room's chests and containers: where its chests may stand, each with its group (a dungeon's room, one apiece in a
/// patrol), its props that hold things, what stands now, and what has been opened.
#[derive(Clone, Debug, Default)]
pub(crate) struct Finds {
    pub places: Vec<ChestPlace>,
    pub groups: Vec<usize>,
    pub holders: Vec<Holder>,
    pub patrol: bool,
    /// How many chests stand at once: a patrol's by its places, a dungeon's plain ones by `dungeon_chests`; and the
    /// rooms a dungeon's vaults' chests stand in, one each.
    pub count: usize,
    pub vaults: Vec<usize>,
    pub chests: Vec<Chest>,
    /// The containers searchable now, each by its place among the holders with its number; and until when (a
    /// patrol's).
    pub searchable: Vec<(usize, u32)>,
    pub searchable_until: u64,
    pub drawn: bool,
    pub next: u32,
    pub rolls: u64,
    /// What each account opened here, kept past their leaving; what each player in the room opened; and the find each
    /// is opening, E held (`find_holds.rs`).
    pub opened: BTreeMap<String, Vec<u32>>,
    pub by_player: BTreeMap<PlayerId, Vec<u32>>,
    pub opening: BTreeMap<PlayerId, crate::find_holds::Opening>,
    /// The last find each player was paid for, which their page tells them of.
    pub last_paid: BTreeMap<PlayerId, u32>,
}

impl Finds {
    /// A patrol's: its layout's chest places (x, y, facing), each stood on its ground by `floor`, and its holders.
    pub(crate) fn of_patrol(places: &[[f64; 3]], holders: Vec<Holder>, floor: &dyn Fn(f64, f64) -> f64) -> Self {
        let places: Vec<ChestPlace> = places.iter().map(|&[x, y, facing]| [x, y, floor(x, y), facing]).collect();
        let wanted = (places.len() / PLACES_A_CHEST).clamp(PATROL_CHESTS[0], PATROL_CHESTS[1]);
        let count = wanted.min(places.len());
        Finds { groups: (0..places.len()).collect(), places, holders, patrol: true, count, ..Finds::default() }
    }

    /// A dungeon's: a chest in a room of each block (as many as have room for one), against a wall of a room past the
    /// way in's but the end, never in a room of `kept` (a seal's); and its props that hold things, but in those rooms.
    pub(crate) fn of_dungeon(dungeon: &Dungeon, ground: &crate::dungeon_ground::DungeonGround, kept: &[usize]) -> Self {
        let mut places = Vec::new();
        let mut groups = Vec::new();
        for (number, room) in dungeon.rooms.iter().enumerate() {
            let shut = number == dungeon.way_in.room || number == dungeon.end() || kept.contains(&number);
            if shut {
                continue;
            }
            for &cell in &room.cells {
                for place in against_walls(dungeon, ground, cell) {
                    places.push(place);
                    groups.push(number);
                }
            }
        }
        // A seal's room's containers are none of them searchable either: its floor is the seal's.
        let in_kept = |at: [f64; 3]| dungeon.room_at(dungeon.cell_at(at)).is_some_and(|room| kept.contains(&room));
        let holders = dungeon
            .props
            .iter()
            .filter(|prop| dungeon::models::holder(prop.model).is_some() && !in_kept(prop.at))
            .filter_map(|prop| {
                let model = f64::from(prop.model);
                prop.solid.map(|[west, north, east, south, top]| {
                    let bottom = dungeon::storey_floor(dungeon.storey_under(top));
                    [west, north, east, south, bottom, top, model]
                })
            })
            .filter(|held| {
                let storey = dungeon.storey_under(held[5]);
                beside(held).iter().any(|&spot| ground.clear_between(spot, spot, movement::TUNING.radius, storey))
            })
            .collect();
        let count = dungeon_chests(dungeon).min(places.len());
        Finds { places, groups, holders, patrol: false, count, ..Finds::default() }
    }

    /// Stands a vault's chest in a dungeon's room, against one of its walls, drawn with the rest; a room it has no
    /// place against a wall in stands none.
    #[cfg_attr(not(test), expect(dead_code, reason = "the storey generator stands each vault it lays by this"))]
    pub(crate) fn stand_vault(&mut self, room: usize) {
        if !self.vaults.contains(&room) {
            self.vaults.push(room);
        }
    }

    /// What opening a chest by its number pays: a patrol's chest, a dungeon's, or a dungeon's vault's.
    pub(crate) fn chest_find(&self, number: u32) -> Find {
        let vault = self.chests.iter().any(|chest| chest.number == number && chest.vault);
        match (self.patrol, vault) {
            (true, _) => Find::Chest,
            (false, false) => Find::DungeonChest,
            (false, true) => Find::VaultChest,
        }
    }

    /// Whether a find stands now by its number, and what it is: a chest's place, or a container's holder.
    pub(crate) fn standing(&self, number: u32) -> Option<Standing> {
        let chest = self.chests.iter().find(|chest| chest.number == number);
        if let Some(chest) = chest {
            return self.places.get(chest.place).map(|&place| Standing::Chest(place));
        }
        let held = self.searchable.iter().find(|&&(_, each)| each == number);
        held.and_then(|&(holder, _)| self.holders.get(holder)).map(|&holder| Standing::Holder(holder))
    }

    fn standing_numbers(&self) -> Vec<u32> {
        let chests = self.chests.iter().map(|chest| chest.number);
        chests.chain(self.searchable.iter().map(|&(_, number)| number)).collect()
    }
}

/// How far out from a container's box a body stands to search it, metres: its radius and a hand, well within reach.
const BESIDE_M: f64 = 0.6;

/// Where a body may stand to search a container: BESIDE_M out from the middle of each side of its box and each corner.
/// One it can stand at none of (inside a tent, walled in by others) is never searchable.
fn beside(held: &Holder) -> [[f64; 2]; 8] {
    let [west, north, east, south, ..] = *held;
    let (middle_x, middle_y) = (f64::midpoint(west, east), f64::midpoint(north, south));
    let (out_west, out_north, out_east, out_south) =
        (west - BESIDE_M, north - BESIDE_M, east + BESIDE_M, south + BESIDE_M);
    [
        [middle_x, out_north],
        [out_east, middle_y],
        [middle_x, out_south],
        [out_west, middle_y],
        [out_west, out_north],
        [out_east, out_north],
        [out_east, out_south],
        [out_west, out_south],
    ]
}

/// A find standing: a chest at its place, or a container searchable in its holder's box.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Standing {
    Chest(ChestPlace),
    Holder(Holder),
}

/// The places against the rock walls of a room's cell: its back OFF_WALL_M off the wall, facing into the room, the
/// chest clear of rock and every solid; none on a doorway's cell, the way in's or the portal's, one holding a prop,
/// a fixture or a landmark, or under a torch.
fn against_walls(dungeon: &Dungeon, ground: &crate::dungeon_ground::DungeonGround, cell: usize) -> Vec<ChestPlace> {
    let doorway = dungeon.frames.iter().any(|frame| frame.cell == cell);
    if doorway || cell == dungeon.way_in.cell || cell == dungeon.portal.cell || dungeon.holds_solid(cell) {
        return Vec::new();
    }
    let [middle_x, middle_y] = dungeon.centre(cell);
    let rock = |side| dungeon.beside(cell, side).is_none_or(|next| dungeon.cells[next] == Cell::Rock);
    let torch_on = |side| dungeon.torches.iter().any(|torch| torch.wall == side && dungeon.cell_at(torch.at) == cell);
    let out = CELL_M / 2.0 - OFF_WALL_M - CHEST_HALF_DEEP_M;
    SIDES
        .into_iter()
        .filter(|&side| rock(side) && !torch_on(side))
        .filter_map(|side| {
            let [toward_x, toward_y] = side.unit();
            let (x, y) = (middle_x + toward_x * out, middle_y + toward_y * out);
            // Its width runs along the wall: the line along its middle, grown by half its depth.
            let along = CHEST_HALF_WIDE_M - CHEST_HALF_DEEP_M;
            let (from, to) =
                ([x - toward_y * along, y + toward_x * along], [x + toward_y * along, y - toward_x * along]);
            let facing = combat::sight::bearing([0.0, 0.0], [-toward_x, -toward_y]);
            let storey = dungeon.storey_of(cell);
            ground.clear_between(from, to, CHEST_HALF_DEEP_M, storey).then_some([x, y, dungeon.floor_of(cell), facing])
        })
        .collect()
}

impl Room {
    /// The room's dice for drawing its finds, on a stream and a count of their own, so no other roll moves with them.
    fn finds_dice(&mut self) -> Dice {
        self.finds.rolls += 1;
        Dice { seed: self.seed ^ FINDS_STREAM, tick: self.clock ^ (self.finds.rolls << 32), player: u32::MAX }
    }

    fn take_number(&mut self) -> u32 {
        self.finds.next = self.finds.next.wrapping_add(1);
        self.finds.next
    }

    /// Each tick: the finds drawn at the first; in a patrol, each chest whose turn is up moved on, and the containers
    /// drawn again once theirs is.
    pub(crate) fn keep_finds(&mut self) {
        if self.finds.places.is_empty() && self.finds.holders.is_empty() {
            return;
        }
        let mut changed = false;
        if !self.finds.drawn {
            self.draw_finds();
            changed = true;
        }
        if self.finds.patrol {
            for slot in 0..self.finds.chests.len() {
                if self.finds.chests[slot].until <= self.clock {
                    self.move_chest(slot);
                    changed = true;
                }
            }
            if self.finds.searchable_until <= self.clock {
                self.draw_searchable();
                changed = true;
            }
        }
        if changed {
            self.forget_gone_finds();
        }
        // A player who left keeps nothing here but what their account keeps.
        let players = &self.players;
        self.finds.by_player.retain(|player, _| players.contains_key(player));
        self.finds.opening.retain(|player, _| players.contains_key(player));
        self.finds.last_paid.retain(|player, _| players.contains_key(player));
    }

    /// The finds an account opened here are opened again for the player it is now.
    pub(crate) fn give_finds_back(&mut self, player: PlayerId, owner: &str) {
        let kept = self.finds.opened.get(owner).cloned().unwrap_or_default();
        let opened = self.finds.by_player.entry(player).or_default();
        opened.extend(kept.into_iter().filter(|number| !opened.contains(number)).collect::<Vec<_>>());
    }

    /// The number of the last find a player was paid for here, 0 for none.
    #[must_use]
    pub fn last_opened(&self, player: PlayerId) -> u32 {
        self.finds.last_paid.get(&player).copied().unwrap_or(0)
    }

    /// The finds a player has opened while they stand here.
    pub(crate) fn opened_by(&self, player: PlayerId) -> &[u32] {
        self.finds.by_player.get(&player).map_or(&[], Vec::as_slice)
    }

    /// Draws every find anew: in a patrol each chest at a place of its own, staggered so one moves on every
    /// CHEST_TURN_TICKS over their count; in a dungeon by `draw_dungeon_chests`; and the searchable containers.
    pub(crate) fn draw_finds(&mut self) {
        self.finds.drawn = true;
        self.finds.chests.clear();
        let count = self.finds.count;
        if self.finds.patrol {
            for slot in 0..count {
                let until = self.clock + CHEST_TURN_TICKS * (slot as u64 + 1) / count as u64;
                let place = self.free_place(None);
                if let Some(place) = place {
                    let number = self.take_number();
                    self.finds.chests.push(Chest { place, number, until, vault: false });
                }
            }
        } else {
            self.draw_dungeon_chests();
        }
        // Drawn afresh, every container is new to everyone, as its chests are.
        self.finds.searchable.clear();
        self.draw_searchable();
    }

    /// Draws a dungeon's chests: each vault's in its room, then each plain one in a room of its own but the vaults'
    /// while rooms last, then a second in a room, SECOND_APART_M from every other.
    fn draw_dungeon_chests(&mut self) {
        let dice = self.finds_dice();
        let in_room = |finds: &Finds, room: usize| -> Vec<usize> {
            (0..finds.places.len()).filter(|&at| finds.groups[at] == room).collect()
        };
        let vaults = self.finds.vaults.clone();
        for (nth, &room) in (0_u32..).zip(&vaults) {
            let places = in_room(&self.finds, room);
            let Some(&place) = places.get(dice.pick(Purpose::Find, 90 + nth, places.len())) else { continue };
            let number = self.take_number();
            self.finds.chests.push(Chest { place, number, until: u64::MAX, vault: true });
        }
        let mut rooms: Vec<usize> = Vec::new();
        for &room in &self.finds.groups {
            if !rooms.contains(&room) && !vaults.contains(&room) {
                rooms.push(room);
            }
        }
        for nth in 0..self.finds.count as u32 {
            let place = if rooms.is_empty() {
                let taken: Vec<[f64; 4]> =
                    self.finds.chests.iter().map(|chest| self.finds.places[chest.place]).collect();
                let apart = |at: &usize| {
                    let [x, y, ..] = self.finds.places[*at];
                    let far = taken.iter().all(|other| libm::hypot(other[0] - x, other[1] - y) >= SECOND_APART_M);
                    far && !vaults.contains(&self.finds.groups[*at])
                };
                let free: Vec<usize> = (0..self.finds.places.len()).filter(apart).collect();
                let Some(&place) = free.get(dice.pick(Purpose::Find, 20 + nth, free.len())) else { break };
                place
            } else {
                let room = rooms.swap_remove(dice.pick(Purpose::Find, 10 + nth, rooms.len()));
                let places = in_room(&self.finds, room);
                places[dice.pick(Purpose::Find, 20 + nth, places.len())]
            };
            let number = self.take_number();
            self.finds.chests.push(Chest { place, number, until: u64::MAX, vault: false });
        }
    }

    /// A place no chest stands at, but `leaving`, drawn; `leaving` itself where no other is free.
    fn free_place(&mut self, leaving: Option<usize>) -> Option<usize> {
        let held: Vec<usize> = self.finds.chests.iter().map(|chest| chest.place).collect();
        let free: Vec<usize> =
            (0..self.finds.places.len()).filter(|at| !held.contains(at) && Some(*at) != leaving).collect();
        if free.is_empty() {
            return leaving;
        }
        let dice = self.finds_dice();
        Some(free[dice.pick(Purpose::Find, 30, free.len())])
    }

    /// Moves a patrol's chest on to another place, as a new chest every player may open.
    fn move_chest(&mut self, slot: usize) {
        let leaving = self.finds.chests[slot].place;
        let place = self.free_place(Some(leaving)).unwrap_or(leaving);
        let number = self.take_number();
        self.finds.chests[slot] = Chest { place, number, until: self.clock + CHEST_TURN_TICKS, vault: false };
    }

    /// Draws which containers are searchable: one in its share of them, at least one where any stands, at most
    /// SEARCHABLE_MOST, each a new number but one searchable already.
    fn draw_searchable(&mut self) {
        let share = if self.finds.patrol { PATROL_SHARE } else { DUNGEON_SHARE };
        let holders = self.finds.holders.len();
        let count = holders.div_ceil(share).min(SEARCHABLE_MOST);
        let dice = self.finds_dice();
        let mut left: Vec<usize> = (0..holders).collect();
        let mut drawn = Vec::new();
        // A container drawn again keeps its number, so whoever searched it this turn cannot search it again at once.
        let before = std::mem::take(&mut self.finds.searchable);
        for nth in 0..count {
            let holder = left.swap_remove(dice.pick(Purpose::Find, 40 + nth as u32, left.len()));
            let kept = before.iter().find(|(was, _)| *was == holder).map(|&(_, number)| number);
            drawn.push((holder, kept.unwrap_or_else(|| self.take_number())));
        }
        self.finds.searchable = drawn;
        self.finds.searchable_until = self.clock + SEARCH_TURN_TICKS;
    }

    /// Lets each player and account forget the finds no longer standing, and sends every player what stands now.
    fn forget_gone_finds(&mut self) {
        let standing = self.finds.standing_numbers();
        for opened in self.finds.opened.values_mut().chain(self.finds.by_player.values_mut()) {
            opened.retain(|number| standing.contains(number));
        }
        for found in self.players.values_mut() {
            found.gear_changed = true;
        }
    }

    /// The chests standing that a player has not opened: each its number and its place.
    #[must_use]
    pub fn chests_for(&self, player: PlayerId) -> Vec<(u32, ChestPlace)> {
        let opened = self.opened_by(player);
        let unopened = self.finds.chests.iter().filter(|chest| !opened.contains(&chest.number));
        unopened.filter_map(|chest| self.finds.places.get(chest.place).map(|&place| (chest.number, place))).collect()
    }

    /// Whether the chest of this number is a vault's, the finer chest in gold.
    #[must_use]
    pub fn vault_chest(&self, number: u32) -> bool {
        self.finds.chest_find(number) == Find::VaultChest
    }

    /// A dungeon's chests a player has opened and how many it stands, vaults' among them; none of none in a patrol,
    /// whose chests move on.
    #[must_use]
    pub fn chests_counted(&self, player: PlayerId) -> (usize, usize) {
        if self.finds.patrol {
            return (0, 0);
        }
        let opened = self.opened_by(player);
        let open = self.finds.chests.iter().filter(|chest| opened.contains(&chest.number)).count();
        (open, self.finds.chests.len())
    }

    /// The containers searchable that a player has not searched: each its number and its holder.
    #[must_use]
    pub fn searchables_for(&self, player: PlayerId) -> Vec<(u32, Holder)> {
        let opened = self.opened_by(player);
        let unopened = self.finds.searchable.iter().filter(|(_, number)| !opened.contains(number));
        unopened
            .filter_map(|&(holder, number)| self.finds.holders.get(holder).map(|&box_of| (number, box_of)))
            .collect()
    }

    /// Makes this patrol's room stand chests at its layout's chest places and make its holders searchable, those
    /// whose middle its section holds.
    pub fn lay_finds(&mut self, places: &[[f64; 3]], mut holders: Vec<Holder>) {
        if let Some(section) = &self.section {
            holders.retain(|held| {
                reach::inside(&section.ring, f64::midpoint(held[0], held[2]), f64::midpoint(held[1], held[3]))
            });
        }
        let height = movement::TUNING.height;
        holders.retain(|held| {
            beside(held).iter().any(|&[x, y]| movement::blocks::room_at(&self.blocks, x, y, held[4], height))
        });
        let floor = |x: f64, y: f64| self.floor.height_at(x, y);
        self.finds = Finds::of_patrol(places, holders, &floor);
    }
}

#[cfg(test)]
#[path = "finds_tests.rs"]
mod finds_tests;
