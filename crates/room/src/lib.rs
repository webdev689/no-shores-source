//! A shared space on the server: its players and foes, every one a fighter by the combat rules. Each player's inputs
//! are taken in order and step their fighter one input a tick, never faster than the room's own clock; foes think and
//! step each tick; blows are judged as their defenders saw them. It has no network and no clock: whatever hosts the
//! room hands it inputs and ticks, and sends out what it sees. See the Server note in the bible.

mod judging;
mod players;

pub use judging::{Event, EventKind, How, how_of};
pub use players::{DRESS_LIMIT, Input, MOVE_LIMIT, PlayerId, Refused, SLACK_TICKS, Shown, VIEW_LAG, WAITING_LIMIT};

use combat::arms::{Arms, BARE_HANDS};
use combat::fighter::{Action, FighterId, player};
use combat::judge::swing_blow;
use combat::strike::struck;
use combat::tuning::{FOE_GONE, RESPAWN};
use combat::{Fighter, Happening, Shot, Verdict, player_tick};
use judging::{Check, Group, Pending, how_of_swing};
use movement::{Block, standing};
use players::Player;
use std::collections::{BTreeMap, VecDeque};

/// A player as the room last stepped them: their fighter, what their figure showed with it, and the number of their
/// last input it took.
#[derive(Clone, Debug, PartialEq)]
pub struct Seen {
    pub player: PlayerId,
    pub fighter: Fighter,
    pub shown: Shown,
    pub acknowledged: u32,
}

/// A foe as the room keeps it: its fighter and its kind's number.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Foe {
    pub fighter: Fighter,
    pub kind: u8,
}

/// A foe as the room last stepped it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FoeSeen {
    pub foe: FighterId,
    pub kind: u8,
    pub fighter: Fighter,
}

/// One shared space: its course, its clock in ticks, its players and foes in the order of their numbers, shots in
/// flight, the blows waiting on their defenders' views, and what happened since it was last asked.
#[derive(Debug)]
pub struct Room {
    pub(crate) blocks: Vec<Block>,
    spawn: (f64, f64),
    pub(crate) clock: u64,
    next_fighter: FighterId,
    pub(crate) players: BTreeMap<PlayerId, Player>,
    pub(crate) foes: BTreeMap<FighterId, Foe>,
    pub(crate) shots: Vec<Shot>,
    pub(crate) pending: Vec<Pending>,
    pub(crate) groups: BTreeMap<u32, Group>,
    pub(crate) next_group: u32,
    pub(crate) events: Vec<judging::Event>,
    /// This tick's verdicts (striker, defender) and telegraphed blows ended (foe, found no one, dodged perfectly), for
    /// the foes' brains.
    pub(crate) verdicts: Vec<(FighterId, FighterId, Verdict)>,
    pub(crate) ended_telegraphs: Vec<(FighterId, bool, bool)>,
    /// Foes the players asked to stand before them: (player, kind).
    pub(crate) spawns: Vec<(PlayerId, u8)>,
    /// Every fighter after each of the last ticks, to judge a player's blows as the player saw them.
    past: VecDeque<(u64, Vec<(FighterId, Fighter)>)>,
}

impl Room {
    /// An empty room on a course of blocks, where players stand at `spawn` (x, y) when they join.
    #[must_use]
    pub fn new(blocks: Vec<Block>, spawn: (f64, f64)) -> Self {
        Room {
            blocks,
            spawn,
            clock: 0,
            next_fighter: 1,
            players: BTreeMap::new(),
            foes: BTreeMap::new(),
            shots: Vec::new(),
            pending: Vec::new(),
            groups: BTreeMap::new(),
            next_group: 1,
            events: Vec::new(),
            verdicts: Vec::new(),
            ended_telegraphs: Vec::new(),
            spawns: Vec::new(),
            past: VecDeque::new(),
        }
    }

    pub(crate) fn next_id(&mut self) -> FighterId {
        let id = self.next_fighter;
        self.next_fighter += 1;
        id
    }

    /// A new player, standing at the spawn with nothing drawn.
    pub fn join(&mut self) -> PlayerId {
        let id = self.next_id();
        let fighter = player(standing(self.spawn.0, self.spawn.1), BARE_HANDS);
        self.players.insert(id, Player::new(fighter, self.clock));
        id
    }

