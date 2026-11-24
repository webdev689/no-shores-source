//! A Breach's run, as its room keeps it ([[The First Breach Follows the Vault of Glass, at Normal and Hard]]): the
//! spaces its plan stands (`plan.rs`), walked from the Descent's arrival to the Steward's court; its encounters fought
//! in turn, each waiting until a living player stands in its space, running, then won, its seal on opening; the stages
//! a fallen player stands again at; how the fallen stand at each tier (`fallen.rs`); the Lodestone and the marks it
//! cleanses (`lodestone.rs`); and each encounter's rules in a file of its own. Its opening, the Waking, is fought in
//! the patrol zone (`gate.rs`). The numbers are Claude's ([[The Drowned Vale as Claude Builds It]]).

pub mod plan;

mod choir;
mod fallen;
pub mod gate;
mod lodestone;
mod mending;
pub mod seen;
mod shores;
mod steward;
mod waves;
mod ways;

use crate::floor::Floor;
use crate::{EventKind, PlayerId, Room};
use combat::fighter::FighterId;
use gear::breach::{DROWNED_VALE, Tier};
pub use lodestone::Lodestone;
use movement::Block;
use plan::{Plan, drowned_vale, slab_stands};
use reach::Section;
use std::collections::{BTreeMap, BTreeSet};

/// How far past its spaces the run's ring lies, metres: a body leaves it only by falling, which kills first.
const RING_MARGIN_M: f64 = 30.0;
/// How far past its stage a living player walks into an encounter's space before it begins, metres.
pub const BEGIN_PAST_M: f64 = 8.0;
/// How far round a space its navmesh reaches, metres.
const NAV_MARGIN_M: f64 = 2.0;
/// How long every living player must be down for an attempt to be lost, ticks: three seconds, as Destiny's raids
/// gave a last revive.
pub const WIPE_TICKS: u64 = 3 * 60;
/// The encounters fought in the run, by their place in the Breach's list: the Waking, the first, is the gate's.
pub const MENDING: usize = 1;
pub const CHOIR: usize = 2;
pub const WAYS: usize = 3;
pub const SHORES: usize = 4;
pub const STEWARD: usize = 5;

/// The stages a fallen player stands again at, in the order the run is walked: each a space and its socket, and the
/// encounter whose win reaches it (none for one reached by walking).
const STAGES: [(&str, &str, Option<usize>); 7] = [
    ("descent", "start", None),
    ("mending", "checkpoint", None),
    ("choir", "checkpoint", Some(MENDING)),
    ("ways", "checkpoint", Some(CHOIR)),
    ("stair", "start", Some(WAYS)),
    ("hall", "checkpoint", None),
    ("court", "checkpoint", Some(SHORES)),
];

/// How an encounter of the run stands.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Phase {
    /// No living player has stood in its space since it last began.
    #[default]
    Waiting,
    /// Under way since this tick.
    Running(u64),
    Won,
}

/// What each encounter keeps as it is fought.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Fights {
    pub mending: mending::Mending,
    pub choir: choir::Choir,
    pub ways: ways::Ways,
    pub shores: shores::Shores,
    pub steward: steward::Steward,
}

/// A Breach's run: its tier and plan, each encounter's phase and what each keeps, the stages reached, the seals open,
/// the revives left in this attempt (Hard's), the Lodestone, the marks on the Rewritten, who is raising whom, the
/// encounters' foes, the hidden chests opened, and the spaces whose navmesh is baked.
#[derive(Clone, Debug)]
pub struct Breach {
    pub tier: Tier,
    pub plan: &'static Plan,
    pub phases: [Phase; 6],
    pub(crate) fights: Fights,
    pub reached: usize,
    pub open_seals: BTreeSet<usize>,
    pub revives: Option<u8>,
    pub lodestone: Lodestone,
    /// Each Rewritten player, by the tick they were marked.
    pub marked: BTreeMap<PlayerId, u64>,
    /// Each player raising a fallen one: whom, and the tick they began.
    pub raising: BTreeMap<PlayerId, (PlayerId, u64)>,
    /// The tick since which every living player has been down, while an encounter runs.
    pub down_since: Option<u64>,
    pub foes: Vec<FighterId>,
    pub chests: BTreeSet<usize>,
    pub baked: BTreeSet<String>,
    /// The blocks that stood last tick, seals and slabs among them, to know when the room's must be made again.
    pub(crate) standing: Vec<Block>,
}

