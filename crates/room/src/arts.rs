//! The Arts in the room: each player's Anima charging over its recharge and 2% more a kill, and their two Tenets
//! recharging over theirs, kept while they are in the room; a cast their input asks for, taken only when it is ready,
//! of the Art worn, with the caster able to act, and released 18 ticks later; the kills and crits that give charge
//! back; and the asks that wear an Art and set its Core. What each spell does is `spells.rs`'s.

use crate::{PlayerId, Room, Standing};
use combat::judge::Blow;
use combat::status::crits;
use combat::{Fighter, Status, Verdict, ticks};
use gear::arts::{ArtAsk, arts};
use gear::{Character, Element, Slot};

/// A share within this of full is full: a share added up tick by tick never quite reaches 1.
const FULL: f64 = 1.0 - 1e-9;

/// A cast as an input asks for it: the spell by its number among the Arts' (its Art's number less one, times three,
/// plus its ability, 0 the Anima and 1 or 2 a Tenet, plus one: 1 Tempest to 9 Vanish), and where it is aimed, if it is.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Cast {
    pub spell: u8,
    pub aim: Option<[f64; 3]>,
}

impl Cast {
    /// The Art it is of, and its ability (0 the Anima, 1 and 2 the Tenets).
    #[must_use]
    pub fn art(self) -> u8 {
        self.spell.saturating_sub(1) / 3 + 1
    }

    #[must_use]
    pub fn ability(self) -> u8 {
        self.spell.saturating_sub(1) % 3
    }
}

/// A player's Arts in the room: how far the Anima has charged and each Tenet recharged (1 is ready), a cast waiting
/// its release with the ticks left to it, and whether a crit out of Vanish may still give back its cooldown (Hunt).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Casting {
    pub anima: f64,
    pub tenets: [f64; 2],
    pub releasing: Option<(Cast, u32)>,
    pub hunting: bool,
}

/// A new room starts the Anima empty and the Tenets ready.
impl Default for Casting {
    fn default() -> Self {
        Casting { anima: 0.0, tenets: [1.0, 1.0], releasing: None, hunting: false }
    }
}

impl Casting {
    /// How far an ability has charged: 0 the Anima, 1 and 2 the Tenets.
    #[must_use]
    pub fn share(&self, ability: u8) -> f64 {
        match ability {
            0 => self.anima,
            other => self.tenets.get(usize::from(other) - 1).copied().unwrap_or(0.0),
        }
    }

    fn spend(&mut self, ability: u8) {
        match ability {
            0 => self.anima = 0.0,
            other => {
                if let Some(share) = self.tenets.get_mut(usize::from(other) - 1) {
                    *share = 0.0;
                }
            }
        }
    }

    /// The Tenets' cooldowns cut by `share` of their whole.
    pub fn cut(&mut self, share: f64) {
        self.tenets.iter_mut().for_each(|tenet| *tenet = filled(*tenet, share));
    }
}

/// A share with `more` added, held to 1.
fn filled(share: f64, more: f64) -> f64 {
    let next = share + more;
    if next >= FULL { 1.0 } else { next }
}

/// One tick's share of a recharge `seconds` long.
fn tick_of(seconds: f64) -> f64 {
    if seconds > 0.0 { movement::TICK_SECONDS / seconds } else { 1.0 }
}

/// The Attack a player's spells strike with, and the slot of the weapon that gives it, whose kills it shares: the
/// Melee loadout's, or the Ranged one's when no Melee is worn.
pub(crate) fn spell_power(character: &Character) -> (u32, Slot) {
    [Slot::Melee, Slot::Ranged]
        .into_iter()
        .find_map(|slot| character.attack(slot).map(|attack| (attack, slot)))
        .unwrap_or((0, Slot::Melee))
}

/// Whether a fighter may act on a cast: neither down, staggered nor Charged.
fn able(fighter: &Fighter) -> bool {
    !fighter.dead() && !fighter.staggered() && !fighter.statuses.has(Status::Charge)
}

impl Room {
    /// A cast a player's input asks for, taken to release once its time comes if it is the worn Art's, charged, no
    /// other is on its way, and the player may act; else let go.
    pub(crate) fn ask_cast(&mut self, player: PlayerId, cast: Option<Cast>) {
        let release = ticks(arts().cast.release_s);
        let Some((cast, found)) = cast.zip(self.players.get_mut(&player)) else { return };
        let worn = found.character.art();
        let standing = !matches!(found.standing, Standing::Dead { .. });
        let known = cast.spell >= 1 && cast.art() == worn.id;
        let casting = &mut found.casting;
        if known
            && standing
            && casting.releasing.is_none()
            && casting.share(cast.ability()) >= 1.0
            && able(&found.fighter)
        {
            casting.releasing = Some((cast, release));
        }
    }