    pub fn leave(&mut self, player: PlayerId) {
        self.players.remove(&player);
        self.pending.retain(|pending| pending.defender != player);
    }

    /// The player's input, which must follow their last. Its intent and look wait for the room's next tick; a new
    /// dress is taken at once.
    pub fn input(&mut self, player: PlayerId, mut input: Input) -> Result<(), Refused> {
        let found = self.players.get_mut(&player).ok_or(Refused::NoSuchPlayer)?;
        let expected = found.received.wrapping_add(1);
        if input.sequence != expected {
            return Err(Refused::OutOfOrder { expected, got: input.sequence });
        }
        if found.waiting.len() >= WAITING_LIMIT {
            return Err(Refused::TooManyWaiting);
        }
        if !input.fits() {
            return Err(Refused::BadLook);
        }
        found.received = input.sequence;
        if let Some(dress) = input.dress.take()
            && dress != found.dress
        {
            found.dress = dress;
            found.dress_changed = true;
        }
        // A player never begins a telegraphed blow.
        input.intent.combat.telegraph = None;
        found.waiting.push_back(input);
        Ok(())
    }

    /// One tick of the room's clock: each player's waiting inputs step their fighter in order, as many as the clock
    /// allows; the foes think and step; shots fly; blows waiting on a player's view are judged; the dead stand again
    /// or are gone; and every fighter is kept for judging later blows as players saw them.
    pub fn tick(&mut self) {
        self.clock += 1;
        self.verdicts.clear();
        self.ended_telegraphs.clear();
        self.step_players();
        self.fly_shots();
        self.judge_waiting();
        self.spawns.clear();
        self.raise_the_dead();
        self.past.push_back((self.clock, self.fighters()));
        while self.past.len() > usize::try_from(VIEW_LAG).unwrap_or(24) + 1 {
            self.past.pop_front();
        }
    }

    fn step_players(&mut self) {
        let ids: Vec<PlayerId> = self.players.keys().copied().collect();
        for id in ids {
            while let Some((input, seen)) = self.next_input(id) {
                let view = self.view_at(seen);
                let Some(found) = self.players.get_mut(&id) else { break };
                let fighter = if found.fighter.dead() {
                    found.fighter
                } else {
                    Fighter { arms: Arms::from_code(input.arms), ..found.fighter }
                };
                let (next, happening) = player_tick(id, &fighter, &input.intent, &view, &self.blocks);
                found.fighter = next;
                found.shown = input.shown;
                found.remember(seen);
                if let Some(kind) = input.spawn {
                    self.spawns.push((id, kind));
                }
                self.happened(id, &next, happening, &view);
            }
        }
    }

    /// The player's next input the clock allows, and the room tick it was seeing (never ahead of the clock, never
    /// behind the last, never further back than a view may lag).
    fn next_input(&mut self, id: PlayerId) -> Option<(Input, u64)> {
        let clock = self.clock;
        let found = self.players.get_mut(&id)?;
        if found.stepped >= clock - found.joined + SLACK_TICKS {
            return None;
        }
        let input = found.waiting.pop_front()?;
        found.stepped += 1;
        found.acknowledged = found.acknowledged.wrapping_add(1);
        let seen = input.seen.min(clock).max(found.seen).max(clock.saturating_sub(VIEW_LAG));
        Some((input, seen))
    }

    /// What a fighter's tick set off, among `view`, everyone as it saw them: a blow landing on whoever it reaches, a
    /// shot leaving, a feint.
    pub(crate) fn happened(
        &mut self,
        id: FighterId,
        fighter: &Fighter,
        happening: Option<Happening>,
        view: &[(FighterId, Fighter)],
    ) {
        match happening {
            Some(Happening::Struck(attack)) => {
                for defender in struck(id, fighter, &attack, view, &self.blocks) {
                    let blow = swing_blow(id, fighter, &attack, defender);
                    let how = how_of_swing(&attack, defender);
                    if self.players.contains_key(&defender) {
                        let check = Check::Swing { striker: Box::new(*fighter), attack };
                        self.pending.push(Pending { blow, how, defender, tick: self.clock, check });
                    } else if let Some((_, then)) = view.iter().find(|(other, _)| *other == defender) {
                        let then = *then;
                        self.judge_now(&blow, how, defender, &then);
                    }
                }
            }
            Some(Happening::Loosed(shot)) => self.shots.push(Shot { owner: id, ..shot }),
            Some(Happening::Feinted(_)) => self.tell(EventKind::Feinted, None, id, id, 0.0),
            _ => {}
        }
    }

