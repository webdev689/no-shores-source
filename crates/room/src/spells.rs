//! The Arts' nine spells in the room, cast by players alone: each as `content/arts/arts.json` has it, changed by the
//! fragments in the caster's Core, striking foes in its Art's element with the power of the caster's best worn weapon,
//! its blows weighed and its kills paid as a weapon's are. A spell that lasts or moves is an entity the snapshot sends
//! every player: Tempest's orbs, the Sunwell, the Dawnflare, the Duskraven and its bolts, and Dusk Daggers' ring; one
//! that acts at once (Quicken, Arc Lash, Mend, Vanish) shows as one for half a second, so every screen can draw it.

use crate::arts::{Cast, spell_power};
use crate::judging::How;
use crate::power::Loosed;
use crate::{PlayerId, Room, standing_on};
use combat::fighter::{Action, FighterId};
use combat::judge::Blow;
use combat::sight::{bearing, off};
use combat::tuning::{BODY_HEIGHT, BODY_RADIUS, DODGE_LIFT};
use combat::{BlowKind, Fighter, Status, Trim, Verdict, ticks};
use gear::arts::{CORE_SLOTS, FragmentDef, SpellDef, arts, held_fragment};
use movement::{Body, Mode, TICK_SECONDS, TUNING};

/// A Duskraven's bolt, beside the nine spells' own numbers (1 Tempest to 9 Vanish).
pub const BOLT: u8 = 10;
/// How long a spell that acts at once shows: half a second.
const FLASH_TICKS: u32 = 30;
/// How far behind the caster the Dawnflare sets out, so it strafes past them (metres).
const FLARE_BEHIND: f64 = 3.0;
/// How far past a body's side, and above and below it, an orb or a bolt strikes it (metres).
const STRIKE_REACH: f64 = 0.25;
/// How far above or below its foe's feet a spell along the ground (a cone, a ring, a flight) still reaches it.
const SPELL_HEIGHT: f64 = 2.0;
/// Tempest's orbs leave fanned over this arc ahead, rising at this angle (radians).
const ORB_FAN: f64 = core::f64::consts::FRAC_PI_2;
const ORB_RISE: f64 = 0.3;
/// The Duskraven rides this far right of its caster's aim, this high over their feet (metres).
const SHOULDER_SIDE: f64 = 0.45;
const SHOULDER_UP: f64 = 2.0;
/// A bolt flies at most this many times its reach before it is spent.
const BOLT_REACHES: f64 = 2.0;
/// A body slower than this rolls back, as one standing still does (m/s).
const STILL: f64 = 0.1;

/// A spell in the room: its number, its kind (its spell's number, or `BOLT`), its caster, its Art and spell, where it
/// is and its velocity (m/s, for what flies), where it heads and the foe it seeks, the ticks it has lasted of its life,
/// how far it reaches, where it set off, the ticks before it leaves its caster (an orb waiting its turn), the foes it
/// struck on this pass, and its caster's Art's shares as it was cast (`Character::art_shares`): of its healing, and of
/// how long it and what it gives last.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Spell {
    pub id: u32,
    pub kind: u8,
    pub caster: PlayerId,
    pub art: u8,
    pub def: &'static SpellDef,
    pub at: [f64; 3],
    pub velocity: [f64; 3],
    pub heads: Option<[f64; 3]>,
    pub seeks: Option<FighterId>,
    pub age: u32,
    pub life: u32,
    pub radius: f64,
    pub from: [f64; 3],
    pub wait: u32,
    pub struck: Vec<FighterId>,
    pub shares: (f64, f64),
    /// The casting Art's Core as it was cast: what it set after changes nothing already out.
    pub core: [Option<u8>; CORE_SLOTS],
}

impl Spell {
    fn new(kind: u8, caster: PlayerId, art: u8, def: &'static SpellDef, at: [f64; 3], life: u32, radius: f64) -> Self {
        let (velocity, heads, seeks, struck) = ([0.0; 3], None, None, Vec::new());
        Spell {
            id: 0,
            kind,
            caster,
            art,
            def,
            at,
            velocity,
            heads,
            seeks,
            age: 0,
            life,
            radius,
            from: at,
            wait: 0,
            struck,
            shares: (1.0, 1.0),
            core: [None; CORE_SLOTS],
        }
    }