impl Room {
    /// The room of a Breach's run at `tier`, opened at Unix `minute`: the Drowned Vale's spaces stood over the dark,
    /// its seals shut, its first space's navmesh baked, its players arriving at the Descent's top.
    #[must_use]
    pub fn breach_run(tier: Tier, minute: u64) -> Option<Self> {
        let plan = drowned_vale();
        let (arrival, facing) = plan.socket("descent", "arrival")?;
        let [west, north, east, south] = plan.bounds(RING_MARGIN_M);
        let ring = vec![[west, north], [east, north], [east, south], [west, south]];
        let section = Section { ring, spawns: vec![[arrival[0], arrival[1]]], falls_kill: true };
        let standing = plan.standing();
        let nav =
            navmesh::NavMesh::bake_over_sea(&standing, plan.space_bounds("descent", NAV_MARGIN_M)?, &navmesh::AGENT);
        let mut room = Room::on(Floor::Flat, standing.clone(), vec![(arrival[0], arrival[1])], Some(section), nav);
        room.facing = combat::sight::bearing([0.0, 0.0], facing);
        room.place = Some(gear::gate::Place::Breach(tier));
        room.world_seed = crate::garrison::node_seed(&format!("breach-{}", DROWNED_VALE.id));
        room.foes_most = crate::NODE_FOES_MOST;
        room.source = gear::Source::Breach;
        room.set_minute(minute);
        let mut breach = Breach {
            tier,
            plan,
            phases: [Phase::Won, Phase::Waiting, Phase::Waiting, Phase::Waiting, Phase::Waiting, Phase::Waiting],
            fights: Fights::default(),
            reached: 0,
            open_seals: BTreeSet::new(),
            revives: tier.revives(),
            lodestone: Lodestone::default(),
            marked: BTreeMap::new(),
            raising: BTreeMap::new(),
            down_since: None,
            foes: Vec::new(),
            chests: BTreeSet::new(),
            baked: BTreeSet::from(["descent".to_owned()]),
            standing,
        };
        breach.standing = breach.blocks_at(0);
        room.blocks = breach.standing.clone().into();
        room.breach = Some(Box::new(breach));
        Some(room)
    }

    /// Each tick in a Breach's run: its seals and slabs stood as they stand now, the stages reached, each encounter's
    /// rules, the fallen raised by their company, the Lodestone and its marks, and an attempt lost to a wipe.
    pub(crate) fn keep_breach(&mut self) {
        let Some(mut breach) = self.breach.take() else { return };
        self.reach_stages(&mut breach);
        for encounter in MENDING..=STEWARD {
            self.keep_encounter(&mut breach, encounter);
        }
        self.keep_raising(&mut breach);
        self.keep_lodestone(&mut breach);
        self.keep_chests(&mut breach);
        self.keep_wipe(&mut breach);
        self.breach = Some(breach);
    }

    /// The blocks that stand this tick, made the room's anew when they change: a seal opened, a slab come or gone.
    pub(crate) fn breach_blocks(&mut self) {
        let Some(breach) = self.breach.as_mut() else { return };
        let now = breach.blocks_at(self.clock);
        if now != breach.standing {
            breach.standing = now;
            self.blocks = breach.standing.clone().into();
        }
    }

