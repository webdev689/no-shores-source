//! A ship's hurts, as DFO's: its hull, canvas and men, the harm one ball does by where it strikes, fire, striking,
//! sinking (a captain's and a player's alike), its way falling with its canvas, and its hands mending it in
//! quiet waters.

use crate::arms::Build;
use crate::guns::Gun;

/// A captain strikes at this share of its hull left, a Major's and a Minor's (its rank's otherwise).
pub const STRUCK_AT: f64 = 0.25;
/// Seconds from going down to gone.
pub const SINK_SECONDS: f64 = 20.0;
/// Going down it lists and trims this far (degrees), and its highest spar ends this far under the water (metres).
pub const SINK_LIST_DEG: f64 = 32.0;
pub const SINK_PITCH_DEG: f64 = 20.0;
pub const SINK_CLEAR_M: f64 = 2.0;
/// A hull hit within this height over the water holes it, and does this much more harm.
pub const WATERLINE_BAND_M: f64 = 1.1;
pub const HOLED_BONUS: f64 = 0.4;
/// A fire: hull a second, how long, how many burn at once, canvas a second, and the seconds of burning that are a
/// man's worth of harm.
pub const FIRE_HP: f64 = 1.4;
pub const FIRE_SECONDS: f64 = 15.0;
pub const FIRE_STACK: usize = 3;
pub const FIRE_SAIL: f64 = 0.5;
pub const FIRE_CREW_S: f64 = 10.0;
/// A braced crew takes this share of a ball's harm to hull and canvas.
pub const BRACE_TAKEN: f64 = 0.5;
/// Bare poles leave this share of its way.
pub const BARE_POLES: f64 = 0.35;
/// A captain's men stand this many blows a man; a player's crew twice as many.
pub const SHIP_TOUGHNESS: f64 = 1.6;
pub const PLAYER_CREW_TOUGHNESS: f64 = 3.2;
/// Mending at sea: quiet this long first (seconds), this share of the whole a second, halved as a player mends
/// single-handed, to this share of the whole.
pub const FIELD_QUIET_S: f64 = 15.0;
pub const FIELD_MEND_PER_S: f64 = 0.004;
pub const FIELD_MEND_ALONE: f64 = 0.5;
pub const FIELD_MEND_CAP: f64 = 0.5;
/// Under this share of its hull it lists, to this many degrees at none, taken on over these seconds.
pub const DAMAGE_LIST_FROM: f64 = 0.4;
pub const DAMAGE_LIST_MAX_DEG: f64 = 8.0;
pub const DAMAGE_LIST_EASE_S: f64 = 2.5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Afloat,
    Struck,
    Sinking,
    Sunk,
}

/// Where a ball struck: its hull above the waterline band, within it, or its canvas.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Zone {
    Hull,
    Holed,
    Rig,
}

/// The zone of a hull hit this high over the water under it.
#[must_use]
pub fn zone_at(over_water: f64) -> Zone {
    if over_water <= WATERLINE_BAND_M { Zone::Holed } else { Zone::Hull }
}

/// A blow: hull and canvas points and men lost, and whether it sets it alight.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Hurt {
    pub hull: f64,
    pub sail: f64,
    pub crew: f64,
    pub fire: bool,
}

/// A browser's Math.round, for positive numbers: half up.
pub(crate) fn rounded(value: f64) -> f64 {
    (value + 0.5).floor()
}

/// Men a ball takes: its men over the ship's toughness, the roll deciding the part man.
pub(crate) fn men(count: f64, roll: f64, tough: f64) -> f64 {
    if count > 0.0 { (count / tough + roll.clamp(0.0, 0.999_999)).floor() } else { 0.0 }
}

/// How much harder every blow one ship strikes another lands than DFO's numbers, its balls and its ram alike: half
/// again, at the owner's word.
pub const FIGHT_HARM: f64 = 1.5;

