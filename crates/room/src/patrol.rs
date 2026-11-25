//! A patrol's land: its island's resource at its layout's resource places (each a pile of that resource), every one
//! holding a node for everyone at once. A player gathers a node holding E; it is spent for them alone, standing still
//! for everyone else, until it returns for them. It stands no camps of its own: its fights are its
//! garrison's (`garrison.rs`), its public events' and the houses' roads' groups', and its dungeons lie behind its
//! entrances (`entrances.rs`).

use crate::asks::{GATHER_GRACE_TICKS, GATHER_STIR_M, GATHER_TICKS};
use crate::{PlayerId, ResourceNode, Room};
use gear::Difficulty;

/// How many minutes of the world's clock (`Room::minute`) a node a player gathered stays spent for them. The world's
/// clock, not the room's ticks, as an empty room does not tick.
pub const RETURN_MINUTES: u64 = 9;

impl Room {
    /// Makes this node's room a patrol: `resource`'s nodes where its layout stands them (`places`, each on its
    /// section's floor), numbered in the layout's order as the page numbers them; and its dungeons' entrances, laid
    /// out from the node's id apart from them.
    pub fn start_patrol(&mut self, node: &str, resource: u8, places: &[[f64; 2]]) {
        self.resource_nodes = places.iter().map(|&[x, y]| ResourceNode { x, y, resource }).collect();
        self.patrol = true;
        let Some(section) = &self.section else { return };
        let dry = |x: f64, y: f64| crate::entrances::dry(&self.floor, x, y);
        let dungeons: Vec<(u32, dungeon::Style)> =
            (0..dungeon::PER_PATROL).map(|number| dungeon::of_patrol(node, number)).collect();
        let (ring, spawns) = (&section.ring, &section.spawns);
        self.entrances = crate::entrances::laid(node, &dungeons, &self.floor, &dry, &self.blocks, ring, spawns, places);
    }

    /// Sets the difficulty the room's voyage set out at, and raises the garrison standing to it. Only Normal seas stand
    /// a Breach's gate, as a run asks its zone's Normal room alone whether its gate opened.
    pub fn set_difficulty(&mut self, difficulty: Difficulty) {
        self.difficulty = difficulty;
        if difficulty != Difficulty::Normal {
            self.breach_gate = None;
        }
        self.raise_garrison();
    }

    /// The resource nodes a player may still gather, each with its number.
    pub fn nodes_for(&self, player: crate::PlayerId) -> impl Iterator<Item = (u8, &ResourceNode)> + '_ {
        let spent = self.players.get(&player).map(|found| found.spent.as_slice()).unwrap_or_default();
        self.resource_nodes.iter().enumerate().filter_map(move |(index, node)| {
            let number = u8::try_from(index).ok()?;
            (!spent.iter().any(|&(gathered, _)| gathered == number)).then_some((number, node))
        })
    }

    /// Keeps a patrol going for a tick: each node a player gathered `RETURN_MINUTES` ago returns for them, and they
    /// are sent the nodes they may gather now.
    pub(crate) fn keep_patrol(&mut self) {
        if !self.patrol {
            return;
        }
        let minute = self.minute;
        let returned = |&(_, at): &(u8, u64)| minute.saturating_sub(at) >= RETURN_MINUTES;
        for found in self.players.values_mut() {
            if found.spent.iter().any(returned) {
                found.spent.retain(|spent| !returned(spent));
                found.gear_changed = true;
            }
        }
        self.gathered.retain(|_, nodes| {
            nodes.retain(|spent| !returned(spent));
            !nodes.is_empty()
        });
    }

    /// Keeps each gather under way for a tick: one whose player may no longer gather it (`gather_refused`) or was hurt
    /// stops; one stepped off or let go of stops, unless within `GATHER_GRACE_TICKS` of its end, when it is gathered;
    /// one held `GATHER_TICKS` gathers its node, spent for the player until it returns.
    pub(crate) fn keep_gathering(&mut self) {
        let under_way: Vec<PlayerId> =
            self.players.iter().filter(|(_, found)| found.gathering.is_some()).map(|(&id, _)| id).collect();
        let (isle, day) = (self.isle.as_ref().map(|isle| isle.seed), self.day());
        let rich_seam = self.current(passage::Current::RichSeam).is_some();
        for player in under_way {
            let Some(gathering) = self.players.get(&player).and_then(|found| found.gathering) else { continue };
            let Some(fighter) = self.fighter(player).copied() else { continue };
            let stirred = libm::hypot(fighter.body.x - gathering.at[0], fighter.body.y - gathering.at[1]);
            let broken = self.gather_refused(player, gathering.node).is_some() || fighter.health < gathering.health;
            let left = (gathering.since + GATHER_TICKS).saturating_sub(self.clock);
            let ended = gathering.let_go || stirred > GATHER_STIR_M;
            let done = !broken && (left == 0 || (ended && left <= GATHER_GRACE_TICKS));
            let Some(found) = self.players.get_mut(&player) else { continue };
            if !(broken || ended || done) {
                // A blow is measured from the health it found last, so a heal meanwhile hides none.
                found.gathering = Some(crate::asks::Gathering { health: fighter.health, ..gathering });
                continue;
            }
            found.gathering = None;
            found.gear_changed = true;
            let Some(node) = self.resource_nodes.get(usize::from(gathering.node)).filter(|_| done) else { continue };
            found.spent.push((gathering.node, self.minute));
            // On a sea island the node stays spent for the character until the day turns, in any room of it.
            if let Some(seed) = isle {
                found.character.activity.gather_on(day, seed, gathering.node);
            }
            if let Some(owner) = &found.owner {
                self.gathered.entry(owner.clone()).or_default().push((gathering.node, self.minute));
            }
            let resource = node.resource;
            found.character.gather(usize::from(resource));
            if rich_seam {
                found.character.find_material(gear::character::Stuff::Resource(usize::from(resource)), 1);
            }
            found.character.tell(&gear::quests::Event::Gather);
            self.saw(player, &gear::objectives::Feat::Gathered { resource });
            self.vein_gathered(player, gathering.node);
        }
    }
}
