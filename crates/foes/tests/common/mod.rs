//! What every foe test builds on: a small room, its players scripted tick by tick, its foes thinking, every fighter
//! stepped by the combat rules, and blows, telegraphed blows and shots judged as a room judges them, with each foe told
//! what it saw, the noises fighters of other sides made, and its allies' shouts.
#![allow(dead_code, reason = "each test file uses its own share of these")]

use combat::fighter::Action;
use combat::judge::{answered, judge, overreached, shot_blow, suffer, swing_blow, telegraph_blow};
use combat::shapes::TelegraphOrder;
use combat::shots::{Flight, Shot, fly};
use combat::sight::bearing;
use combat::strike::struck;
use combat::{Fighter, FighterId, Happening, Intent, Surroundings, Verdict, step_fighter};
use foes::noises::{Noise, landed, running, swing};
use foes::{
    Board, Brain, Call, Director, NoSpots, Rank, Routes, Seen, Spot, Spots, Straight, World, foe_type, notice, spawn,
    think,
};
use movement::{Block, Controls, standing};
use navmesh::{AGENT, Bounds, NavMesh};
use std::rc::Rc;

/// The pirates' types, the five foes as the Test Ground first had them.
pub const SKIRMISHER: u8 = 13;
pub const SWORDSMAN: u8 = 14;
pub const BRUTE: u8 = 15;
pub const ARCHER: u8 = 16;
pub const CAPTAIN: u8 = 17;

/// A player's controls and buttons for a tick, from the room as it stands.
pub type Script<'a> = &'a mut dyn FnMut(&Room, FighterId) -> Intent;

pub struct Room {
    pub tick: u64,
    pub seed: u64,
    pub fighters: Vec<(FighterId, Fighter)>,
    pub brains: Vec<(FighterId, Brain)>,
    pub board: Board,
    /// The fight's heat, held where a test sets it.
    pub director: Director,
    pub blocks: Vec<Block>,
    pub routes: Box<dyn Routes>,
    pub spots: Box<dyn Spots>,
    /// Every foe's intent, by tick.
    pub intents: Vec<(u64, FighterId, Intent)>,
    pub happenings: Vec<(u64, FighterId, Happening)>,
    /// Every blow judged: tick, striker, defender, verdict.
    pub verdicts: Vec<(u64, FighterId, FighterId, Verdict)>,
    /// Every call for foes a foe made: tick, foe and whom it called.
    pub crew_calls: Vec<(u64, FighterId, Call)>,
    /// Every shout a foe made as it turned alert: tick and foe.
    pub shouts: Vec<(u64, FighterId)>,
    pub shots: Vec<Shot>,
    /// Players' health kept full, so a long fight goes on.
    pub immortal: bool,
}

impl Room {
    pub fn new(seed: u64) -> Self {
        Room {
            tick: 0,
            seed,
            fighters: Vec::new(),
            brains: Vec::new(),
            board: Board::default(),
            director: Director::default(),
            blocks: Vec::new(),
            routes: Box::new(Straight),
            spots: Box::new(NoSpots),
            intents: Vec::new(),
            happenings: Vec::new(),
            verdicts: Vec::new(),
            crew_calls: Vec::new(),
            shouts: Vec::new(),
            shots: Vec::new(),
            immortal: true,
        }
    }

    /// A player with a sword at (x, y), looking along `facing`.
    pub fn player(mut self, id: FighterId, x: f64, y: f64, facing: f64) -> Self {
        let mut body = standing(x, y);
        body.facing = facing;
        let mut fighter = combat::fighter::player(body, combat::arms_of("sword_steel", "", true));
        fighter.aim = facing;
        self.fighters.push((id, fighter));
        self
    }

    /// A foe of the type numbered `number` at `rank`.
    pub fn foe(mut self, id: FighterId, number: u8, rank: Rank, x: f64, y: f64, facing: f64) -> Self {
        let (fighter, brain) = spawn(foe_type(number).expect("a type of the roster"), rank, x, y, facing);
        self.fighters.push((id, fighter));
        self.brains.push((id, brain));
        self
    }