/// One ball's harm, as the gun is loaded (grape's reach already in its men), by zone; `roll` is the ball's own draw
/// (each ball does 85 to 115%), `tough` the struck crew's toughness. Its fire is rolled by whoever applies it.
#[must_use]
pub fn shot_harm(gun: &Gun, zone: Zone, braced: bool, roll: f64, tough: f64) -> Hurt {
    let taken = if braced { BRACE_TAKEN } else { 1.0 } * FIGHT_HARM;
    let spread = 0.85 + 0.3 * roll.clamp(0.0, 1.0);
    if zone == Zone::Rig {
        let sail = rounded((gun.sail * 2.0).max(gun.hull * 0.5) * taken * spread);
        return Hurt {
            hull: 0.0,
            sail,
            crew: men(if gun.crew > 0.0 { FIGHT_HARM } else { 0.0 }, roll, tough),
            fire: false,
        };
    }
    let holed = if zone == Zone::Holed { 1.0 + HOLED_BONUS } else { 1.0 };
    Hurt {
        hull: rounded(gun.hull * holed * taken * spread),
        sail: rounded(gun.sail * 0.25 * taken * spread),
        crew: men(gun.crew * FIGHT_HARM, roll, tough),
        fire: false,
    }
}

/// A fire aboard: hull a second, and seconds left.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Fire {
    bite: f64,
    left: f64,
}

/// What a ship has left and its state. `last_hit_at` is when a ball or a fire last hurt it (seconds of the fight);
/// `list_deg` the list its hurts give it.
#[derive(Debug, Clone, PartialEq)]
pub struct Damage {
    pub max_hull: f64,
    pub hull: f64,
    pub max_sail: f64,
    pub sail: f64,
    pub max_crew: f64,
    pub crew: f64,
    fires: Vec<Fire>,
    crew_burn: f64,
    wound: f64,
    pub state: State,
    pub sink_t: f64,
    pub last_hit_at: f64,
    pub list_deg: f64,
    /// The share of its hull it strikes at.
    pub struck_at: f64,
    /// The least hull a ball or a fire leaves it: none, but one for a ship the fight must never sink.
    pub least_hull: f64,
    player: bool,
    /// The parts of a hull point, a canvas point and a man that balls taking a share of their blow left it owing.
    owed: [f64; 3],
}

impl Damage {
    #[must_use]
    pub fn new(build: &Build, player: bool) -> Self {
        Self {
            max_hull: build.hull.max(1.0),
            hull: build.hull.max(1.0),
            max_sail: build.sail.max(0.0),
            sail: build.sail.max(0.0),
            max_crew: build.crew.max(0.0),
            crew: build.crew.max(0.0),
            fires: Vec::new(),
            crew_burn: 0.0,
            wound: 0.0,
            state: State::Afloat,
            sink_t: 0.0,
            last_hit_at: f64::NEG_INFINITY,
            list_deg: 0.0,
            struck_at: STRUCK_AT,
            least_hull: 0.0,
            player,
            owed: [0.0; 3],
        }
    }

    #[must_use]
    pub fn hull_share(&self) -> f64 {
        self.hull / self.max_hull
    }

    #[must_use]
    pub fn crew_share(&self) -> f64 {
        if self.max_crew > 0.0 { self.crew / self.max_crew } else { 1.0 }
    }

    /// The share of its best way its canvas leaves it.
    #[must_use]
    pub fn way_share(&self) -> f64 {
        way_share_of(self.sail, self.max_sail)
    }

    /// Whether it still fights: afloat.
    #[must_use]
    pub fn fighting(&self) -> bool {
        self.state == State::Afloat
    }

    /// How many fires burn aboard.
    #[must_use]
    pub fn fires(&self) -> usize {
        self.fires.len()
    }

    /// Every number it holds, in a fixed order.
    #[must_use]
    pub fn numbers(&self) -> Vec<f64> {
        let state = match self.state {
            State::Afloat => 0.0,
            State::Struck => 1.0,
            State::Sinking => 2.0,
            State::Sunk => 3.0,
        };
        let mut numbers =
            vec![self.hull, self.sail, self.crew, self.crew_burn, self.wound, state, self.sink_t, self.last_hit_at];
        numbers.push(self.list_deg);
        numbers.extend(self.owed);
        numbers.extend(self.fires.iter().flat_map(|fire| [fire.bite, fire.left]));
        numbers
    }

