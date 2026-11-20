//! The Arts in the room: each player's Anima charging over its recharge and 2% more a kill, and their two Tenets
//! recharging over theirs, kept while they are in the room; a cast their input asks for, taken only when it is ready,
//! of the Art worn, with the caster able to act, and released 18 ticks later; the kills and crits that give charge
//! back; and the asks that wear an Art and set its Core. What each spell does is `spells.rs`'s.

use crate::players::Player;
use crate::{PlayerId, Room, Standing};
use combat::judge::Blow;
use combat::status::crits;
use combat::{Fighter, Status, Verdict, ticks};
use gear::arts::{ArtAsk, arts};
use gear::{Character, Element, Slot};

/// A share within this of full is full: a share added up tick by tick never quite reaches 1.
const FULL: f64 = 1.0 - 1e-9;
/// A kill takes this share off the Tenets' cooldowns with the weapons' perk Spellfeed.
const SPELLFEED_SHARE: f64 = 0.03;
/// How long the room keeps an account's Arts after it leaves: ten minutes.
const KEPT_TICKS: u64 = 60 * 600;

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

/// Whether a player may act on a cast: neither dead (nor dead past the section's edge), staggered nor Charged.
fn able(found: &Player) -> bool {
    let fighter = &found.fighter;
    let fallen = matches!(found.standing, Standing::Dead { .. });
    !fallen && !fighter.dead() && !fighter.staggered() && !fighter.statuses.has(Status::Charge)
}

impl Room {
    /// Takes away every player's Art from now on, as the prologue's wreck does: no cast is taken, no Anima or Tenet
    /// charges (a kill's charge included), no fragment of a Core works (`core`), a blow in an Art's element is no more
    /// than another, and the player's gear says no Art is worn, its Anima and Tenets empty.
    pub fn forbid_arts(&mut self) {
        self.arts = false;
    }

    /// Whether players' Arts work in this room.
    #[must_use]
    pub fn arts_on(&self) -> bool {
        self.arts
    }

    /// A cast a player's input asks for, taken to release once its time comes if it is the worn Art's, charged, no
    /// other is on its way, and the player may act; else let go. The room is given none from a player on horseback.
    pub(crate) fn ask_cast(&mut self, player: PlayerId, cast: Option<Cast>) {
        let release = ticks(arts().cast.release_s);
        if !self.arts {
            return;
        }
        let Some((cast, found)) = cast.zip(self.players.get_mut(&player)) else { return };
        let known = cast.spell >= 1 && cast.art() == found.character.art().id;
        let ready = found.casting.releasing.is_none() && found.casting.share(cast.ability()) >= 1.0;
        if known && ready && able(found) {
            found.casting.releasing = Some((cast, release));
        }
    }

    /// One tick of every player's Arts: each charges, a cast whose time has come is released (cut short, it costs
    /// nothing), the veil Hunt watches ending lets it go, and every spell steps.
    pub(crate) fn step_arts(&mut self) {
        if !self.arts {
            return;
        }
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
            let Some(found) = self.players.get_mut(&id).filter(|found| able(found)) else { continue };
            found.casting.spend(cast.ability());
            found.gear_changed = true;
            found.gear_urgent = true;
            self.cast_spell(id, cast);
        }
        self.step_spells();
    }

    /// What a player's blow that landed on `defender` (as it stood before it) gives back of their Arts: a crit out of
    /// Vanish half its cooldown (Hunt); and, a kill, the Anima its share, 3% of the Tenets for a weapon's kill with
    /// Spellfeed on its loadout (`perk_on`), a Volt kill 4% of the Tenets (Recharge), a Blaze kill while Linked 5%
    /// (Zeal), and a Cosmic kill on an Exposed foe 2 s more of the Duskraven (Dread).
    pub(crate) fn arts_after(&mut self, blow: &Blow, defender: &Fighter, verdict: &Verdict, killed: bool) {
        if !self.arts {
            return;
        }
        let landed = matches!(verdict, Verdict::Hit { .. } | Verdict::Blocked { .. } | Verdict::GuardBroken { .. });
        let spellfeed = self.perk_on(blow, "spellfeed");
        let Some(striker) = self.players.get(&blow.striker).map(|found| found.fighter) else { return };
        let element = Element::from_number(blow.element);
        let mut dread = false;
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
            if spellfeed {
                casting.cut(SPELLFEED_SHARE);
            }
            let cut = |key: &str| character.fragment(key).map_or(0.0, |fragment| fragment.cooldown_share);
            match element {
                Some(Element::Volt) => casting.cut(cut("recharge")),
                Some(Element::Blaze) if striker.statuses.has(Status::Linked) => casting.cut(cut("zeal")),
                Some(Element::Cosmic) => dread = defender.statuses.has(Status::Expose),
                _ => {}
            }
            found.gear_changed = true;
        }
        if dread {
            self.keep_ravens(blow.striker);
        }
    }

    /// Answers a player's ask of their Arts: 0 done, else the refusal's number.
    pub(crate) fn ask_art(&mut self, player: PlayerId, ask: ArtAsk) -> u8 {
        let Some(found) = self.players.get_mut(&player) else { return 0 };
        let worn = found.character.art().id;
        if let Err(refusal) = found.character.ask_art(ask) {
            return refusal as u8;
        }
        // A new Art starts empty, as a new subclass does in Destiny: else its charge would fill at another Art's pace.
        if found.character.art().id != worn {
            found.casting = Casting { anima: 0.0, tenets: [0.0, 0.0], releasing: None, hunting: false };
        }
        0
    }

    /// A player leaving: an account's Anima and Tenets kept as they left them, with the Art it wore, so a rejoin does
    /// not ready the Tenets afresh. The room keeps as many as it holds players, the oldest let go first, and forgets
    /// one gone `KEPT_TICKS`.
    pub(crate) fn keep_casting(&mut self, gone: &Player) {
        let Some(owner) = gone.owner.clone() else { return };
        let (clock, kept) = (self.clock, &mut self.spells.kept);
        kept.retain(|_, (_, _, left)| clock < left.saturating_add(KEPT_TICKS));
        kept.remove(&owner);
        if kept.len() >= crate::PLAYERS_MOST
            && let Some(oldest) = kept.iter().min_by_key(|(_, (_, _, left))| *left).map(|(key, _)| key.clone())
        {
            kept.remove(&oldest);
        }
        kept.insert(owner, (gone.casting, gone.character.art().id, clock));
    }

    /// An account's Anima and Tenets given back as it rejoins within `KEPT_TICKS`: as it left them, or empty if it
    /// now wears another Art, as wearing another empties them.
    pub(crate) fn give_casting_back(&mut self, player: PlayerId, owner: &str) {
        let clock = self.clock;
        let Some((casting, art, left)) = self.spells.kept.remove(owner) else { return };
        let Some(found) = self.players.get_mut(&player).filter(|_| clock < left.saturating_add(KEPT_TICKS)) else {
            return;
        };
        let same = found.character.art().id == art;
        found.casting.anima = if same { casting.anima } else { 0.0 };
        found.casting.tenets = if same { casting.tenets } else { [0.0; 2] };
        found.gear_changed = true;
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
pub(crate) mod arts_tests;
#[cfg(test)]
#[path = "spells_tests.rs"]
mod spells_tests;