    /// A course of blocks, its navmesh baked as a room bakes it over open ground 30 m round: the foes find their way by
    /// its routes and fire from its spots.
    pub fn course(mut self, blocks: Vec<Block>) -> Self {
        let bounds = Bounds { min_x: -30.0, min_y: -30.0, max_x: 30.0, max_y: 30.0 };
        let mesh = Rc::new(NavMesh::bake(&blocks, bounds, &AGENT));
        self.routes = Box::new(Mesh(Rc::clone(&mesh)));
        self.spots = Box::new(Mesh(mesh));
        self.blocks = blocks;
        self
    }

    pub fn fighter(&self, id: FighterId) -> Fighter {
        self.fighters
            .iter()
            .find(|(other, _)| *other == id)
            .map(|(_, fighter)| *fighter)
            .expect("a fighter of the room")
    }

    pub fn set(&mut self, id: FighterId, change: impl FnOnce(&mut Fighter)) {
        let (_, fighter) = self.fighters.iter_mut().find(|(other, _)| *other == id).expect("a fighter of the room");
        change(fighter);
    }

    pub fn brain(&self, id: FighterId) -> &Brain {
        self.brains.iter().find(|(other, _)| *other == id).map(|(_, brain)| brain).expect("a foe of the room")
    }

    /// Wakes a foe as an ally's shout beside it would, toward where `whom` stands: alert from its first thought.
    pub fn alert(mut self, id: FighterId, whom: FighterId) -> Self {
        let (from, at) = (feet(&self.fighter(id)), feet(&self.fighter(whom)));
        self.tell(id, Seen::Shouted { from, at });
        self
    }

    pub fn distance(&self, first: FighterId, second: FighterId) -> f64 {
        let (one, two) = (self.fighter(first).body, self.fighter(second).body);
        combat::sight::apart([one.x, one.y], [two.x, two.y])
    }

    /// The bearing from one fighter to another.
    pub fn toward(&self, from: FighterId, to: FighterId) -> f64 {
        let (one, two) = (self.fighter(from).body, self.fighter(to).body);
        bearing([one.x, one.y], [two.x, two.y])
    }

    /// Ticks at which a fighter began a swing.
    pub fn swings(&self, id: FighterId) -> Vec<u64> {
        self.happenings
            .iter()
            .filter(|(_, by, happening)| *by == id && matches!(happening, Happening::Swung(_)))
            .map(|(tick, _, _)| *tick)
            .collect()
    }

    /// The telegraphed blows a foe ordered.
    pub fn orders(&self, id: FighterId) -> Vec<(u64, TelegraphOrder)> {
        self.intents
            .iter()
            .filter(|(_, foe, _)| *foe == id)
            .filter_map(|(tick, _, intent)| intent.combat.telegraph.map(|order| (*tick, order)))
            .collect()
    }

    pub fn foe_intents(&self, id: FighterId) -> Vec<(u64, Intent)> {
        self.intents.iter().filter(|(_, foe, _)| *foe == id).map(|(tick, _, intent)| (*tick, *intent)).collect()
    }

    pub fn run(&mut self, ticks: u64, script: Script<'_>) {
        for _ in 0..ticks {
            self.step(script);
        }
    }

