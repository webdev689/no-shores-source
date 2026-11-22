//! A room on land's snapshot for one player: their own fighter whole, everyone else and every foe packed small
//! (`pack.rs`), and, building on a snapshot their screen showed, only what changed since it.

use crate::pack::{masked, quantized, varints};
use crate::{UNTRIMMED_FLOATS, dressed_vector, finish_snapshot, messages, standing_parts};
use combat::fighter::FighterId;
use combat::shots::Line;
use combat::{Shot, Status};
use room::{Event, FoeSeen, PlayerId, Seen, SpellSeen};
use std::collections::BTreeMap;

/// Everything a snapshot carries after a room's tick, for one player.
#[derive(Clone, Copy, Debug)]
pub struct Snapshot<'snapshot> {
    pub tick: u64,
    /// The player it is for, who has their own fighter whole; everyone else's is packed.
    pub viewer: PlayerId,
    /// The room's middle, which others' numbers are measured from (`pack::middle_of`).
    pub middle: [f64; 2],
    /// The tick of the snapshot this one builds on, 0 for none: then players and foes are those that changed since,
    /// and those gone since it are named.
    pub base: u64,
    pub gone_players: &'snapshot [PlayerId],
    pub gone_foes: &'snapshot [FighterId],
    /// The viewer's own fighter as the base snapshot had it, less its trim: then only the numbers changed since go.
    pub own_base: Option<&'snapshot [f64]>,
    /// Everyone else and every foe as the base snapshot had them (`pack::quantized`): one it held crosses as only the
    /// values that changed since, a bit set for each.
    pub base_players: Option<&'snapshot BTreeMap<PlayerId, Vec<u64>>>,
    pub base_foes: Option<&'snapshot BTreeMap<FighterId, Vec<u64>>>,
    pub players: &'snapshot [Seen],
    pub dressed: &'snapshot [(PlayerId, &'snapshot str)],
    pub foes: &'snapshot [FoeSeen],
    pub events: &'snapshot [Event],
    pub shots: &'snapshot [Shot],
    /// The balls that stopped, each with the tick it stopped, sent among the shots as its last segment and its muzzle.
    pub lines: &'snapshot [(u64, Line)],
    pub spells: &'snapshot [SpellSeen],
    /// A dungeon's cache as `Room::cache` gives it; empty, and left out of the bytes, in any other room.
    pub cache: &'snapshot [f64],
    /// In an Abyss run, the revives its company has left (`Room::revives`); none in any other room.
    pub revives: Option<u8>,
    /// A zone's public events, sent whole each time; none in a room whose zone holds none.
    pub public: Option<&'snapshot room::public::PublicSeen>,
}

/// How many numbers a foe crosses as, packed: its glance, then its role, type, rank, faction, phase, alertness and
/// level, its shield's element, what it holds and held whole, the ticks left of its Expose, its Charge and the
/// immunity a Charge leaves, and last, for a companion, its leader, its officer's given and family names and post (0
/// each for a foe). Everything of a foe is in its packed bytes, so a foe's table holds its number and them.
pub const FOE_NUMBERS: usize = combat::floats::GLANCE_FLOATS + 17;

/// Values as they cross: whole, or with a base, only those that changed and a bit for each.
fn changes_of(values: &[u64], base: Option<&Vec<u64>>) -> (Vec<u8>, Vec<u8>) {
    base.map_or_else(|| (varints(values), Vec::new()), |base| masked(values, base))
}

/// A foe's numbers as it crosses, in the order `FOE_NUMBERS` names.
#[must_use]
pub fn foe_numbers(foe: &FoeSeen) -> Vec<f64> {
    let (shield, statuses) = (foe.shield, foe.fighter.statuses);
    let mut numbers = foe.fighter.glance().to_vec();
    numbers.extend([foe.kind, foe.foe_type, foe.rank, foe.faction, foe.phase, foe.alert, foe.level].map(f64::from));
    numbers.push(shield.map_or(0.0, |shield| f64::from(shield.element as u8)));
    numbers.push(shield.map_or(0.0, |shield| shield.left));
    numbers.push(shield.map_or(0.0, |shield| shield.most));
    numbers
        .extend([statuses.left(Status::Expose), statuses.left(Status::Charge), statuses.charge_immune].map(f64::from));
    let companion = foe.companion.map_or([0; 4], |companion| {
        [companion.leader, companion.given.into(), companion.family.into(), (companion.post as u8).into()]
    });
    numbers.extend(companion.map(f64::from));
    numbers
}

/// The numbers of `now` that differ from `base` (bit for bit), and a bit set for each, the first number's the lowest
/// bit of the first byte. Every bit is set when the two are not as long.
#[must_use]
pub fn changed_since(now: &[f64], base: &[f64]) -> (Vec<f64>, Vec<u8>) {
    let mut bits = vec![0_u8; now.len().div_ceil(8)];
    let mut numbers = Vec::new();
    for (index, number) in now.iter().enumerate() {
        if base.len() != now.len() || base.get(index).map(|was| was.to_bits()) != Some(number.to_bits()) {
            bits[index / 8] |= 1 << (index % 8);
            numbers.push(*number);
        }
    }
    (numbers, bits)
}