    fn keep_encounter(&mut self, breach: &mut Breach, encounter: usize) {
        match breach.phases[encounter] {
            Phase::Won => return,
            Phase::Waiting => {
                let space = space_of(breach.plan, encounter);
                let earlier = (MENDING..encounter).all(|before| breach.phases[before] == Phase::Won);
                if !earlier || !self.walked_in(breach, &space) {
                    return;
                }
                self.begin(breach, encounter);
            }
            Phase::Running(_) => {}
        }
        match encounter {
            MENDING => self.keep_mending(breach),
            CHOIR => self.keep_choir(breach),
            WAYS => self.keep_ways(breach),
            SHORES => self.keep_shores(breach),
            _ => self.keep_steward(breach),
        }
    }

    /// An encounter begins: its revives whole, told to every player.
    fn begin(&mut self, breach: &mut Breach, encounter: usize) {
        breach.phases[encounter] = Phase::Running(self.clock);
        breach.revives = breach.tier.revives();
        self.bake_space(breach, &space_of(breach.plan, encounter));
        self.tell_all(EventKind::BreachBegun, encounter as f64);
    }

    /// An encounter is won: its seal opens, its foes go, the fallen stand again at the next stage, and each player
    /// is paid its first clear of the week at this tier and its lore.
    pub(crate) fn win_encounter(&mut self, breach: &mut Breach, encounter: usize) {
        breach.phases[encounter] = Phase::Won;
        let key = DROWNED_VALE.encounters[encounter].key;
        for (number, seal) in breach.plan.seals.iter().enumerate() {
            if seal.opens == key {
                breach.open_seals.insert(number);
            }
        }
        for id in std::mem::take(&mut breach.foes) {
            if self.foes.get(&id).is_some_and(|foe| !foe.fighter.dead()) {
                self.gone(id);
            }
        }
        breach.marked.clear();
        breach.lodestone = Lodestone::default();
        self.reach_stages(breach);
        self.stand_the_fallen(breach);
        self.tell_all(EventKind::BreachWon, encounter as f64);
        self.pay_breach(breach, encounter);
    }

    /// Each player the room keeps is paid an encounter's (or, past them, a hidden chest's) find.
    pub(crate) fn pay_breach(&mut self, breach: &Breach, find: usize) {
        let week = gear::clock::week_of(self.minute);
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in players {
            let dice = self.dice(id);
            let Some(found) = self.players.get_mut(&id).filter(|found| found.owner.is_some()) else { continue };
            let paid = found.character.breach_cleared(&DROWNED_VALE, breach.tier, week, find, &dice);
            for vestige in paid.vestiges {
                found.character.keep_paid(vestige);
            }
            found.gear_changed = true;
        }
    }

    /// The furthest stage reached: by a win, or by a living player standing in its space.
    fn reach_stages(&mut self, breach: &mut Breach) {
        for (stage, (space, _, won_by)) in STAGES.iter().enumerate().skip(breach.reached + 1) {
            let reached = match won_by {
                Some(encounter) => breach.phases[*encounter] == Phase::Won,
                None => self.someone_in(breach, space),
            };
            if !reached {
                break;
            }
            breach.reached = stage;
            self.bake_space(breach, space);
        }
    }

    /// Where the fallen stand again: the furthest stage reached.
    pub(crate) fn checkpoint(&self, breach: &Breach) -> ([f64; 3], [f64; 2]) {
        let (space, socket, _) = STAGES[breach.reached];
        breach.plan.socket(space, socket).unwrap_or(([0.0, 0.0, 0.0], [0.0, -1.0]))
    }

    /// Whether a living player stands in a space, inside its module's ground.
    pub(crate) fn someone_in(&self, breach: &Breach, space: &str) -> bool {
        let Some(bounds) = breach.plan.space_bounds(space, 0.0) else { return false };
        self.players.values().any(|found| {
            let body = found.fighter.body;
            found.living()
                && body.x >= bounds.min_x
                && body.x <= bounds.max_x
                && body.y >= bounds.min_y
                && body.y <= bounds.max_y
        })
    }