    /// A fragment of its Art, by its key, if the Core it was cast with holds it.
    fn fragment(&self, key: &str) -> Option<&'static FragmentDef> {
        held_fragment(self.art, self.core, key)
    }

    /// `ticks` weighed by the lasting share its Art held as it was cast.
    fn last(&self, ticks: u32) -> u32 {
        combat::ticks(f64::from(ticks) / 60.0 * self.shares.1)
    }
}

/// The room's spells, the number the next takes, the players whose Duskravens a kill keeps longer this tick (Dread),
/// each Linked fighter's healing share from the Sunwell that Linked it, and each account's Arts as it left, with the
/// Art it wore and the tick it left (`arts::keep_casting`).
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Spells {
    pub list: Vec<Spell>,
    next: u32,
    kept_longer: Vec<PlayerId>,
    pub linked: std::collections::BTreeMap<FighterId, f64>,
    pub kept: std::collections::BTreeMap<String, (crate::Casting, u8, u64)>,
}

/// A spell as every player sees it: its number, its kind (1 Tempest's orb to 9 Vanish's veil, 10 a Duskraven's bolt),
/// its caster, its Art, where it is, where it heads (a Dawnflare's end, Arc Lash's reach ahead), the foe it seeks,
/// the ticks it has lasted of its life, and how far it reaches (a ring's or a well's radius, a cone's length).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpellSeen {
    pub id: u32,
    pub kind: u8,
    pub caster: PlayerId,
    pub art: u8,
    pub at: [f64; 3],
    pub heads: Option<[f64; 3]>,
    pub seeks: Option<FighterId>,
    pub age: u32,
    pub life: u32,
    pub radius: f64,
}

fn distance(from: [f64; 3], to: [f64; 3]) -> f64 {
    let [east, south, up] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
    (east * east + south * south + up * up).sqrt()
}

/// The way from one point to another, as a unit; none for one on the other.
fn toward(from: [f64; 3], to: [f64; 3]) -> [f64; 3] {
    let length = distance(from, to);
    if length < 1e-9 { [0.0; 3] } else { [0, 1, 2].map(|axis| (to[axis] - from[axis]) / length) }
}

/// `way` turned toward `wanted` (both units) by `most` radians at most.
fn turned(way: [f64; 3], wanted: [f64; 3], most: f64) -> [f64; 3] {
    let dot = (way[0] * wanted[0] + way[1] * wanted[1] + way[2] * wanted[2]).clamp(-1.0, 1.0);
    if libm::acos(dot) <= most {
        return wanted;
    }
    let across = toward([0.0; 3], [0, 1, 2].map(|axis| wanted[axis] - way[axis] * dot));
    [0, 1, 2].map(|axis| way[axis] * libm::cos(most) + across[axis] * libm::sin(most))
}

/// A point moved a tick at `velocity`.
fn moved(at: [f64; 3], velocity: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|axis| at[axis] + velocity[axis] * TICK_SECONDS)
}

/// Whether a point flying through the room strikes a fighter's body.
fn touches(at: [f64; 3], fighter: &Fighter) -> bool {
    let body = fighter.body;
    libm::hypot(at[0] - body.x, at[1] - body.y) <= BODY_RADIUS + STRIKE_REACH
        && (body.z - STRIKE_REACH..=body.z + BODY_HEIGHT + STRIKE_REACH).contains(&at[2])
}

fn feet_of(fighter: &Fighter) -> [f64; 3] {
    [fighter.body.x, fighter.body.y, fighter.body.z]
}

/// Where a fighter's aim points across the ground, as a unit.
fn ahead_of(fighter: &Fighter) -> [f64; 2] {
    [libm::sin(fighter.aim), -libm::cos(fighter.aim)]
}

/// Where a Duskraven rides: at its caster's right shoulder.
fn shoulder_of(fighter: &Fighter) -> [f64; 3] {
    let [east, south] = ahead_of(fighter);
    let body = fighter.body;
    [body.x - south * SHOULDER_SIDE, body.y + east * SHOULDER_SIDE, body.z + SHOULDER_UP]
}