    pub fn step(&mut self, script: Script<'_>) {
        let tick = self.tick;
        let mut intents: Vec<(FighterId, Intent)> = Vec::new();
        for index in 0..self.brains.len() {
            let (id, brain) = self.brains[index].clone();
            let world = World {
                tick,
                seed: self.seed,
                fighters: &self.fighters,
                blocks: &self.blocks,
                terrain: &movement::Flat,
                routes: &*self.routes,
                spots: &*self.spots,
                director: self.director,
            };
            let (mut next, intent) = think(id, &brain, &mut self.board, &world);
            let calls = next.take_calls();
            if calls.refill_poise {
                self.set(id, |fighter| fighter.poise = 0.0);
            }
            if let Some(call) = calls.crew {
                self.crew_calls.push((tick, id, call));
            }
            if let Some(at) = calls.shout {
                self.shouts.push((tick, id));
                let (from, side) = (feet(&self.fighter(id)), self.fighter(id).side);
                for ally in self.brain_ids(|other| other.side == side) {
                    if ally != id {
                        self.tell(ally, Seen::Shouted { from, at });
                    }
                }
            }
            self.brains[index].1 = next;
            intents.push((id, intent));
            self.intents.push((tick, id, intent));
        }
        let players: Vec<FighterId> =
            self.fighters.iter().filter(|(_, fighter)| fighter.is_player()).map(|(id, _)| *id).collect();
        for id in players {
            intents.push((id, script(self, id)));
        }
        let before = self.fighters.clone();
        let mut happened = Vec::new();
        for (id, fighter) in &mut self.fighters {
            let intent =
                intents.iter().find(|(other, _)| other == id).map_or_else(Intent::default, |(_, intent)| *intent);
            let brain = self.brains.iter().find(|(other, _)| other == id).map(|(_, brain)| brain);
            let target = brain.map_or(fighter.target, Brain::target);
            if let Some(brain) = brain {
                fighter.might = brain.might();
                fighter.target = target;
            }
            let target_at = target
                .and_then(|target| before.iter().find(|(other, _)| *other == target))
                .map(|(_, other)| other.chest());
            let (next, happening) = step_fighter(
                fighter,
                &intent,
                &Surroundings { blocks: &self.blocks, terrain: &movement::Flat, target_at },
            );
            *fighter = next;
            if let Some(happening) = happening {
                happened.push((*id, happening));
            }
        }
        for (id, happening) in happened {
            self.answer(id, happening);
        }
        let runners: Vec<Noise> = self.fighters.iter().filter_map(|(_, fighter)| running(fighter, tick)).collect();
        for noise in runners {
            self.hear(noise);
        }
        self.fly();
        if self.immortal {
            for (_, fighter) in &mut self.fighters {
                if fighter.is_player() {
                    fighter.health = fighter.health_max;
                }
            }
        }
        self.tick += 1;
    }

    /// Tells a foe what the room saw, as a room's foe is told.
    pub fn tell(&mut self, id: FighterId, seen: Seen) {
        let tick = self.tick;
        if let Some((_, brain)) = self.brains.iter_mut().find(|(other, _)| *other == id) {
            notice(brain, id, &seen, tick);
        }
    }

    fn tell_all(&mut self, except: FighterId, seen: Seen) {
        let ids: Vec<FighterId> = self.brains.iter().map(|(id, _)| *id).filter(|id| *id != except).collect();
        for id in ids {
            self.tell(id, seen);
        }
    }

    /// The foes whose fighters pass a test, in order.
    fn brain_ids(&self, test: impl Fn(&Fighter) -> bool) -> Vec<FighterId> {
        self.brains.iter().map(|(id, _)| *id).filter(|id| test(&self.fighter(*id))).collect()
    }

    /// A noise, told to every foe.
    pub fn hear(&mut self, noise: Noise) {
        for id in self.brain_ids(|_| true) {
            self.tell(id, Seen::Heard(noise));
        }
    }

    fn judged(&mut self, striker: FighterId, defender: FighterId, blow: &combat::Blow) -> Verdict {
        let verdict = judge(blow, &self.fighter(defender));
        let hurt = suffer(&self.fighter(defender), blow, &verdict);
        self.set(defender, |fighter| *fighter = hurt);
        let answer = answered(&self.fighter(striker), defender, &verdict);
        self.set(striker, |fighter| *fighter = answer);
        self.verdicts.push((self.tick, striker, defender, verdict));
        self.tell(defender, Seen::Struck { by: striker, verdict });
        self.hear(landed(&self.fighter(striker), &self.fighter(defender)));
        verdict
    }

