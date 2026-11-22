//! A room's players: what each sends (a tick's intent, the look of its own figure, its dress, what it holds, the tick
//! of the room it was seeing, and a foe to stand before it), the checks an input must pass, the turn each input and
//! dress is taken in, and what the room keeps of each to judge blows on it as it saw them.

use crate::asks::Asked;
use crate::{EventKind, Room};
use combat::Fighter;
use combat::fighter::{Action, FighterId, player};
use combat::tuning::{FOE_GONE, RESPAWN};
use gear::Character;
use reach::Standing;
use std::collections::VecDeque;

/// How often, in ticks, a player's changed gear is sent: five times a second.
pub const GEAR_EVERY_TICKS: u64 = 12;

/// A player's number in a room, never reused while the room lives: one count with the foes'.
pub type PlayerId = FighterId;

/// How many ticks of inputs a player may run ahead of the room's clock, to ride out a network's jitter.
pub const SLACK_TICKS: u64 = 6;
/// How many inputs a player may have waiting; past that, the oldest is let go (as taken), so a flood or a burst after a
/// stall never refuses one and never breaks the order.
pub const WAITING_LIMIT: usize = 30;
/// How many of a player's inputs one tick may take: one is due, the rest catch up after a stall, no faster than this.
pub const CATCH_UP: usize = 3;
/// How far the room tick a player says it was seeing may move on from one input to the next.
pub const SEEN_STEP: u64 = 4;
/// How long after a player stands again the foes leave them be, unless they strike first.
pub const GRACE: u64 = 180;
/// How often a player's dress may change; a change sooner waits its turn.
pub const DRESS_EVERY: u64 = 60;
/// How many players a room holds.
pub const PLAYERS_MOST: usize = 16;
/// The longest move name and dress, in bytes, a player may send.
pub const MOVE_LIMIT: usize = 40;
pub const DRESS_LIMIT: usize = 4096;
/// How far behind the room's clock a player's view may be taken: its blows judged as it saw them, blows on it waiting
/// this long at most for its view to reach them.
pub const VIEW_LAG: u64 = 24;
/// How many of a player's past fighters, by input, the room keeps to judge blows on it as it saw them.
pub const HISTORY: usize = 64;

/// Why an input was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refused {
    NoSuchPlayer,
    /// Inputs are numbered 1, 2, 3… for each player, and must arrive in that order.
    OutOfOrder {
        expected: u32,
        got: u32,
    },
    /// A move name that is not lowercase letters, digits and underscores, or a move or dress past its limit.
    BadLook,
}

/// What a player's figure shows, as their own browser draws it: the forge's move, its frame, and the way it faces.
/// The room decides nothing about it; it passes it on with the fighter it goes with.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Shown {
    pub anim: String,
    pub frame: u16,
    pub facing: f64,
}

/// One input from a player: its number; one tick's intent (movement and the fight's buttons); what their figure
/// shows; their dress when it changed (as the browser writes it; the room puts in the cosmetics worn); what their
/// hands hold (`combat::Arms` as its code); the room tick of the last snapshot their screen showed; a foe to stand
/// before them, or every foe sent away, if they asked (the Test Ground's panel), and the foe's level (0 for none: it
/// fights by combat's own numbers); whether they ask to respawn, dead past a node's section; an ask of their gear;
/// and a spell they cast.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Input {
    pub sequence: u32,
    pub intent: combat::Intent,
    pub shown: Shown,
    pub dress: Option<String>,
    pub arms: u32,
    pub seen: u64,
    pub spawn: Option<SpawnAsk>,
    pub respawn: bool,
    pub ask: Option<Asked>,
    pub spawn_level: u8,
    pub cast: Option<crate::arts::Cast>,
}

/// What a player asks of the room's foes: one of a type (the roster's number) at a rank (its number; a rank the type
/// does not come in, or none, takes the type's first), with a shield of an element (the gear crate's number, 0 for
/// none), or every foe sent away.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpawnAsk {
    Foe { foe_type: u8, rank: u8, shield: u8 },
    Clear,
}

