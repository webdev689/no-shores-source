//! Which navmesh the room's foes find their way on, its routes and its firing spots (`foes.rs`). A node's room has its
//! own mesh by its first spawn and one more round each place a quest's step stands foes at that its own square does
//! not hold: a road's group, a defence's waves, a puzzle's or an ambush's (`quests.rs`); each
//! foe thinks on the mesh that holds its post, or else the one whose square holds where it stands, and on the node's
//! own otherwise.

use crate::Room;
use crate::foes::{MeshRoutes, MeshSpots};
use ::foes::{Brain, World, think};
use combat::Fighter;
use combat::fighter::FighterId;
use navmesh::{NavMesh, Way};
use std::collections::BTreeMap;

impl Room {
    /// Which of the room's meshes holds a point: 0 the node's own, whose square comes first; else 1 and on, the
    /// squares of the roads' places in turn; the node's own where none does.
    pub(crate) fn mesh_index(&self, [x, y]: [f64; 2]) -> usize {
        let holds = |bounds: &navmesh::Bounds| {
            (bounds.min_x..=bounds.max_x).contains(&x) && (bounds.min_y..=bounds.max_y).contains(&y)
        };
        if self.quests.square.as_ref().is_none_or(holds) {
            return 0;
        }
        self.quests.grounds.iter().position(|(_, bounds, _)| holds(bounds)).map_or(0, |at| at + 1)
    }

    /// The mesh that holds a point.
    pub(crate) fn mesh_at(&self, point: [f64; 3]) -> &NavMesh {
        self.mesh_by(self.mesh_index([point[0], point[1]]))
    }

    /// The mesh a foe thinks on: the one that holds its post, or with none, where it stands.
    fn mesh_of(&self, foe: FighterId) -> usize {
        let Some(found) = self.foes.get(&foe) else { return 0 };
        let at =
            found.brain.home().map_or([found.fighter.body.x, found.fighter.body.y], |home| [home.at[0], home.at[1]]);
        self.mesh_index(at)
    }

    /// Every foe thinks, in the order of their numbers, among `noticed`, over the mesh that holds it. A foe's way is
    /// kept from one tick to the next on its mesh; one that moved onto another finds its way afresh.
    pub(crate) fn think_foes(&mut self, noticed: &[(FighterId, Fighter)]) -> Vec<(FighterId, (Brain, combat::Intent))> {
        let thinking = self.foes.keys().filter(|id| !self.inert.contains(id) && !self.arriving(**id));
        let on: Vec<(FighterId, usize)> = thinking.map(|id| (*id, self.mesh_of(*id))).collect();
        let meshes: Vec<&NavMesh> =
            core::iter::once(&self.nav).chain(self.quests.grounds.iter().map(|(_, _, mesh)| mesh)).collect();
        let mut ways = std::mem::take(&mut self.ways);
        let mut split = vec![BTreeMap::new(); meshes.len()];
        for &(id, mesh) in &on {
            let kept = ways.remove(&id).filter(|_| self.quests.way_on.get(&id).copied().unwrap_or(0) == mesh);
            if let Some(way) = kept {
                split[mesh].insert(id, way);
            }
        }
        let routes: Vec<MeshRoutes<'_>> = meshes
            .iter()
            .zip(split)
            .map(|(mesh, ways)| MeshRoutes::new(mesh, &self.floor, &self.blocks, ways))
            .collect();
        let spots: Vec<MeshSpots<'_>> = meshes.iter().map(|mesh| MeshSpots { mesh }).collect();
        let mut intents = Vec::with_capacity(on.len());
        // Each foe sees those landed in a patrol zone's landing as `seen_by` says; with none landed, all see alike.
        let landed = self.in_landings();
        for &(id, mesh) in &on {
            let Some(foe) = self.foes.get(&id) else { continue };
            // A ward thinks nothing: it stands where it was stood.
            if self.quests.wards.contains(&id) {
                // Nor keeps what it was told to think about.
                let mut brain = foe.brain.clone();
                brain.forget_heard();
                intents.push((id, (brain, combat::Intent::default())));
                continue;
            }
            let own;
            let fighters = if landed.is_empty() {
                noticed
            } else {
                own = self.seen_by(id, noticed, &landed);
                &own[..]
            };
            let world = World {
                tick: self.clock,
                seed: self.world_seed,
                fighters,
                blocks: &self.blocks,
                terrain: &self.floor,
                routes: &routes[mesh],
                spots: &spots[mesh],
                director: self.director,
            };
            routes[mesh].asking.set(id);
            let (brain, mut intent) = think(id, &foe.brain, &mut self.board, &world);
            // A warded Boss stands at its post (`court.rs`).
            self.hold_ward(id, &mut intent, &routes[mesh]);
            intents.push((id, (brain, intent)));
        }
        let kept: Vec<BTreeMap<FighterId, Way>> = routes.into_iter().map(|routes| routes.ways.into_inner()).collect();
        self.quests.way_on.clear();
        for (mesh, ways) in kept.into_iter().enumerate() {
            self.quests.way_on.extend(ways.keys().filter(|_| mesh > 0).map(|id| (*id, mesh)));
            self.ways.extend(ways);
        }
        intents
    }
}