    /// A player dead long enough stands again at the spawn, whole; a foe dead long enough is gone.
    fn raise_the_dead(&mut self) {
        let spawn = self.spawn;
        let mut raised = Vec::new();
        for (id, found) in &mut self.players {
            if let Action::Dead { elapsed } = found.fighter.action
                && elapsed >= RESPAWN
            {
                found.fighter = player(standing(spawn.0, spawn.1), found.fighter.arms);
                raised.push(*id);
            }
        }
        for id in raised {
            self.tell(EventKind::Respawned, None, id, id, 0.0);
        }
        self.foes.retain(|_, foe| !matches!(foe.fighter.action, Action::Dead { elapsed } if elapsed >= FOE_GONE));
    }

    /// Every fighter now, players then foes, each in the order of their numbers.
    #[must_use]
    pub fn fighters(&self) -> Vec<(FighterId, Fighter)> {
        let players = self.players.iter().map(|(id, found)| (*id, found.fighter));
        players.chain(self.foes.iter().map(|(id, foe)| (*id, foe.fighter))).collect()
    }

    /// Every fighter as it stood after the tick `tick`, while the room still keeps it; else as it is now.
    pub(crate) fn view_at(&self, tick: u64) -> Vec<(FighterId, Fighter)> {
        self.past
            .iter()
            .find(|(kept, _)| *kept == tick)
            .map_or_else(|| self.fighters(), |(_, fighters)| fighters.clone())
    }

    pub(crate) fn fighter(&self, id: FighterId) -> Option<&Fighter> {
        self.players.get(&id).map(|found| &found.fighter).or_else(|| self.foes.get(&id).map(|foe| &foe.fighter))
    }

    pub(crate) fn set_fighter(&mut self, id: FighterId, fighter: Fighter) {
        if let Some(found) = self.players.get_mut(&id) {
            found.fighter = fighter;
        } else if let Some(foe) = self.foes.get_mut(&id) {
            foe.fighter = fighter;
        }
    }

    /// Every player as the room last stepped them, in the order of their numbers.
    pub fn seen(&self) -> impl Iterator<Item = Seen> + '_ {
        self.players.iter().map(|(&player, found)| Seen {
            player,
            fighter: found.fighter,
            shown: found.shown.clone(),
            acknowledged: found.acknowledged,
        })
    }

    /// Every foe as the room last stepped it, in the order of their numbers.
    pub fn foes_seen(&self) -> impl Iterator<Item = FoeSeen> + '_ {
        self.foes.iter().map(|(&foe, found)| FoeSeen { foe, kind: found.kind, fighter: found.fighter })
    }

    /// The shots in flight.
    #[must_use]
    pub fn shots(&self) -> &[Shot] {
        &self.shots
    }

    /// What happened in the fight since this was last asked, to send to everyone once.
    pub fn take_events(&mut self) -> Vec<Event> {
        std::mem::take(&mut self.events)
    }

    /// Every player's dress, for one who joins; players who have sent none are left out.
    pub fn dresses(&self) -> impl Iterator<Item = (PlayerId, &str)> + '_ {
        self.players
            .iter()
            .filter(|(_, found)| !found.dress.is_empty())
            .map(|(&player, found)| (player, found.dress.as_str()))
    }

    /// The dresses that changed since this was last asked, to send to everyone once.
    pub fn take_dress_changes(&mut self) -> Vec<(PlayerId, String)> {
        let changed = self.players.iter_mut().filter(|(_, found)| found.dress_changed);
        changed
            .map(|(&player, found)| {
                found.dress_changed = false;
                (player, found.dress.clone())
            })
            .collect()
    }

    #[must_use]
    pub fn clock(&self) -> u64 {
        self.clock
    }
}

#[cfg(test)]
#[path = "room_tests.rs"]
mod room_tests;

#[cfg(test)]
#[path = "fight_tests.rs"]
mod fight_tests;