impl SpawnAsk {
    /// A foe asked for by its role alone (1 skirmisher to 5 captain, no type), as a page from before the roster asks:
    /// the pirates' type in that role, a Major, or at its first rank if it comes in none (their Captain an Elite).
    #[must_use]
    pub fn by_role(role: u8, shield: u8) -> Option<Self> {
        let foe_type = ::foes::in_role(::foes::factions::PIRATES, ::foes::Role::from_number(role)?)?;
        let rank = foe_type.rank_or_first(Some(::foes::Rank::Major)) as u8;
        Some(Self::Foe { foe_type: foe_type.number, rank, shield })
    }
}

impl Input {
    /// Whether its look and dress are within what a room carries, and every number it moves or faces by is one (a
    /// button reads as pressed by any number but 0, and the intent's reading already took a pitch or mark that is
    /// none as such).
    #[must_use]
    pub fn fits(&self) -> bool {
        let anim = &self.shown.anim;
        let named = anim.bytes().all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_');
        let dress_fits = self.dress.as_ref().is_none_or(|dress| dress.len() <= DRESS_LIMIT);
        let controls = self.intent.controls;
        let numbers = [controls.forward, controls.sideways, controls.yaw, self.shown.facing];
        named && anim.len() <= MOVE_LIMIT && dress_fits && numbers.iter().all(|number| number.is_finite())
    }
}

/// A player as the room keeps them.
#[derive(Debug)]
pub struct Player {
    pub fighter: Fighter,
    /// Where the player stands with the room's section: always inside a room with none.
    pub standing: Standing,
    /// The height their feet last stood at, that a fall in a social space is measured from (`reach::stood`).
    pub stood: f64,
    pub shown: Shown,
    /// The dress as others are shown it (`dressed`), and whether it changed since it was last passed on.
    pub dress: String,
    pub dress_changed: bool,
    /// The dress as their browser last wrote it, and whether what the room makes of it may have changed since it was
    /// last made: their browser's dress or their gear.
    pub dress_sent: String,
    pub(crate) dress_stale: bool,
    /// The room's clock when the player joined, and how many of their inputs have stepped their fighter since.
    pub joined: u64,
    pub stepped: u64,
    /// Whether the room plays the player's inputs: held, they are taken in their order and played as standing still,
    /// as a run holds one it does not yet keep.
    pub held: bool,
    /// The number of the last input received, and of the last that stepped the fighter.
    pub received: u32,
    pub acknowledged: u32,
    pub waiting: VecDeque<Input>,
    /// The tick of the room the player's last taken input was seeing, and its fighter after each recent input with
    /// the tick that input was seeing.
    pub seen: u64,
    pub history: VecDeque<(u64, Fighter)>,
    /// The latest tick their screen said it showed, as it said it: the snapshot their browser surely holds.
    pub shown_tick: u64,
    /// The room tick until which the foes leave the player be, having just stood again.
    pub graced: u64,
    /// A dress waiting its turn, and the room tick the dress last changed (none before the first).
    pub dress_next: Option<String>,
    pub dressed_at: Option<u64>,
    /// Their gear, whether it changed since it was last sent to them, and whether it is their own as their account
    /// keeps it (given back, `restore_character`) rather than the one they joined with.
    pub character: Character,
    pub gear_changed: bool,
    pub claimed: bool,
    /// Where they stood as their gear was last sent: at the Mage, in a social space, and at the counter that signs their
    /// officers on. All ride the gear
    /// message and change as they walk, so a change sends it again.
    pub placed_sent: (bool, bool, bool),
    /// The tick their gear was last sent, and their last ask taken: a room sends one player's gear, and takes their
    /// asks, only so often.
    pub gear_sent: Option<u64>,
    pub asked_at: Option<u64>,
    /// Asks waiting their turn, oldest first; and whether their gear changes how they fight, so goes at once.
    pub asks: VecDeque<crate::asks::Asked>,
    pub gear_urgent: bool,
    /// The answer to their last ask (0 done, else why not), the item a Vestige last opened to, and how many asks
    /// have been answered.
    pub answer: u8,
    pub identified: u32,
    pub answered: u32,
    /// The room's resource nodes they have gathered from, spent for them: this turn on a patrol, this landing on a sea
    /// island.
    pub spent: Vec<u8>,
    /// The node they are gathering, E held, if they are, and whether their last input rode a horse.
    pub gathering: Option<crate::asks::Gathering>,
    pub mounted: bool,
    /// The account that keeps their character, if one does: what they gathered this turn follows it across a rejoin.
    pub owner: Option<String>,
    /// What their worn gear trims of the fight's numbers with the loadout drawn; and with each drawn, Melee then
    /// Ranged, set whenever their gear may change.
    pub trim: combat::Trim,
    pub(crate) trims: [combat::Trim; 2],
    /// Their Anima's charge, their Tenets' recharge and a cast on its way, kept while they are in the room.
    pub casting: crate::arts::Casting,
    /// What their perks count from blow to blow, kept while they are in the room.
    pub(crate) counts: crate::perks::PerkCounts,
    /// What their Atheric's perks count, beside them.
    pub(crate) atheric: crate::atheric::AthericCounts,
    /// The foes their own blows landed on in the last ten seconds, with the tick of each one's last: each shares its
    /// kill's healing charge with them (`recharge.rs`).
    pub(crate) struck: std::collections::BTreeMap<FighterId, u64>,
    /// The tick a foe's blow last landed on them: they return to their ship only ten seconds past it (`Asked::ToShip`).
    pub(crate) struck_at: Option<u64>,
    /// Where their swings' chain stands (`chain.rs`).
    pub(crate) chain: crate::chain::Chain,
}