    fn answer(&mut self, by: FighterId, happening: Happening) {
        self.happenings.push((self.tick, by, happening));
        match happening {
            Happening::Swung(attack) => {
                self.tell_all(by, Seen::Swung { by, attack });
                self.hear(swing(&self.fighter(by)));
            }
            Happening::Struck(attack) => {
                let striker = self.fighter(by);
                for defender in struck(by, &striker, &attack, &self.fighters, &self.blocks, &movement::Flat) {
                    let blow = swing_blow(by, &self.fighter(by), &attack, defender);
                    let verdict = self.judged(by, defender, &blow);
                    self.tell(by, Seen::Landed { on: defender, verdict });
                }
            }
            Happening::Landed(telegraph) => {
                let striker = self.fighter(by);
                let caught: Vec<FighterId> = self
                    .fighters
                    .iter()
                    .filter(|(_, other)| other.side != striker.side && !other.dead())
                    .filter(|(_, other)| telegraph.holds(other.body.x, other.body.y))
                    .map(|(id, _)| *id)
                    .collect();
                for defender in &caught {
                    let blow = telegraph_blow(by, &self.fighter(by), &telegraph);
                    self.judged(by, *defender, &blow);
                }
                if caught.is_empty() {
                    let spent = overreached(&striker, &telegraph, false);
                    self.set(by, |fighter| *fighter = spent);
                }
                self.tell(by, Seen::TelegraphEnded { missed: caught.is_empty(), perfectly_dodged: false });
            }
            Happening::Loosed(shot) => {
                self.shots.push(Shot { owner: by, ..shot });
                let speed = libm::sqrt(shot.velocity.iter().map(|part| part * part).sum());
                self.tell_all(by, Seen::Loosed { by, speed });
                self.hear(foes::noises::shot(&self.fighter(by), shot.ranged));
            }
            Happening::Feinted(_) | Happening::Dodged | Happening::Guarded { .. } => {}
        }
    }

    fn fly(&mut self) {
        let flying = std::mem::take(&mut self.shots);
        for shot in flying {
            let side = self.fighter(shot.owner).side;
            let bodies: Vec<(FighterId, [f64; 3])> = self
                .fighters
                .iter()
                .filter(|(id, other)| *id != shot.owner && other.side != side && !other.dead())
                .map(|(id, other)| (*id, [other.body.x, other.body.y, other.body.z]))
                .collect();
            match fly(&shot, &self.blocks, &movement::Flat, &bodies) {
                Flight::Flying(next) => self.shots.push(next),
                Flight::Stopped { struck: Some(defender), .. } => {
                    let blow = shot_blow(&shot, [shot.at[0], shot.at[1]]);
                    self.judged(shot.owner, defender, &blow);
                }
                Flight::Stopped { struck: None, .. } => {}
            }
        }
    }
}

/// Where a fighter's feet are.
pub fn feet(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
}

/// Standing still, looking along `yaw`.
pub fn standing_still(yaw: f64) -> Intent {
    Intent { controls: Controls { yaw, ..Controls::default() }, ..Intent::default() }
}

/// A player that stands where it is, looking along `yaw`.
pub fn still(yaw: f64) -> impl FnMut(&Room, FighterId) -> Intent {
    move |_, _| standing_still(yaw)
}

/// A player that stands and keeps looking at one fighter.
pub fn watching(whom: FighterId) -> impl FnMut(&Room, FighterId) -> Intent {
    move |room, me| standing_still(room.toward(me, whom))
}

/// Whether a fighter is swinging.
pub fn swinging(fighter: &Fighter) -> bool {
    matches!(fighter.action, Action::Attack(_))
}

/// A baked navmesh, as the room hands it in: its routes and its firing spots.
struct Mesh(Rc<NavMesh>);

impl Routes for Mesh {
    fn next_point(&self, from: [f64; 3], to: [f64; 3]) -> Option<[f64; 3]> {
        let path = self.0.find_path(from, to).or_else(|| self.0.find_path(from, self.0.nearest_point(to)?));
        Some(path.and_then(|points| points.get(1).copied()).unwrap_or(to))
    }

    fn length(&self, from: [f64; 3], to: [f64; 3]) -> Option<f64> {
        let points = self.0.find_path(from, to)?;
        Some(
            points
                .windows(2)
                .map(|pair| combat::sight::apart([pair[0][0], pair[0][1]], [pair[1][0], pair[1][1]]))
                .sum(),
        )
    }
}

impl Spots for Mesh {
    fn near(&self, point: [f64; 3], radius: f64) -> Vec<Spot> {
        let near = self.0.spots_near(point, radius);
        near.map(|spot| Spot { point: spot.point, cover: spot.cover, lanes: spot.lanes }).collect()
    }
}