    /// One tick of every player's Arts: each charges, a cast whose time has come is released (cut short, it costs
    /// nothing), the veil Hunt watches ending lets it go, and every spell steps.
    pub(crate) fn step_arts(&mut self) {
        let mut due = Vec::new();
        for (id, found) in &mut self.players {
            let art = found.character.art();
            let casting = &mut found.casting;
            casting.anima = filled(casting.anima, tick_of(art.anima.recharge_s));
            for (share, tenet) in casting.tenets.iter_mut().zip(&art.tenets) {
                *share = filled(*share, tick_of(tenet.recharge_s));
            }
            casting.hunting &= found.fighter.statuses.has(Status::Veiled);
            casting.releasing = match casting.releasing {
                Some((cast, 0)) => {
                    due.push((*id, cast));
                    None
                }
                Some((cast, left)) => Some((cast, left - 1)),
                None => None,
            };
        }
        for (id, cast) in due {
            let Some(found) = self.players.get_mut(&id).filter(|found| able(&found.fighter)) else { continue };
            found.casting.spend(cast.ability());
            found.gear_changed = true;
            found.gear_urgent = true;
            self.cast_spell(id, cast);
        }
        self.step_spells();
    }

    /// What a player's blow that landed on `defender` (as it stood before it) gives back of their Arts: a crit out of
    /// Vanish half its cooldown (Hunt); and, a kill, the Anima its share, a Volt kill 4% of the Tenets (Recharge), a
    /// Blaze kill while Linked 5% (Zeal), and a Cosmic kill on an Exposed foe 2 s more of the Duskraven (Dread).
    pub(crate) fn arts_after(&mut self, blow: &Blow, defender: &Fighter, verdict: &Verdict, killed: bool) {
        let landed = matches!(verdict, Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. });
        let Some(striker) = self.players.get(&blow.striker).map(|found| found.fighter) else { return };
        let element = Element::from_number(blow.element);
        let mut dread = 0;
        if let Some(found) = self.players.get_mut(&blow.striker) {
            let (character, casting) = (&found.character, &mut found.casting);
            let veiled = striker.statuses.has(Status::Veiled);
            if landed && casting.hunting && veiled && crits(blow, Some(&striker), defender) {
                casting.hunting = false;
                let back = character.fragment("hunt").map_or(0.0, |hunt| hunt.cooldown_share);
                casting.tenets[1] = filled(casting.tenets[1], back);
                found.gear_changed = true;
            }
            if !killed {
                return;
            }
            casting.anima = filled(casting.anima, arts().cast.anima_kill_share);
            let cut = |key: &str| character.fragment(key).map_or(0.0, |fragment| fragment.cooldown_share);
            match element {
                Some(Element::Volt) => casting.cut(cut("recharge")),
                Some(Element::Blaze) if striker.statuses.has(Status::Linked) => casting.cut(cut("zeal")),
                Some(Element::Cosmic) if defender.statuses.has(Status::Expose) => {
                    dread = character.fragment("dread").map_or(0, |fragment| ticks(fragment.more_s));
                }
                _ => {}
            }
            found.gear_changed = true;
        }
        self.keep_ravens(blow.striker, dread);
    }

    /// Answers a player's ask of their Arts: 0 done, else the refusal's number.
    pub(crate) fn ask_art(&mut self, player: PlayerId, ask: ArtAsk) -> u8 {
        let Some(found) = self.players.get_mut(&player) else { return 0 };
        found.character.ask_art(ask).map_or_else(|refusal| refusal as u8, |()| 0)
    }

    /// The Test Ground's grant: the player's Anima full and both Tenets ready.
    pub(crate) fn ready_arts(&mut self, player: PlayerId) {
        if let Some(found) = self.players.get_mut(&player) {
            found.casting = Casting { anima: 1.0, tenets: [1.0, 1.0], ..found.casting };
        }
    }
}

#[cfg(test)]
#[path = "arts_tests.rs"]
mod arts_tests;
#[cfg(test)]
#[path = "spells_tests.rs"]
mod spells_tests;