impl Player {
    /// A player joining at `joined`, on the Test Ground if `test_ground`, where every spell is tried as written.
    #[must_use]
    pub fn new(fighter: Fighter, joined: u64, test_ground: bool) -> Self {
        let mut character = Character::starting();
        if test_ground {
            character.arts = gear::arts::WornArts::mastered();
        }
        Player {
            fighter: Fighter { ammo: Some(u32::from(character.shots())), ..fighter },
            standing: Standing::Inside,
            stood: fighter.body.z,
            shown: Shown::default(),
            dress: String::new(),
            dress_changed: false,
            dress_sent: String::new(),
            dress_stale: false,
            joined,
            stepped: 0,
            held: false,
            received: 0,
            acknowledged: 0,
            waiting: VecDeque::new(),
            seen: joined,
            history: VecDeque::new(),
            shown_tick: 0,
            graced: 0,
            dress_next: None,
            dressed_at: None,
            character,
            gear_changed: true,
            claimed: false,
            placed_sent: (false, false, false),
            gear_sent: None,
            asked_at: None,
            asks: VecDeque::new(),
            gear_urgent: false,
            answer: 0,
            identified: 0,
            answered: 0,
            spent: Vec::new(),
            gathering: None,
            mounted: false,
            owner: None,
            trim: combat::Trim::PLAIN,
            trims: [combat::Trim::PLAIN; 2],
            casting: crate::arts::Casting::default(),
            counts: crate::perks::PerkCounts::default(),
            atheric: crate::atheric::AthericCounts::default(),
            struck: std::collections::BTreeMap::new(),
            struck_at: None,
            chain: crate::chain::Chain::default(),
        }
    }

    /// A fighter of theirs as their gear arms it: trimmed by their armour and the loadout it has drawn, its Ranged
    /// weapon holding the shots their gear keeps. A loadout drawn that changes the trim sends it to them at once, so
    /// their browser predicts them by it.
    #[must_use]
    pub fn armed(&mut self, fighter: Fighter) -> Fighter {
        let trim = self.trims[usize::from(crate::power::drawn(&self.character, &fighter) == gear::Slot::Ranged)];
        if trim != self.trim {
            self.trim = trim;
            self.gear_changed = true;
            self.gear_urgent = true;
        }
        Fighter { trim, ammo: Some(u32::from(self.character.shots())), ..fighter }
    }

    /// Keeps the fighter after an input that was seeing `seen`.
    pub fn remember(&mut self, seen: u64) {
        self.seen = seen;
        self.history.push_back((seen, self.fighter));
        while self.history.len() > HISTORY {
            self.history.pop_front();
        }
    }

    /// The fighter as the player stood when their screen first showed the room's tick `tick`, if their inputs have
    /// reached it.
    #[must_use]
    pub fn as_it_saw(&self, tick: u64) -> Option<&Fighter> {
        self.history.iter().find(|(seen, _)| *seen >= tick).map(|(_, fighter)| fighter)
    }

