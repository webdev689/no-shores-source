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
mod rejoin;
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
use plan::{Plan, drowned_vale};
use reach::Section;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Mutex, OnceLock, PoisonError};

/// How far past its spaces the run's ring lies, metres: a body leaves it only by falling, which kills first.
const RING_MARGIN_M: f64 = 30.0;
/// How far past its stage a living player walks into an encounter's space before it begins, metres.
pub const BEGIN_PAST_M: f64 = 8.0;
/// How far round a space its navmesh reaches, metres.
const NAV_MARGIN_M: f64 = 2.0;
/// How long every living player must be down for an attempt to be lost, ticks: three seconds, as Destiny's raids
/// gave a last revive.
pub const WIPE_TICKS: u64 = 3 * 60;
/// What a foe's blow on a player weighs at Hard, in its run and its Waking.
pub const HARD_BLOW: f64 = 1.25;
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
/// the revives left in this attempt (Hard's), the Lodestone, the marks on the Rewritten, the encounters' foes, the
/// hidden chests opened, and the spaces whose navmesh is baked.
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
    /// The tick since which every living player has been down, while an encounter runs; and when the whole company
    /// was unwritten while one ran, which loses the attempt WIPE_TICKS on, whoever stands again meanwhile.
    pub down_since: Option<u64>,
    pub lost: Option<u64>,
    pub foes: Vec<FighterId>,
    pub chests: BTreeSet<usize>,
    pub baked: BTreeSet<String>,
    /// The blocks that stood last tick, seals and slabs among them, and which seals were open and which slabs stood
    /// then (`standing_key`), to know when the room's must be made again.
    pub(crate) standing: Vec<Block>,
    pub(crate) standing_key: (u8, u64),
    /// What each account left the run with (`rejoin.rs`), so coming back stands no one up whole, cleansed or home.
    pub(crate) left: BTreeMap<String, rejoin::Left>,
    /// Everyone who has played in the run, and the great foes matched to them (`waves.rs`).
    pub(crate) roster: BTreeSet<String>,
    pub(crate) matched: Vec<waves::Matched>,
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
        let nav = baked(&standing, plan.space_bounds("descent", NAV_MARGIN_M)?);
        let mut room = Room::on(Floor::Dark, standing.clone(), vec![(arrival[0], arrival[1])], Some(section), nav);
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
            down_since: None,
            lost: None,
            foes: Vec::new(),
            chests: BTreeSet::new(),
            baked: BTreeSet::from(["descent".to_owned()]),
            standing,
            standing_key: (0, 0),
            left: BTreeMap::new(),
            roster: BTreeSet::new(),
            matched: Vec::new(),
        };
        breach.standing_key = breach.standing_key(0);
        breach.standing = breach.blocks_at(0);
        room.blocks = breach.standing.clone().into();
        room.breach = Some(Box::new(breach));
        Some(room)
    }

    /// How far a Breach's run's company has come: its tier and the encounter it is on, the count of encounters once
    /// all are won; none in any other room.
    #[must_use]
    pub fn breach_progress(&self) -> Option<(Tier, usize)> {
        let breach = self.breach.as_ref()?;
        let on = breach.phases.iter().position(|phase| *phase != Phase::Won).unwrap_or(breach.phases.len());
        Some((breach.tier, on))
    }

    /// Each tick in a Breach's run: its seals and slabs stood as they stand now, the stages reached, each encounter's
    /// rules, the Lodestone and its marks, and an attempt lost to a wipe. A mark
    /// goes with its player's fall, so one stood again is not unwritten by a mark from before.
    pub(crate) fn keep_breach(&mut self) {
        let Some(mut breach) = self.breach.take() else { return };
        breach.marked.retain(|id, _| self.players.get(id).is_some_and(crate::players::Player::living));
        breach.foes.retain(|id| self.foes.contains_key(id));
        self.keep_roster(&mut breach);
        self.reach_stages(&mut breach);
        for encounter in MENDING..=STEWARD {
            self.keep_encounter(&mut breach, encounter);
        }
        self.keep_lodestone(&mut breach);
        self.keep_chests(&mut breach);
        self.keep_wipe(&mut breach);
        self.breach = Some(breach);
    }

    /// The blocks that stand this tick, made the room's anew when they change: a seal opened, a slab come or gone.
    pub(crate) fn breach_blocks(&mut self) {
        let Some(breach) = self.breach.as_mut() else { return };
        let now = breach.standing_key(self.clock);
        if now != breach.standing_key {
            breach.standing_key = now;
            breach.standing = breach.blocks_at(self.clock);
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

    /// An encounter begins: its revives whole, its space's navmesh and its shores' baked, told to every player.
    fn begin(&mut self, breach: &mut Breach, encounter: usize) {
        breach.phases[encounter] = Phase::Running(self.clock);
        breach.revives = breach.tier.revives();
        self.bake_space(breach, &space_of(breach.plan, encounter));
        let plan = breach.plan;
        for shore in plan.shores.get(DROWNED_VALE.encounters[encounter].key).into_iter().flatten() {
            self.bake_space(breach, shore);
        }
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
        // Every fallen player stands again, so one who left down comes back whole.
        breach.left.clear();
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

    /// The furthest stage reached: by a win, or by a living player standing in its space; told as a checkpoint.
    fn reach_stages(&mut self, breach: &mut Breach) {
        let was = breach.reached;
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
            // Whoever comes in later, or back, comes in at the furthest stage.
            let (at, _) = self.stage_at(breach);
            self.spawn_points = vec![(at[0], at[1])];
        }
        // The stage is the run's checkpoint, told as an activity's is (`checkpoints.rs`).
        if breach.reached > was {
            self.tell_all(EventKind::Checkpoint, 0.0);
        }
    }

    /// Where the fallen stand again: the furthest stage reached, the run's checkpoint.
    pub(crate) fn stage_at(&self, breach: &Breach) -> ([f64; 3], [f64; 2]) {
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
        self.nav.join(vec![baked(&inside, bounds)]);
    }

    /// An attempt is lost once every living player has been down for WIPE_TICKS while an encounter runs, or
    /// WIPE_TICKS after the whole company was unwritten (`lost`): its foes go, it waits again with its rules as they
    /// began, the Lodestone and the marks are taken up, and every player stands whole at its stage. Told to every
    /// player.
    fn keep_wipe(&mut self, breach: &mut Breach) {
        let running = (MENDING..=STEWARD).find(|&at| matches!(breach.phases[at], Phase::Running(_)));
        if let Some(lost) = breach.lost {
            match running {
                Some(encounter) if self.clock >= lost + WIPE_TICKS => self.wipe(breach, encounter),
                Some(_) => {}
                None => breach.lost = None,
            }
            return;
        }
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
        breach.left.clear();
        breach.lodestone = Lodestone::default();
        (breach.down_since, breach.lost) = (None, None);
        breach.revives = breach.tier.revives();
        self.tell_all(EventKind::BreachWiped, encounter as f64);
        let players: Vec<PlayerId> = self.players.keys().copied().collect();
        let (at, _) = self.stage_at(breach);
        for id in players {
            self.stand_whole(id, at);
        }
    }
}

impl Room {
    /// What a foe's blow on a player weighs at Hard: HARD_BLOW in a Hard run, and on the company holding the gate
    /// in its Hard Waking.
    pub(crate) fn hard_times(&self, defender: FighterId) -> f64 {
        let run = self.breach.as_ref().is_some_and(|breach| breach.tier == Tier::Hard);
        let waking = self.breach_gate.as_ref().is_some_and(|gate| {
            let tier = gate.run_of(defender).and_then(|run| gate.companies.get(run)).and_then(|company| company.tier);
            gate.fighting(defender) && tier == Some(Tier::Hard)
        });
        if run || waking { HARD_BLOW } else { 1.0 }
    }

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
                // A character whose week is past the room's is paid nothing more this week, as `breach_cleared` says.
                let paid = self.players.get(&id).is_some_and(|found| {
                    let character = &found.character;
                    let behind = week < character.activity.this_week.week;
                    (behind || character.breach_paid(&DROWNED_VALE, breach.tier, week, find))
                        && character.finds_lore(&format!("{}/{}", DROWNED_VALE.id, chapter_of(find)))
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
    /// The company the great foes are matched to: everyone who has played in the run, still here, away or fallen, so
    /// leaving before a great foe stands makes it no weaker; at least one, at most eight.
    pub(crate) fn company(&self) -> usize {
        self.roster.len().clamp(1, gear::breach::COMPANY_MOST)
    }

    /// The blocks standing at `tick` (`Plan::blocks_at`).
    fn blocks_at(&self, tick: u64) -> Vec<Block> {
        self.plan.blocks_at(self.standing_key(tick).0, tick)
    }

    /// Which seals are open and which slabs stand at `tick`, a bit each: what the blocks standing then hang on.
    fn standing_key(&self, tick: u64) -> (u8, u64) {
        let seals = self.open_seals.iter().fold(0, |bits, seal| bits | (1 << seal));
        let slabs = self.plan.slabs.iter().enumerate();
        (seals, slabs.fold(0, |bits, (nth, slab)| bits | (u64::from(plan::slab_stands(slab, tick)) << nth)))
    }
}

/// The most bakes a process keeps (`baked`): each space's, and the Broken Stair's once for each way its slabs stand.
const BAKED_MOST: usize = 96;

/// A navmesh baked over blocks laid on the dark within bounds, kept for the process: every run of a Breach bakes each
/// space over the same blocks, so the runs a host opens, and the tests, bake each once. Past BAKED_MOST it bakes afresh.
fn baked(blocks: &[Block], bounds: navmesh::Bounds) -> navmesh::NavMesh {
    static BAKES: OnceLock<Mutex<BTreeMap<Vec<u64>, navmesh::NavMesh>>> = OnceLock::new();
    let edges =
        blocks.iter().flat_map(|block| [block.min_x, block.min_y, block.max_x, block.max_y, block.bottom, block.top]);
    let key: Vec<u64> =
        [bounds.min_x, bounds.min_y, bounds.max_x, bounds.max_y].into_iter().chain(edges).map(f64::to_bits).collect();
    let bakes = BAKES.get_or_init(Mutex::default);
    if let Some(nav) = bakes.lock().unwrap_or_else(PoisonError::into_inner).get(&key) {
        return nav.clone();
    }
    let nav = navmesh::NavMesh::bake_over_sea(blocks, bounds, &navmesh::AGENT);
    let mut kept = bakes.lock().unwrap_or_else(PoisonError::into_inner);
    if kept.len() < BAKED_MOST {
        kept.insert(key, nav.clone());
    }
    nav
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
#[cfg(test)]
#[path = "keeping_tests.rs"]
mod keeping_tests;
#[cfg(test)]
#[path = "lodestone_tests.rs"]
mod lodestone_tests;
#[cfg(test)]
#[path = "mending_tests.rs"]
mod mending_tests;
#[cfg(test)]
#[path = "rewards_tests.rs"]
mod rewards_tests;
#[cfg(test)]
#[path = "scrivener_tests.rs"]
mod scrivener_tests;
#[cfg(test)]
#[path = "steward_tests.rs"]
mod steward_tests;
#[cfg(test)]
#[path = "tuning_tests.rs"]
mod tuning_tests;