    /// Whether a living player has walked into a space past its stage, BEGIN_PAST_M from where the fallen stand
    /// again, so an attempt lost waits until the company comes on again.
    fn walked_in(&self, breach: &Breach, space: &str) -> bool {
        let stage = breach.plan.socket(space, "checkpoint").map(|(at, _)| at);
        self.in_space(breach, space).into_iter().any(|id| {
            let body = self.players[&id].fighter.body;
            stage.is_none_or(|at| combat::sight::apart([body.x, body.y], [at[0], at[1]]) > BEGIN_PAST_M)
        })
    }

    /// The living players standing in a space.
    pub(crate) fn in_space(&self, breach: &Breach, space: &str) -> Vec<PlayerId> {
        let Some(bounds) = breach.plan.space_bounds(space, 0.0) else { return Vec::new() };
        self.players
            .iter()
            .filter(|(_, found)| {
                let body = found.fighter.body;
                found.living()
                    && body.x >= bounds.min_x
                    && body.x <= bounds.max_x
                    && body.y >= bounds.min_y
                    && body.y <= bounds.max_y
            })
            .map(|(id, _)| *id)
            .collect()
    }

    /// A space's navmesh baked and joined to the room's, once.
    fn bake_space(&mut self, breach: &mut Breach, space: &str) {
        if !breach.baked.insert(space.to_owned()) {
            return;
        }
        let Some(bounds) = breach.plan.space_bounds(space, NAV_MARGIN_M) else { return };
        let inside: Vec<Block> = breach
            .standing
            .iter()
            .copied()
            .filter(|block| {
                block.min_x < bounds.max_x
                    && block.max_x > bounds.min_x
                    && block.min_y < bounds.max_y
                    && block.max_y > bounds.min_y
            })
            .collect();
        self.nav.join(vec![navmesh::NavMesh::bake_over_sea(&inside, bounds, &navmesh::AGENT)]);
    }

    /// An attempt is lost once every living player has been down for WIPE_TICKS while an encounter runs: its foes go,
    /// it waits again with its rules as they began, the Lodestone and the marks are taken up, and every player stands
    /// whole at its stage. Told to every player.
    fn keep_wipe(&mut self, breach: &mut Breach) {
        let running = (MENDING..=STEWARD).find(|&at| matches!(breach.phases[at], Phase::Running(_)));
        let keeps = self.players.values().any(|found| found.owner.is_some());
        let counted = |found: &&crate::players::Player| !keeps || found.owner.is_some();
        let all_down = !self.players.is_empty() && self.players.values().filter(counted).all(|found| !found.living());
        let Some(encounter) = running.filter(|_| all_down) else {
            breach.down_since = None;
            return;
        };
        let since = *breach.down_since.get_or_insert(self.clock);
        if self.clock < since + WIPE_TICKS {
            return;
        }
        self.wipe(breach, encounter);
    }

    /// Starts an encounter's attempt over.
    pub(crate) fn wipe(&mut self, breach: &mut Breach, encounter: usize) {
        for id in std::mem::take(&mut breach.foes) {
            if self.foes.contains_key(&id) {
                self.gone(id);
            }
        }
        breach.phases[encounter] = Phase::Waiting;
        match encounter {
            MENDING => breach.fights.mending = mending::Mending::default(),
            CHOIR => breach.fights.choir = choir::Choir::default(),
            WAYS => breach.fights.ways = ways::Ways::default(),
            SHORES => breach.fights.shores = shores::Shores::default(),
            _ => breach.fights.steward = steward::Steward::default(),
        }
        breach.marked.clear();
        breach.raising.clear();
        breach.lodestone = Lodestone::default();
        breach.down_since = None;
        breach.revives = breach.tier.revives();
        self.tell_all(EventKind::BreachWiped, encounter as f64);
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        let (at, _) = self.checkpoint(breach);
        for id in players {
            self.stand_whole(id, at);
        }
    }
}

impl Room {
    /// The Lodestone grounded at a point: the Scrivener's ward broken, or the Steward laid bare, where in reach.
    pub(crate) fn grounded(&mut self, breach: &mut Breach, at: [f64; 3], _near: &[FighterId]) -> bool {
        let scrivener = matches!(breach.phases[CHOIR], Phase::Running(_)) && self.ground_scrivener(breach, at);
        let steward = matches!(breach.phases[STEWARD], Phase::Running(_)) && self.ground_steward(breach, at);
        scrivener || steward
    }