impl Room {
    /// Every spell, those still waiting to leave their caster aside.
    pub fn spells_seen(&self) -> impl Iterator<Item = SpellSeen> + '_ {
        self.spells.list.iter().filter(|spell| spell.wait == 0).map(|spell| SpellSeen {
            id: spell.id,
            kind: spell.kind,
            caster: spell.caster,
            art: spell.art,
            at: spell.at,
            heads: spell.heads,
            seeks: spell.seeks,
            age: spell.age,
            life: spell.life,
            radius: spell.radius,
        })
    }

    fn add_spell(&mut self, spell: Spell) {
        self.spells.next = self.spells.next.wrapping_add(1).max(1);
        self.spells.list.push(Spell { id: self.spells.next, ..spell });
    }

    /// The living foes within `radius` of `at` across the ground and `height` above or below it.
    fn foes_near(&self, at: [f64; 3], radius: f64, height: f64) -> Vec<FighterId> {
        let near =
            |body: &Body| libm::hypot(body.x - at[0], body.y - at[1]) <= radius && (body.z - at[2]).abs() <= height;
        let living = self.foes.iter().filter(|(_, foe)| !foe.fighter.dead());
        living.filter(|(_, foe)| near(&foe.fighter.body)).map(|(id, _)| *id).collect()
    }

    /// The living players within `radius` of `at`, across and up; one dead past the section's edge is not living.
    fn players_near(&self, at: [f64; 3], radius: f64) -> Vec<PlayerId> {
        let near =
            |body: &Body| libm::hypot(body.x - at[0], body.y - at[1]) <= radius && (body.z - at[2]).abs() <= radius;
        let fallen = |found: &crate::players::Player| matches!(found.standing, crate::Standing::Dead { .. });
        let living = self.players.iter().filter(|(_, found)| !found.fighter.dead() && !fallen(found));
        living.filter(|(_, found)| near(&found.fighter.body)).map(|(id, _)| *id).collect()
    }

    /// The living foe whose chest is nearest `at`, within `reach`.
    fn nearest_foe(&self, at: [f64; 3], reach: f64) -> Option<FighterId> {
        let living = self.foes.iter().filter(|(_, foe)| !foe.fighter.dead());
        let measured = living.map(|(id, foe)| (*id, distance(at, foe.fighter.chest())));
        measured.filter(|(_, far)| *far <= reach).min_by(|first, second| first.1.total_cmp(&second.1)).map(|(id, _)| id)
    }

    fn heal(&mut self, player: PlayerId, amount: f64) {
        if let Some(found) = self.players.get_mut(&player).filter(|found| !found.fighter.dead()) {
            let fighter = &mut found.fighter;
            fighter.health = (fighter.health + amount).min(fighter.health_max);
        }
    }

    /// A spell's blow on a living foe from `from`, `damage` before power: its share by its Art's level at the cast, in
    /// its Art's element, by the caster's best weapon's Attack, judged against the foe as it stands and settled as a
    /// weapon's blow is. Answers the health it took.
    fn spell_strikes(&mut self, spell: &Spell, foe: FighterId, from: [f64; 3], damage: f64) -> Option<f64> {
        let found = self.players.get(&spell.caster)?;
        let (attack, hand) = spell_power(&found.character);
        // The level of the Art that cast it, as it was cast, whatever is worn or risen since.
        let damage = damage * spell.shares.0;
        let then = self.foes.get(&foe).map(|foe| foe.fighter).filter(|then| !then.dead())?;
        let element = arts().art(spell.art).and_then(|art| gear::Element::from_number(art.element));
        let blow = Blow {
            striker: spell.caster,
            kind: BlowKind::Spell(spell.kind),
            from: [from[0], from[1]],
            damage,
            poise: 0.0,
            guard: 0.0,
            parryable: false,
            blockable: false,
            knocks_down: false,
            through: 1.0,
            stagger: 1.0,
            element: 0,
            crit: false,
        };
        let blow = self.empower_as(blow, foe, Some(Loosed { attack, element, trim: Trim::PLAIN }));
        // A dodge passes a spell whole: none of its harm, nor the status it would give.
        if matches!(self.judge_now(&blow, How::Spell, foe, &then, Some(hand)), Verdict::Dodged { .. }) {
            return None;
        }
        Some((then.health - self.foes.get(&foe).map_or(then.health, |foe| foe.fighter.health)).max(0.0))
    }

    /// Lets a cast go: what its spell does at once, and the entity it leaves.
    pub(crate) fn cast_spell(&mut self, caster: PlayerId, cast: Cast) {
        let Some(fighter) = self.players.get(&caster).map(|found| found.fighter) else { return };
        let Some(art) = arts().art(cast.art()) else { return };
        let Some(def) = art.spell(cast.ability()) else { return };
        // Casting is attacking, which ends the veil; Vanish's veil is what it casts.
        if def.key != "vanish"
            && let Some(found) = self.players.get_mut(&caster)
        {
            found.fighter.statuses.unveil();
        }
        let (feet, chest, ahead) = (feet_of(&fighter), fighter.chest(), ahead_of(&fighter));
        // The Art's level: its share of the healing given, and of how long the spell and the buffs it gives last.
        let shares = self.players.get(&caster).map_or((1.0, 1.0), |found| found.character.art_shares(art.id));
        let core = self.players.get(&caster).map_or([None; CORE_SLOTS], |found| found.character.core_of(art.id));
        let held = |key: &str| held_fragment(art.id, core, key);
        let (power, lasting) = shares;
        let made =
            |at, life, radius| Spell { shares, core, ..Spell::new(cast.spell, caster, art.id, def, at, life, radius) };
        let last = |ticks: u32| combat::ticks(f64::from(ticks) / 60.0 * lasting);
        match def.key.as_str() {
            "tempest" => self.tempest(made(chest, ticks(def.life_s), def.reach), fighter.aim),
            "quicken" => {
                let gale = held("gale");
                let radius = gale.map_or(def.radius, |gale| gale.radius);
                let lasts = last(Status::Haste.ticks() + gale.map_or(0, |gale| ticks(gale.more_s)));
                for player in self.players_near(feet, radius) {
                    self.give(player, Status::Haste, Some(lasts), Some(caster));
                }
                if held("momentum").is_some() {
                    self.give(caster, Status::Crit, Some(lasts), Some(caster));
                }
                self.add_spell(made(feet, FLASH_TICKS, radius));
            }
            "arcLash" => {
                let lash = made(chest, FLASH_TICKS, def.reach);
                self.arc_lash(&lash, &fighter);
                let heads = [feet[0] + ahead[0] * def.reach, feet[1] + ahead[1] * def.reach, chest[2]];
                self.add_spell(Spell { heads: Some(heads), ..lash });
            }
            "sunwell" => {
                let radiance = held("radiance");
                let radius = def.radius + radiance.map_or(0.0, |more| more.more_radius);
                let life = last(ticks(def.life_s + radiance.map_or(0.0, |more| more.more_s)));
                self.add_spell(made(feet, life, radius));
            }
            "mend" => {
                self.heal(caster, def.heal * power);
                let mercy = held("mercy");
                for player in mercy.map_or_else(Vec::new, |mercy| self.players_near(feet, mercy.radius)) {
                    if player != caster {
                        self.heal(player, def.heal * power * mercy.map_or(0.0, |mercy| mercy.heal_share));
                    }
                }
                if held("resolve").is_some() {
                    self.give(caster, Status::Crit, Some(last(Status::Crit.ticks())), Some(caster));
                }
                self.add_spell(made(feet, FLASH_TICKS, mercy.map_or(0.0, |mercy| mercy.radius)));
            }
            "dawnflare" => {
                let speed = if def.flight_s > 0.0 { def.length / def.flight_s } else { 0.0 };
                let start = [chest[0] - ahead[0] * FLARE_BEHIND, chest[1] - ahead[1] * FLARE_BEHIND, chest[2]];
                let heads = [start[0] + ahead[0] * def.length, start[1] + ahead[1] * def.length, chest[2]];
                let passes = 1 + u32::from(held("wings").is_some());
                let flare = made(start, ticks(def.flight_s) * passes, def.width);
                let velocity = [ahead[0] * speed, ahead[1] * speed, 0.0];
                self.add_spell(Spell { velocity, heads: Some(heads), ..flare });
            }
            "duskraven" => self.add_spell(made(shoulder_of(&fighter), last(ticks(def.life_s)), def.reach)),
            "duskDaggers" => {
                let blades = held("blades");
                let at = self.daggers_at(feet, cast.aim, def.reach);
                let radius = def.radius + blades.map_or(0.0, |blades| blades.more_radius);
                let life = last(ticks(def.life_s + blades.map_or(0.0, |blades| blades.more_s)));
                self.add_spell(made(at, life, radius));
            }
            "vanish" => {
                self.vanish(caster, def.roll);
                let night = held("night").map_or(0, |night| ticks(night.more_s));
                let veil = Some(last(Status::Veiled.ticks() + night));
                self.give(caster, Status::Veiled, veil, Some(caster));
                self.add_spell(made(feet, FLASH_TICKS, def.roll));
            }
            _ => {}
        }
    }

    /// Tempest's orbs, each leaving its caster in turn over its release, fanned out ahead.
    fn tempest(&mut self, orb: Spell, aim: f64) {
        let def = orb.def;
        let count = def.orbs + orb.fragment("pursuit").map_or(0, |pursuit| pursuit.orbs);
        let over = ticks(def.release_over_s);
        for nth in 0..count {
            let bearing = aim + ORB_FAN * ((f64::from(nth) + 0.5) / f64::from(count) - 0.5);
            let flat = libm::cos(ORB_RISE) * def.speed;
            let velocity = [libm::sin(bearing) * flat, -libm::cos(bearing) * flat, libm::sin(ORB_RISE) * def.speed];
            self.add_spell(Spell { velocity, wait: over * nth / count, ..orb.clone() });
        }
    }

    /// Arc Lash: each foe in the cone ahead struck, then Charged (half as long again with Conduction), for its rank's
    /// time weighed by the lasting.
    fn arc_lash(&mut self, lash: &Spell, caster: &Fighter) {
        let (def, feet) = (lash.def, feet_of(caster));
        let half = def.cone_degrees.to_radians() / 2.0;
        let longer = lash.fragment("conduction").map_or(1.0, |conduction| conduction.charge_times);
        for foe in self.foes_near(feet, def.reach, SPELL_HEIGHT) {
            let Some(body) = self.foes.get(&foe).map(|found| found.fighter.body) else { continue };
            if off(caster.aim, bearing([feet[0], feet[1]], [body.x, body.y])) > half {
                continue;
            }
            if self.spell_strikes(lash, foe, feet, def.damage).is_none() {
                continue;
            }
            let lasts = ticks(f64::from(self.lasts(foe, Status::Charge)) * longer * lash.shares.1 * TICK_SECONDS);
            self.give(foe, Status::Charge, Some(lasts), Some(lash.caster));
        }
    }

    /// Where Dusk Daggers whirl: where they were aimed, drawn in to their reach, on the ground there once drawn in;
    /// at the caster's feet with no aim.
    fn daggers_at(&self, feet: [f64; 3], aim: Option<[f64; 3]>, reach: f64) -> [f64; 3] {
        let Some(wanted) = aim else { return feet };
        let far = libm::hypot(wanted[0] - feet[0], wanted[1] - feet[1]);
        // Within reach the ring lies where it was aimed, but always on the ground: the page's height is not taken.
        let share = if far <= reach { 1.0 } else { reach / far };
        let [x, y] = [0, 1].map(|axis| feet[axis] + (wanted[axis] - feet[axis]) * share);
        [x, y, standing_on(&self.floor, &self.blocks, x, y).z]
    }

    /// Vanish's roll: a dodge's hop `roll` metres the way the caster moves, back with no way, on the ground only;
    /// whatever its end, a crit out of the veil may give back its cooldown (Hunt).
    fn vanish(&mut self, caster: PlayerId, roll: f64) {
        let Some(found) = self.players.get_mut(&caster) else { return };
        found.casting.hunting = true;
        let fighter = &mut found.fighter;
        // Only where a dodge could start: elsewhere (a dodge, an early flinch, a reload) the veil falls without the
        // roll and what the caster was doing runs on.
        if fighter.body.mode != Mode::Ground || !combat::step::dodge_leaves(&fighter.action) {
            return;
        }
        let moving = libm::hypot(fighter.body.vx, fighter.body.vy);
        let [east, south] = ahead_of(fighter);
        let way = if moving > STILL { [fighter.body.vx / moving, fighter.body.vy / moving] } else { [-east, -south] };
        // A hop rising at the dodge's lift lands after 2 lift / gravity seconds, so this speed covers `roll`.
        let speed = roll * TUNING.gravity / (2.0 * DODGE_LIFT);
        let (vx, vy) = (way[0] * speed, way[1] * speed);
        fighter.body = Body {
            mode: Mode::Air,
            vx,
            vy,
            vz: DODGE_LIFT,
            grounded: 0.0,
            crouched: false,
            moving: true,
            ..fighter.body
        };
        fighter.action = Action::Dodge { elapsed: 0, toward: way };
    }

    /// Lengthens a player's Duskravens for a kill (Dread), once this tick's spells have stepped: a kill may come
    /// while they do.
    pub(crate) fn keep_ravens(&mut self, player: PlayerId) {
        self.spells.kept_longer.push(player);
    }

    /// A tick of every spell; one whose caster has left goes with them. Bolts a raven looses this tick fly from the
    /// next.
    pub(crate) fn step_spells(&mut self) {
        let mut kept = Vec::new();
        for spell in std::mem::take(&mut self.spells.list) {
            let Some(caster) = self.players.get(&spell.caster).map(|found| found.fighter) else { continue };
            if let Some(next) = self.step_spell(spell, &caster) {
                kept.push(next);
            }
        }
        kept.append(&mut self.spells.list);
        for player in std::mem::take(&mut self.spells.kept_longer) {
            let ravens = kept.iter_mut().filter(|spell| spell.caster == player && spell.kind != BOLT);
            // Dread's seconds by the Core and the lasting each raven was cast with.
            for raven in ravens.filter(|spell| spell.def.key == "duskraven") {
                raven.life += raven.fragment("dread").map_or(0, |dread| raven.last(ticks(dread.more_s)));
            }
        }
        self.spells.list = kept;
    }

    fn step_spell(&mut self, mut spell: Spell, caster: &Fighter) -> Option<Spell> {
        let def = spell.def;
        if spell.kind == BOLT {
            return self.step_bolt(spell);
        }
        match def.key.as_str() {
            "tempest" => return self.step_orb(spell, caster),
            "sunwell" => {
                // Linked heals by the share kept from the cast, so it heals alike whether its caster stays or goes.
                let lingers = Some(spell.last(Status::Linked.ticks()));
                for player in self.players_near(spell.at, spell.radius) {
                    if self.give(player, Status::Linked, lingers, Some(spell.caster)) {
                        self.spells.linked.insert(player, spell.shares.0);
                    }
                }
            }
            "dawnflare" => self.step_flare(&mut spell),
            "duskraven" => {
                spell.at = shoulder_of(caster);
                if caster.dead() {
                    return None;
                }
                if spell.age.is_multiple_of(ticks(def.every_s).max(1)) {
                    spell.seeks = self.nearest_foe(spell.at, def.reach);
                    let life = ticks(BOLT_REACHES * def.reach / def.speed.max(1.0));
                    let bolt = Spell { kind: BOLT, age: 0, life, radius: 0.0, ..spell.clone() };
                    if spell.seeks.is_some() {
                        self.add_spell(bolt);
                    }
                }
            }
            "duskDaggers" if spell.age.is_multiple_of(ticks(def.every_s).max(1)) => {
                for foe in self.foes_near(spell.at, spell.radius, SPELL_HEIGHT) {
                    if self.spell_strikes(&spell, foe, spell.at, def.damage).is_some() {
                        self.give(foe, Status::Expose, Some(spell.last(Status::Expose.ticks())), Some(spell.caster));
                    }
                }
            }
            _ => {}
        }
        spell.age += 1;
        (spell.age < spell.life).then_some(spell)
    }

    /// An orb: riding its caster until its turn to leave; then seeking the nearest foe within its reach, keeping it
    /// while it lives and stays in reach, turning toward it as fast as it may, and spent on the first foe it strikes.
    fn step_orb(&mut self, mut orb: Spell, caster: &Fighter) -> Option<Spell> {
        if orb.wait > 0 {
            orb.wait -= 1;
            orb.at = caster.chest();
            return Some(orb);
        }
        let def = orb.def;
        let chest_of = |room: &Room, id: FighterId| {
            room.foes.get(&id).filter(|foe| !foe.fighter.dead()).map(|foe| foe.fighter.chest())
        };
        let kept = orb.seeks.filter(|id| chest_of(self, *id).is_some_and(|chest| distance(orb.at, chest) <= def.reach));
        orb.seeks = kept.or_else(|| self.nearest_foe(orb.at, def.reach));
        if let Some(chest) = orb.seeks.and_then(|id| chest_of(self, id)) {
            let way = turned(toward([0.0; 3], orb.velocity), toward(orb.at, chest), def.turn_per_s * TICK_SECONDS);
            orb.velocity = way.map(|part| part * def.speed);
        }
        orb.at = moved(orb.at, orb.velocity);
        let struck = self.foes.iter().find(|(_, foe)| !foe.fighter.dead() && touches(orb.at, &foe.fighter));
        if let Some(foe) = struck.map(|(id, _)| *id) {
            self.spell_strikes(&orb, foe, orb.at, def.damage);
            return None;
        }
        orb.age += 1;
        (orb.age < orb.life).then_some(orb)
    }

    /// The Dawnflare: flying its line, burning each foe near it once a pass (Exposing it with Searing), and turning
    /// back at its end for a second pass with Wings.
    fn step_flare(&mut self, flare: &mut Spell) {
        let def = flare.def;
        flare.at = moved(flare.at, flare.velocity);
        for foe in self.foes_near(flare.at, def.width, SPELL_HEIGHT) {
            if flare.struck.contains(&foe) {
                continue;
            }
            flare.struck.push(foe);
            let landed = self.spell_strikes(flare, foe, flare.at, def.damage).is_some();
            if landed && flare.fragment("searing").is_some() {
                self.give(foe, Status::Expose, Some(flare.last(Status::Expose.ticks())), Some(flare.caster));
            }
        }
        let pass = ticks(def.flight_s);
        if flare.age + 1 == pass && flare.life > pass {
            flare.velocity = flare.velocity.map(|part| -part);
            flare.heads = Some(flare.from);
            flare.struck.clear();
        }
    }

    /// A Duskraven's bolt: flying at its foe, spent if the foe falls first; striking it, Exposing it and healing its
    /// caster half what it took (all with Hunger).
    fn step_bolt(&mut self, mut bolt: Spell) -> Option<Spell> {
        let def = bolt.def;
        let foe = bolt.seeks?;
        let chest = self.foes.get(&foe).filter(|found| !found.fighter.dead())?.fighter.chest();
        let step = def.speed * TICK_SECONDS;
        if distance(bolt.at, chest) <= step + BODY_RADIUS + STRIKE_REACH {
            let took = self.spell_strikes(&bolt, foe, bolt.at, def.damage)?;
            self.give(foe, Status::Expose, Some(bolt.last(Status::Expose.ticks())), Some(bolt.caster));
            let share = bolt.fragment("hunger").map_or(def.heal_share, |hunger| hunger.heal_share);
            self.heal(bolt.caster, took * share);
            return None;
        }
        bolt.velocity = toward(bolt.at, chest).map(|part| part * def.speed);
        bolt.at = moved(bolt.at, bolt.velocity);
        bolt.age += 1;
        (bolt.age < bolt.life).then_some(bolt)
    }
}