    /// The dress shown to others changes at once the first time, then once DRESS_EVERY ticks have passed since the
    /// last change: to a dress waiting its turn, or to the cosmetics and faction pieces worn (`dress_again`). Their
    /// gear sent marks the dress to be made again; otherwise it is left as it is.
    pub(crate) fn dress_in_turn(&mut self, clock: u64) {
        if self.dress_sent.is_empty() && self.dress_next.is_none()
            || !self.dress_stale && self.dress_next.is_none()
            || self.dressed_at.is_some_and(|at| clock < at + DRESS_EVERY)
        {
            return;
        }
        if let Some(dress) = self.dress_next.take() {
            self.dress_sent = dress;
        }
        if self.dress_again() {
            self.dressed_at = Some(clock);
        }
    }

    /// Makes the dress others are shown again (`gear::cosmetics::dressed`) from the browser's dress and the gear worn,
    /// so no page shows a piece its player does not wear or keep; whether it changed.
    pub(crate) fn dress_again(&mut self) -> bool {
        self.dress_stale = false;
        let Some(dress) = gear::cosmetics::dressed(&self.dress_sent, &self.character) else { return false };
        let changed = dress != self.dress;
        if changed {
            self.dress = dress;
            self.dress_changed = true;
        }
        changed
    }

    /// Whether the player stands alive: neither fallen in a fight nor killed by the section (a fall, the sea).
    pub(crate) fn living(&self) -> bool {
        !self.fighter.dead() && !matches!(self.standing, Standing::Dead { .. })
    }
}

impl Room {
    /// A player dead long enough stands again at the spawn nearest where they fell, whole, if an Abyss run has a revive
    /// left for them (`abyss.rs`); a foe dead long enough is gone. An Abyss run whose players are all down starts over
    /// instead.
    pub(crate) fn raise_the_dead(&mut self) {
        if self.wiped() {
            self.start_over();
            return;
        }
        let mut raised = Vec::new();
        let fallen: Vec<(PlayerId, Fighter)> = self
            .players
            .iter()
            .filter(|(_, found)| matches!(found.fighter.action, Action::Dead { elapsed } if elapsed >= RESPAWN))
            // One the section killed too stands again only by its own respawn, which ends that death as well.
            .filter(|(_, found)| !matches!(found.standing, Standing::Dead { .. }))
            .map(|(id, found)| (*id, found.fighter))
            .collect();
        for (id, fighter) in fallen {
            if !self.revive() {
                continue;
            }
            let body = self.stand_again(fighter.body.x, fighter.body.y);
            let graced = self.clock + GRACE;
            if let Some(found) = self.players.get_mut(&id) {
                found.fighter = found.armed(player(body, fighter.arms));
                // A fall is measured from where the feet stand again, not from where the player died.
                found.stood = body.z;
                found.graced = graced;
                raised.push(id);
            }
        }
        for id in raised {
            self.tell(EventKind::Respawned, None, id, id, 0.0);
        }
        let gone: Vec<FighterId> = self
            .foes
            .iter()
            .filter(|(_, foe)| matches!(foe.fighter.action, Action::Dead { elapsed } if elapsed >= FOE_GONE))
            .map(|(id, _)| *id)
            .collect();
        for id in gone {
            self.foes.remove(&id);
            self.quests.spoilless.remove(&id);
            self.board.forget(id);
            self.names.remove(&id);
        }
    }

    /// Whether this is the Test Ground: a course's room on open ground with no section. A wreck laid over the sea has
    /// no section either, but it is a story level, played at the player's own levels.
    pub(crate) fn is_test_ground(&self) -> bool {
        self.section.is_none() && self.floor == crate::Floor::Flat
    }