    /// A ball's blow as the ship takes `share` of it: its whole points and men now, the parts carried until they make
    /// one, so a side of many guns takes from it what the Sloop's three would, however each ball's harm rounds.
    #[must_use]
    pub fn shared(&mut self, hurt: Hurt, share: f64) -> Hurt {
        let mut whole = [hurt.hull, hurt.sail, hurt.crew];
        for (taken, owed) in whole.iter_mut().zip(&mut self.owed) {
            let due = *taken * share + *owed;
            *taken = due.floor();
            *owed = due - *taken;
        }
        let [hull, sail, crew] = whole;
        Hurt { hull, sail, crew, fire: hurt.fire }
    }

    /// A captain's ship with no one left aboard; a player's always has the player.
    fn unmanned(&self) -> bool {
        !self.player && self.max_crew > 0.0 && self.crew <= 0.0
    }

    /// A fire set, three at most: past that it takes the place of the one with the least harm left, if it has more.
    fn ignite(&mut self) {
        let fire = Fire { bite: FIRE_HP, left: FIRE_SECONDS };
        if self.fires.len() < FIRE_STACK {
            self.fires.push(fire);
            return;
        }
        let harm = |fire: &Fire| fire.bite * fire.left;
        let least = (1..self.fires.len())
            .fold(0, |low, at| if harm(&self.fires[at]) < harm(&self.fires[low]) { at } else { low });
        if harm(&self.fires[least]) < harm(&fire) {
            self.fires[least] = fire;
        }
    }

    fn douse(&mut self) {
        self.fires.clear();
        self.crew_burn = 0.0;
    }

    /// A blow at `now`: its hull not taken under `floor` (the rest of a volley that made it strike). Answers the
    /// state it brought, if it changed.
    pub fn apply(&mut self, hurt: Hurt, now: f64, floor: f64) -> Option<State> {
        if self.state == State::Sunk {
            return None;
        }
        self.last_hit_at = now;
        self.hull = self.hull.min(floor.max(self.least_hull)).max(self.hull - hurt.hull.trunc().max(0.0));
        self.sail = (self.sail - hurt.sail.trunc().max(0.0)).max(0.0);
        self.crew = (self.crew - hurt.crew.trunc().max(0.0)).max(0.0);
        if hurt.fire && !(floor > 0.0 && self.state == State::Struck) {
            self.ignite();
        }
        self.settle()
    }

    /// It is scuttled: it goes down from where it lies, its fires burning on.
    pub fn scuttle(&mut self) {
        if matches!(self.state, State::Afloat | State::Struck) {
            self.state = State::Sinking;
            self.sink_t = 0.0;
        }
    }

    /// The state its numbers call for, if it changed.
    fn settle(&mut self) -> Option<State> {
        let was = self.state;
        if matches!(self.state, State::Afloat | State::Struck) {
            if self.hull <= 0.0 {
                // Its fires burn on as it goes down.
                self.state = State::Sinking;
                self.sink_t = 0.0;
            } else if self.player {
                // A player's ship never strikes: it fights on until it goes down.
            } else if self.state == State::Afloat && self.hull <= self.max_hull * self.struck_at {
                self.state = State::Struck;
                self.douse();
            } else if self.state == State::Afloat && self.unmanned() {
                // Nobody is left to fight its fires either.
                self.state = State::Struck;
            }
        }
        (self.state != was).then_some(self.state)
    }

