//! What every foe test builds on: a small room, its players scripted tick by tick, its foes thinking, every fighter
//! stepped by the combat rules, and blows, telegraphed blows and shots judged as a room judges them, with each foe told
//! what it saw.
#![allow(dead_code, reason = "each test file uses its own share of these")]

use combat::fighter::{Action, Side};
use combat::judge::{answered, judge, overreached, shot_blow, suffer, swing_blow, telegraph_blow};
use combat::shapes::TelegraphOrder;
use combat::shots::{Flight, Shot, fly};
use combat::sight::bearing;
use combat::strike::struck;
use combat::{Fighter, FighterId, Happening, Intent, Surroundings, Verdict, step_fighter};
use foes::{Board, Brain, Director, Kind, Routes, Seen, Straight, World, notice, spawn, think};
use movement::{Block, Controls, standing};

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
    /// Every foe's intent, by tick.
    pub intents: Vec<(u64, FighterId, Intent)>,
    pub happenings: Vec<(u64, FighterId, Happening)>,
    /// Every blow judged: tick, striker, defender, verdict.
    pub verdicts: Vec<(u64, FighterId, FighterId, Verdict)>,
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
            intents: Vec::new(),
            happenings: Vec::new(),
            verdicts: Vec::new(),
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

    pub fn foe(mut self, id: FighterId, kind: Kind, x: f64, y: f64, facing: f64) -> Self {
        let (fighter, brain) = spawn(kind, x, y, facing);
        self.fighters.push((id, fighter));
        self.brains.push((id, brain));
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
                routes: &*self.routes,
                director: self.director,
            };
            let (next, intent) = think(id, &brain, &mut self.board, &world);
            self.brains[index].1 = next;
            intents.push((id, intent));
            self.intents.push((tick, id, intent));
        }
        let players: Vec<FighterId> =
            self.fighters.iter().filter(|(_, fighter)| fighter.side == Side::Players).map(|(id, _)| *id).collect();
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
        self.fly();
        if self.immortal {
            for (_, fighter) in &mut self.fighters {
                if fighter.side == Side::Players {
                    fighter.health = fighter.health_max;
                }
            }
        }
        self.tick += 1;
    }

    fn tell(&mut self, id: FighterId, seen: Seen) {
        let tick = self.tick;
        if let Some((_, brain)) = self.brains.iter_mut().find(|(other, _)| *other == id) {
            *brain = notice(brain, id, &seen, tick);
        }
    }

    fn tell_all(&mut self, except: FighterId, seen: Seen) {
        let ids: Vec<FighterId> = self.brains.iter().map(|(id, _)| *id).filter(|id| *id != except).collect();
        for id in ids {
            self.tell(id, seen);
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
        verdict
    }

    fn answer(&mut self, by: FighterId, happening: Happening) {
        self.happenings.push((self.tick, by, happening));
        match happening {
            Happening::Swung(attack) => self.tell_all(by, Seen::Swung { by, attack }),
            Happening::Struck(attack) => {
                let striker = self.fighter(by);
                for defender in struck(by, &striker, &attack, &self.fighters, &self.blocks) {
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
                self.tell_all(by, Seen::Loosed { by });
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
            match fly(&shot, &self.blocks, &bodies) {
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
