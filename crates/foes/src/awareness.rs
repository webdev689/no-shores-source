//! How aware a foe is of the fighters about it, and what it does short of a fight. Its awareness runs from nothing to
//! full: each tick the strongest thing that stirs it, a fighter it sees or a noise it hears, adds to it and marks the
//! place it believes the stir came from; with nothing stirring it bleeds away, but not while it fights or hunts a
//! target. Stirred, a foe is suspicious: it turns to the place and walks a few metres toward it. Full, it is alert and
//! shouts once, waking its allies near it. Alert with no one in sight, it searches: it walks to the place it last knew,
//! or as near as an ally already there leaves it, looks about, then lets go, its awareness bleeding back to nothing.

use crate::Seen;
use crate::brain::Brain;
use crate::dice::Purpose;
use crate::senses::Here;
use crate::steer::{Ask, taken, way_to};
use crate::tuning::{
    ALERT_BLEED, ALERT_OFF, ALERT_ON, ALERT_PROP, SEARCH_REACH, SEARCH_SWEEP, SEARCH_T, SUSPICIOUS_WALK,
};
use combat::sight::{apart, bearing};

/// How alert a foe is, as the room sends it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Alertness {
    Idle = 0,
    Suspicious = 1,
    Alert = 2,
    Searching = 3,
}

/// A look about at the place searched: the tick it began, the bearing it faced then, and the side it looks to first
/// (1 clockwise, -1 not).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Look {
    pub since: u64,
    pub facing: f64,
    pub side: f64,
}

/// What a foe keeps of its awareness: the level, whether it is alert (from full until the level bleeds back to
/// nothing), where it stood when first stirred, its look about once at the place it searches, and the noises and
/// shouts it was told of since its last thought.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Awareness {
    pub level: f64,
    pub alert: bool,
    pub stirred_from: Option<[f64; 2]>,
    pub look: Option<Look>,
    pub heard: Vec<Seen>,
}

impl Brain {
    /// Its awareness, from nothing to full.
    #[must_use]
    pub fn awareness(&self) -> f64 {
        self.awareness.level
    }

    /// How alert it is: searching when alert with no one to fight.
    #[must_use]
    pub fn alertness(&self) -> Alertness {
        let awareness = &self.awareness;
        match (awareness.alert, self.target) {
            (_, Some(_)) => Alertness::Alert,
            (true, None) => Alertness::Searching,
            (false, _) if awareness.level > ALERT_OFF => Alertness::Suspicious,
            (false, _) => Alertness::Idle,
        }
    }
}

/// The place an ally's shout passes, if one within ALERT_PROP shouted while this foe was not yet alert.
#[must_use]
pub fn woken(brain: &Brain, here: &Here<'_, '_>, heard: &[Seen]) -> Option<[f64; 3]> {
    if brain.awareness.alert {
        return None;
    }
    heard.iter().find_map(|seen| match seen {
        Seen::Shouted { from, at } if apart(here.at(), [from[0], from[1]]) <= ALERT_PROP => Some(*at),
        _ => None,
    })
}

/// The stronger of two stirs (an amount, and where), the first on a tie, so the order the room tells things in
/// settles a tie the same everywhere; nothing that adds nothing.
#[must_use]
pub fn strongest(best: Option<(f64, [f64; 3])>, next: (f64, [f64; 3])) -> Option<(f64, [f64; 3])> {
    if next.0 > best.map_or(0.0, |best| best.0) { Some(next) } else { best }
}

/// Raises its awareness by the strongest stir this tick, a sight (`glimpse`: what it adds, and where) or a noise, and
/// believes the stir's place; with nothing stirring, bleeds it a tick's worth.
pub fn stir(brain: &mut Brain, here: &Here<'_, '_>, glimpse: Option<(f64, [f64; 3])>, heard: &[Seen]) {
    let noises = heard.iter().filter_map(|seen| match seen {
        Seen::Heard(noise) => Some((noise.heard_at(here.feet(), here.world.blocks), noise.at)),
        _ => None,
    });
    let awareness = &mut brain.awareness;
    let Some((amount, place)) = glimpse.into_iter().chain(noises).fold(None, strongest) else {
        awareness.level = (awareness.level - ALERT_BLEED / 60.0).max(0.0);
        return;
    };
    awareness.level = (awareness.level + amount).min(1.0);
    if brain.last_seen != Some(place) {
        brain.last_seen = Some(place);
        awareness.look = None;
    }
}

/// Alert at full, shouting once to wake its allies (unless an ally's shout woke it, toward `woken`); back to idle
/// once the level has bled to nothing.
pub fn latch(brain: &mut Brain, here: &Here<'_, '_>, woken: Option<[f64; 3]>) {
    let awareness = &mut brain.awareness;
    if let Some(at) = woken {
        awareness.level = 1.0;
        brain.last_seen = Some(at);
        awareness.look = None;
    } else if !awareness.alert && awareness.level >= ALERT_ON {
        brain.calls.shout = Some(brain.last_seen.unwrap_or_else(|| here.feet()));
    }
    if awareness.level >= ALERT_ON {
        awareness.alert = true;
        awareness.stirred_from = None;
    }
    if awareness.level <= ALERT_OFF {
        awareness.alert = false;
        awareness.stirred_from = None;
        awareness.look = None;
    }
}

/// What a foe with no one to fight asks: idle, nothing; suspicious, to turn to the place that stirred it and walk a few
/// metres toward it; searching, to walk to the place it last knew, look about there, then let go.
pub fn look(brain: &mut Brain, here: &Here<'_, '_>) -> Ask {
    let tick = here.tick();
    let awareness = &mut brain.awareness;
    if !awareness.alert && awareness.level <= ALERT_OFF {
        return Ask::default();
    }
    // Searching with no place known, it looks about where it stands.
    let place = brain.last_seen.unwrap_or_else(|| here.feet());
    let (at, spot) = (here.at(), [place[0], place[1]]);
    let far = apart(at, spot) > SEARCH_REACH;
    if !awareness.alert {
        if brain.last_seen.is_none() || !far {
            return Ask::default();
        }
        let from = *awareness.stirred_from.get_or_insert(at);
        let way = (apart(from, at) < SUSPICIOUS_WALK).then(|| way_to(here, place)).flatten();
        return way.map_or_else(|| Ask::facing(bearing(at, spot)), |way| Ask::walking(way, 1.0, false));
    }
    let look = match awareness.look {
        Some(look) => look,
        None => {
            if far
                && !taken(here, place)
                && let Some(way) = way_to(here, place)
            {
                return Ask::walking(way, 1.0, false);
            }
            let side = if here.dice.roll(Purpose::Search) < 0.5 { -1.0 } else { 1.0 };
            *awareness.look.insert(Look { since: tick, facing: brain.heading, side })
        }
    };
    let elapsed = (tick - look.since) as f64 / 60.0;
    if elapsed >= SEARCH_T {
        // Nothing found: it lets go, and what awareness it has left bleeds away.
        awareness.alert = false;
        awareness.look = None;
        return Ask::default();
    }
    let half = SEARCH_T / 2.0;
    Ask::facing(look.facing + look.side * SEARCH_SWEEP * (half - (elapsed - half).abs()))
}