/// Every player as the room saw them after its tick, the dresses that changed, every foe, what happened in the fight,
/// and the shots in flight, as `snapshot.viewer` is to have them.
#[must_use]
pub fn snapshot_bytes(snapshot: &Snapshot<'_>) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let seen: Vec<_> = snapshot
        .players
        .iter()
        .map(|seen| {
            // Each fighter goes without its trim, which only its own player needs and has in their gear.
            let floats = seen.fighter.to_floats();
            let own = seen.player == snapshot.viewer;
            let untrimmed = &floats[..UNTRIMMED_FLOATS];
            let (numbers, own_changed) = match snapshot.own_base.filter(|_| own) {
                Some(base) => changed_since(untrimmed, base),
                None => (untrimmed.to_vec(), Vec::new()),
            };
            let fighter = own.then(|| builder.create_vector(&numbers));
            let was = snapshot.base_players.and_then(|base| base.get(&seen.player));
            let (packed, others_changed) = if own {
                (None, Vec::new())
            } else {
                let (bytes, bits) = changes_of(&quantized(untrimmed, snapshot.middle), was);
                (Some(builder.create_vector(&bytes)), bits)
            };
            let changed = [own_changed, others_changed].concat();
            let changed = (!changed.is_empty()).then(|| builder.create_vector(&changed));
            let anim = Some(builder.create_string(&seen.shown.anim));
            let (frame, facing) = (seen.shown.frame, seen.shown.facing);
            let (standing, standing_ticks) = standing_parts(seen.standing);
            let (player, acknowledged) = (seen.player, seen.acknowledged);
            let args = messages::SeenArgs {
                player,
                acknowledged,
                anim,
                frame,
                facing,
                fighter,
                standing,
                standing_ticks,
                packed,
                changed,
            };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&seen));
    let dressed = Some(dressed_vector(&mut builder, snapshot.dressed));
    let foes: Vec<_> = snapshot
        .foes
        .iter()
        .map(|foe| {
            let was = snapshot.base_foes.and_then(|base| base.get(&foe.foe));
            let (bytes, bits) = changes_of(&quantized(&foe_numbers(foe), snapshot.middle), was);
            let packed = Some(builder.create_vector(&bytes));
            let changed = (!bits.is_empty()).then(|| builder.create_vector(&bits));
            // Left out for none, so a foe of its type's name costs nothing more on the wire.
            let name = (!foe.name.is_empty()).then(|| builder.create_string(foe.name));
            let args = messages::FoeArgs { id: foe.foe, packed, changed, name };
            messages::Foe::create(&mut builder, &args)
        })
        .collect();
    let foes = Some(builder.create_vector(&foes));
    let events: Vec<_> = snapshot
        .events
        .iter()
        .map(|event| {
            let args = messages::EventArgs {
                tick: event.tick,
                kind: event.kind as u8,
                how: event.how.map_or(0, |how| how as u8),
                striker: event.striker,
                defender: event.defender,
                amount: event.amount,
                stroke: event.stroke.map_or(0, |stroke| stroke as u8),
                crit: event.crit,
                element: event.element,
                from: event.from.unwrap_or(0),
            };
            messages::Event::create(&mut builder, &args)
        })
        .collect();
    let events = Some(builder.create_vector(&events));
    let flying = snapshot.shots.iter().map(|shot| (shot, None, 0));
    let stopped = snapshot.lines.iter().map(|(tick, line)| (&line.last, Some(line.muzzle), *tick));
    let shots: Vec<_> = flying
        .chain(stopped)
        .map(|(shot, muzzle, stopped)| {
            let at = Some(builder.create_vector(&shot.at));
            let velocity = Some(builder.create_vector(&shot.velocity));
            let muzzle = muzzle.map(|muzzle| builder.create_vector(&muzzle));
            let age = u16::try_from(shot.age).unwrap_or(u16::MAX);
            let (owner, ranged) = (shot.owner, shot.ranged as u8);
            let args = messages::FlyingArgs { owner, ranged, at, velocity, age, muzzle, stopped };
            messages::Flying::create(&mut builder, &args)
        })
        .collect();
    let shots = Some(builder.create_vector(&shots));
    // Left out when there are none, so a snapshot carries no more than it needs.
    let spells = (!snapshot.spells.is_empty()).then(|| spells_vector(&mut builder, snapshot.spells));
    let tick = snapshot.tick;
    let gone_players = (!snapshot.gone_players.is_empty()).then(|| builder.create_vector(snapshot.gone_players));
    let gone_foes = (!snapshot.gone_foes.is_empty()).then(|| builder.create_vector(snapshot.gone_foes));
    let middle = builder.create_vector(&snapshot.middle);
    let cache = (!snapshot.cache.is_empty()).then(|| builder.create_vector(snapshot.cache));
    let revives = snapshot.revives.map_or(-1, |left| i8::try_from(left).unwrap_or(i8::MAX));
    let public_event = snapshot.public.map(|seen| crate::public_wire::public_offset(&mut builder, seen));
    let args = messages::SnapshotArgs {
        tick,
        players,
        dressed,
        foes,
        events,
        shots,
        spells,
        base: snapshot.base,
        gone_players,
        gone_foes,
        middle: Some(middle),
        cache,
        revives,
        public_event,
        ..messages::SnapshotArgs::default()
    };
    finish_snapshot(builder, &args)
}

/// Every spell, as the snapshot carries them.
fn spells_vector<'built>(
    builder: &mut flatbuffers::FlatBufferBuilder<'built>,
    spells: &[SpellSeen],
) -> flatbuffers::WIPOffset<flatbuffers::Vector<'built, flatbuffers::ForwardsUOffset<messages::Spell<'built>>>> {
    let each: Vec<_> = spells
        .iter()
        .map(|spell| {
            let at = Some(builder.create_vector(&spell.at));
            let heads = spell.heads.map(|heads| builder.create_vector(&heads));
            let args = messages::SpellArgs {
                id: spell.id,
                kind: spell.kind,
                caster: spell.caster,
                art: spell.art,
                at,
                heads,
                seeks: spell.seeks.unwrap_or(0),
                age: spell.age,
                life: spell.life,
                radius: spell.radius,
            };
            messages::Spell::create(builder, &args)
        })
        .collect();
    builder.create_vector(&each)
}