    /// The hidden chests: each player standing at one open to them is paid its find, once a week at each tier.
    pub(crate) fn keep_chests(&mut self, breach: &mut Breach) {
        let sockets =
            [("descent", "chest-descent"), ("choir", "chest-page"), ("ways", "heart"), ("stair", "chest-stair")];
        for (nth, (space, socket)) in sockets.into_iter().enumerate() {
            let open = match nth {
                1 => breach.phases[CHOIR] == Phase::Won && breach.chests.contains(&1),
                2 => breach.chests.contains(&2),
                _ => true,
            };
            let Some((at, _)) = breach.plan.socket(space, socket).filter(|_| open) else { continue };
            let find = DROWNED_VALE.encounters.len() + nth;
            let near: Vec<PlayerId> = self
                .players
                .iter()
                .filter(|(_, found)| {
                    let body = found.fighter.body;
                    found.living()
                        && found.owner.is_some()
                        && combat::sight::apart([body.x, body.y], [at[0], at[1]]) <= CHEST_REACH_M
                        && (body.z - at[2]).abs() < 1.5
                })
                .map(|(id, _)| *id)
                .collect();
            let week = gear::clock::week_of(self.minute);
            for id in near {
                let paid = self.players.get(&id).is_some_and(|found| {
                    found.character.breach_paid(&DROWNED_VALE, breach.tier, week, find)
                        && found.character.finds_lore(&format!("{}/{}", DROWNED_VALE.id, chapter_of(find)))
                });
                if paid {
                    continue;
                }
                let dice = self.dice(id);
                if let Some(found) = self.players.get_mut(&id) {
                    found.character.breach_cleared(&DROWNED_VALE, breach.tier, week, find, &dice);
                    found.gear_changed = true;
                }
                self.tell(EventKind::ChestOpened, None, id, id, find as f64);
            }
        }
    }
}

/// The Lodestone's Strike, what its bearer's swing weighs.
#[must_use]
pub fn lodestone_strike() -> f64 {
    lodestone::STRIKE_TIMES
}

/// How near a hidden chest a body opens it, metres.
pub const CHEST_REACH_M: f64 = 2.0;

/// The lore chapter's key a find of the Drowned Vale gives.
fn chapter_of(find: usize) -> &'static str {
    const CHAPTERS: [&str; 10] = [
        "mooring-stones",
        "the-green",
        "the-chapel",
        "the-unlit-ways",
        "what-was-and-what-is",
        "the-steward",
        "the-line",
        "the-unwritten-page",
        "the-heart-of-the-ways",
        "the-broken-stair",
    ];
    CHAPTERS.get(find).copied().unwrap_or_default()
}

impl Breach {
    /// The blocks standing at `tick`: every space's, each seal still shut, and each slab standing in its cycle.
    fn blocks_at(&self, tick: u64) -> Vec<Block> {
        let plan = self.plan;
        let mut blocks = plan.standing();
        for (number, seal) in plan.seals.iter().enumerate() {
            if !self.open_seals.contains(&number) {
                blocks.extend(plan.seal_blocks(seal));
            }
        }
        blocks
            .extend(plan.slabs.iter().filter(|slab| slab_stands(slab, tick)).filter_map(|slab| plan.slab_block(slab)));
        blocks
    }
}

/// The space an encounter is fought in.
pub(crate) fn space_of(plan: &Plan, encounter: usize) -> String {
    let key = DROWNED_VALE.encounters[encounter].key;
    plan.encounters.get(key).cloned().unwrap_or_default()
}

#[cfg(test)]
#[path = "breach_tests.rs"]
mod breach_tests;
#[cfg(test)]
#[path = "fights_tests.rs"]
mod fights_tests;
#[cfg(test)]
#[path = "gate_tests.rs"]
mod gate_tests;