    /// One step at `now`: its list follows its hurts, each fire burns its timbers, canvas and men, and a sinking ship
    /// goes down. Answers the state it brought, if it changed.
    pub fn step(&mut self, seconds: f64, now: f64) -> Option<State> {
        let seconds = seconds.max(0.0);
        let want = DAMAGE_LIST_MAX_DEG * ((DAMAGE_LIST_FROM - self.hull_share()) / DAMAGE_LIST_FROM).clamp(0.0, 1.0);
        self.list_deg += (want - self.list_deg) * (1.0 - libm::exp(-seconds / DAMAGE_LIST_EASE_S));
        if !self.fires.is_empty() && !matches!(self.state, State::Sinking | State::Sunk) {
            self.last_hit_at = now;
            for fire in &mut self.fires {
                let burn = fire.left.min(seconds);
                fire.left -= burn;
                self.hull = (self.hull - fire.bite * burn).max(self.least_hull.min(self.hull));
                self.sail = (self.sail - FIRE_SAIL * burn).max(0.0);
                self.crew_burn += burn;
            }
            self.fires.retain(|fire| fire.left > 1e-9);
            let tough = if self.player { PLAYER_CREW_TOUGHNESS } else { SHIP_TOUGHNESS };
            while self.crew_burn >= FIRE_CREW_S {
                self.crew_burn -= FIRE_CREW_S;
                self.wound += 1.0 / tough;
            }
            while self.wound >= 1.0 - 1e-9 {
                self.wound = (self.wound - 1.0).max(0.0);
                self.crew = (self.crew - 1.0).max(0.0);
            }
            if self.fires.is_empty() {
                self.crew_burn = 0.0;
            }
            if let Some(change) = self.settle() {
                return Some(change);
            }
        }
        if self.state == State::Sinking {
            self.sink_t += seconds;
            if self.sink_t >= SINK_SECONDS {
                self.state = State::Sunk;
                return Some(State::Sunk);
            }
        }
        None
    }

    /// Its hands mend its hull and canvas at `now` if nothing has hurt it for a while and no hostile ship is near: up
    /// to half of each, at a player's single-handed rate. Answers whether they mended anything.
    pub fn mend(&mut self, seconds: f64, now: f64, hostile_near: bool) -> bool {
        if now - self.last_hit_at < FIELD_QUIET_S || hostile_near || matches!(self.state, State::Sinking | State::Sunk)
        {
            return false;
        }
        let rate = FIELD_MEND_PER_S * FIELD_MEND_ALONE;
        let part =
            |have: f64, whole: f64| (whole * FIELD_MEND_CAP - have).min(whole * rate * seconds.max(0.0)).max(0.0);
        let (hull, sail) =
            (part(self.hull, self.max_hull), if self.max_sail > 0.0 { part(self.sail, self.max_sail) } else { 0.0 });
        if hull <= 0.0 && sail <= 0.0 {
            return false;
        }
        self.hull = (self.hull + hull).min(self.max_hull);
        self.sail = (self.sail + sail).min(self.max_sail);
        if self.hull > 0.0 {
            self.douse();
        }
        true
    }
}

/// The share of its best way `sail` of its `max_sail` canvas leaves it: bare poles leave it some.
#[must_use]
pub fn way_share_of(sail: f64, max_sail: f64) -> f64 {
    if max_sail > 0.0 { BARE_POLES + (1.0 - BARE_POLES) * sail / max_sail } else { 1.0 }
}

/// What its hurts and its going down do to its pose: how far it has settled (metres), its trim (radians, bow up) and
/// its list (radians, to starboard). It goes down to the side and end its seed says, listing first by its hurts; it
/// settles slowly, then plunges, until its highest spar is `under` metres down.
#[must_use]
pub fn founder(damage: &Damage, seed: u32, under: f64) -> (f64, f64, f64) {
    let share = match damage.state {
        State::Sinking => (damage.sink_t / SINK_SECONDS).clamp(0.0, 1.0),
        State::Sunk => 1.0,
        _ => 0.0,
    };
    let side = if seed & 1 == 1 { 1.0 } else { -1.0 };
    let end = if seed & 2 == 2 { -1.0 } else { 1.0 };
    let list = side * (SINK_LIST_DEG * share).max(damage.list_deg);
    (under.max(0.0) * share * share, (end * SINK_PITCH_DEG * share).to_radians(), list.to_radians())
}

#[cfg(test)]
#[path = "damage_tests.rs"]
mod tests;