    /// Every player's dress, for one who joins; players who have sent none are left out.
    pub fn dresses(&self) -> impl Iterator<Item = (PlayerId, &str)> + '_ {
        self.players
            .iter()
            .filter(|(_, found)| !found.dress.is_empty())
            .map(|(&player, found)| (player, found.dress.as_str()))
    }

    /// Every player's dress is sent to everyone once more with the next changes, for one who joined with no welcome
    /// to carry them (a boarder come over a ship's side).
    pub fn announce_dresses(&mut self) {
        for found in self.players.values_mut().filter(|found| !found.dress.is_empty()) {
            found.dress_changed = true;
        }
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

    /// Whether a player's gear changed since it was last sent and is due to be sent to them alone: at most every
    /// `GEAR_EVERY_TICKS`, so a page that asks without end cannot flood its socket or slow the room; at once when it
    /// changes how they fight.
    pub fn take_gear_change(&mut self, player: PlayerId) -> bool {
        let clock = self.clock;
        // Coming within reach of the muster sends its offers.
        let placed = (self.at_mage(player), self.in_social_space(player), self.recruiting_at(player).is_some());
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.gear_changed |= placed != found.placed_sent;
        let waiting = found.gear_sent.is_some_and(|sent| clock < sent + GEAR_EVERY_TICKS);
        if !found.gear_changed || waiting && !found.gear_urgent {
            return false;
        }
        found.placed_sent = placed;
        found.gear_changed = false;
        found.dress_stale = true;
        found.gear_urgent = false;
        found.gear_sent = Some(clock);
        true
    }

    /// Why the room's gate shuts to a character (`gear::gate`), or none when it may enter.
    #[must_use]
    pub fn shut(&self, character: &gear::Character) -> Option<gear::gate::Shut> {
        self.place.and_then(|place| gear::gate::shut(character, place, self.difficulty))
    }

    /// Why the room's gate shuts to a player's kept character as it would be given them: with the story they already
    /// hold in the room carried forward, since the page may tell the room before the accounts answer.
    #[must_use]
    pub fn shut_to(&self, player: PlayerId, character: &gear::Character) -> Option<gear::gate::Shut> {
        self.shut(&self.carried_forward(player, character.clone()))
    }

    /// A kept character with the story and lore its player already holds in the room carried forward, never put back.
    fn carried_forward(&self, player: PlayerId, mut character: gear::Character) -> gear::Character {
        if let Some(found) = self.players.get(&player) {
            character.story = character.story.merged(&found.character.story);
            character.keep_all_lore(&found.character);
        }
        character
    }

    /// No character is kept for a player (they play unkept, or their account gave none back): the one the room holds is
    /// their own from now on, so their page shows its word.
    pub fn none_kept(&mut self, player: PlayerId) {
        if let Some(found) = self.players.get_mut(&player) {
            (found.gear_changed, found.claimed) = (true, true);
        }
    }

    /// Gives a player the character kept for them, trimming their fight by it and sending them their gear, its quest
    /// log told they arrived here; false if they are not in the room, the text is not a character, or the room's gate
    /// shuts to it (`shut_to`).
    pub fn restore_character(&mut self, player: PlayerId, text: &str) -> bool {
        let Some(character) = gear::Character::from_json(text) else { return false };
        let character = self.carried_forward(player, character);
        if self.shut(&character).is_some() {
            return false;
        }
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.character = character;
        (found.gear_changed, found.claimed) = (true, true);
        self.arrived(player);
        self.retrim(player);
        if let Some(found) = self.players.get_mut(&player) {
            found.fighter = found.armed(found.fighter);
        }
        self.given_back(player);
        true
    }

    /// The day whose wares the room's vendors show: the clock's, which turns at 09:00 UTC (`gear::clock`).
    #[must_use]
    pub fn day(&self) -> u64 {
        gear::clock::day_of(self.minute)
    }

    /// Sets the minute, counted from the epoch. When its day turns, or Shape comes, goes or moves, every player is
    /// sent their gear again with what is sold now, so none buys what they were not shown.
    pub fn set_minute(&mut self, minute: u64) {
        let before = (self.day(), self.shape_at());
        self.minute = minute;
        if (self.day(), self.shape_at()) != before {
            for found in self.players.values_mut() {
                found.gear_changed = true;
            }
        }
    }

    /// Holds a player's inputs, or lets them play: held, each is taken in its order and played as standing still;
    /// false for a player not in the room.
    pub fn hold(&mut self, player: PlayerId, held: bool) -> bool {
        self.players.get_mut(&player).map(|found| found.held = held).is_some()
    }

    /// Notes the account that keeps a player's character: the nodes that account gathered in this room (in a patrol,
    /// this turn; on a sea island, this landing) are spent for them again, however often they rejoin, and they are told
    /// they landed if the sea said that account did; the Arts' charge the room kept for it is theirs again; and in a
    /// run that counts revives, the body it left with. A sea island's wrecks are kept on the character itself. False,
    /// noting nothing, for an account another player in the room already has: one account is one player in a room.
    pub fn own(&mut self, player: PlayerId, owner: &str) -> bool {
        if self.players.iter().any(|(id, found)| *id != player && found.owner.as_deref() == Some(owner)) {
            return false;
        }
        let gathered = self.gathered.get(owner).cloned().unwrap_or_default();
        let Some(found) = self.players.get_mut(&player) else { return false };
        found.owner = Some(owner.to_owned());
        for node in gathered {
            if !found.spent.contains(&node) {
                found.spent.push(node);
            }
        }
        found.gear_changed = true;
        self.give_casting_back(player, owner);
        self.give_body_back(player, owner);
        self.tell_landed(player);
        self.own_part(player);
        true
    }

    /// Takes a player out of the room, keeping their account's Arts, and in a run their body, for its return.
    pub(crate) fn part(&mut self, player: PlayerId) {
        if let Some(gone) = self.players.remove(&player) {
            self.keep_casting(&gone);
            self.keep_body(&gone);
        }
    }

    /// A player as the room keeps them.
    #[must_use]
    pub fn player(&self, player: PlayerId) -> Option<&Player> {
        self.players.get(&player)
    }

    /// A player a view's lag behind with no input to take is stepped a tick standing still, looking where they aim;
    /// a body the section killed falls on as `lying_still` steps it, and the tick counts, so time spent dead is not
    /// banked to catch up on.
    pub(crate) fn stand_stalled(&mut self, id: PlayerId) {
        let clock = self.clock;
        let Some(found) = self.players.get_mut(&id) else { return };
        if found.stepped + VIEW_LAG >= clock - found.joined {
            return;
        }
        let dead = matches!(found.standing, Standing::Dead { .. });
        let standing = if dead {
            lying_still(&found.fighter)
        } else {
            let controls = movement::Controls { yaw: found.fighter.aim, ..movement::Controls::default() };
            combat::Intent { controls, combat: combat::CombatInput::default() }
        };
        let view = self.fighters();
        let Some(found) = self.players.get_mut(&id) else { return };
        found.stepped += 1;
        let fighter = if dead { found.armed(found.fighter) } else { found.fighter };
        let (next, happening) = combat::player_tick(id, &fighter, &standing, &view, &self.blocks, &self.floor);
        found.fighter = next;
        // A dead body only falls: nothing it was doing as it died lands now.
        if !dead {
            self.happened(id, &next, happening, &view);
        }
    }

    /// The player's next input the clock allows, and the room tick it was seeing (never ahead of the clock, never
    /// behind the last nor more than SEEN_STEP past it, never further back than a view may lag).
    pub(crate) fn next_input(&mut self, id: PlayerId) -> Option<(Input, u64)> {
        let clock = self.clock;
        let found = self.players.get_mut(&id)?;
        if found.stepped >= clock - found.joined + SLACK_TICKS {
            return None;
        }
        let input = found.waiting.pop_front()?;
        found.stepped += 1;
        found.acknowledged = found.acknowledged.wrapping_add(1);
        let seen =
            input.seen.min(clock).min(found.seen + SEEN_STEP).max(found.seen).max(clock.saturating_sub(VIEW_LAG));
        Some((input, seen))
    }
}

/// What a body the section killed is stepped by each tick: no push and its facing kept, letting go of any wall or lip
/// it held, so it falls under its own weight and lies where it lands, as a fight's dead do. The page steps its own
/// dead body by the same (`combat/fighting.ts`).
#[must_use]
pub(crate) fn lying_still(fighter: &combat::Fighter) -> combat::Intent {
    let holding = matches!(fighter.body.mode, movement::Mode::Hang | movement::Mode::Climb);
    let controls = movement::Controls { yaw: fighter.body.facing, crouch: holding, ..movement::Controls::default() };
    combat::Intent { controls, combat: combat::CombatInput::default() }
}
