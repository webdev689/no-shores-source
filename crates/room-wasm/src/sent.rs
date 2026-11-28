//! What a room on land's snapshots held, kept a short while: each tick's players and foes as the others see them, the
//! zone's events, and what happened (the fight's events, dresses and plates changed, balls stopped) with the tick it
//! happened. A player's snapshot then holds only the players and foes that changed since the one their screen last
//! showed, the events and the ships parked at its island only when they stand otherwise than that one's, and what
//! happened since; so a snapshot lost on the way costs nothing the next does not carry again.

use combat::fighter::FighterId;
use combat::shots::Line;
use protocol::land::foe_numbers;
use protocol::pack::quantized;
use protocol::{Snapshot, UNTRIMMED_FLOATS, snapshot_bytes, standing_parts};
use room::public::PublicSeen;
use room::{Event, FoeSeen, Plate, PlayerId, Reviving, Room, Seen, SpellSeen};
use std::collections::{BTreeMap, VecDeque};
use std::rc::Rc;

/// How many ticks of snapshots are kept to build on: two seconds; a screen further behind is sent everything.
const KEPT_TICKS: usize = 120;

/// One tick's players and foes, each's numbers as they cross to others (`pack::quantized`) and each player's look,
/// each player's own fighter whole (less its trim) as it crosses to them, and the zone's events.
#[derive(Debug, Default)]
struct Held {
    tick: u64,
    players: BTreeMap<PlayerId, Vec<u64>>,
    looks: BTreeMap<PlayerId, Vec<u8>>,
    foes: BTreeMap<FighterId, Vec<u64>>,
    own: BTreeMap<PlayerId, Vec<f64>>,
    public: Option<PublicSeen>,
    parked: Rc<[Parked]>,
}

/// The tick being sent: everyone and everything as the room stands after it.
#[derive(Debug, Default)]
struct Now {
    tick: u64,
    players: Vec<Seen>,
    foes: Vec<FoeSeen>,
    shots: Vec<combat::Shot>,
    spells: Vec<SpellSeen>,
    cache: Option<[f64; 5]>,
    revives: Option<u8>,
    public: Option<PublicSeen>,
    encounter: Option<room::encounters::EncounterSeen>,
    outpost: u32,
    breach: Option<room::breach::seen::BreachSeen>,
    reviving: Vec<Reviving>,
    arrivals: Vec<room::ArrivalSeen>,
}

#[derive(Debug, Default)]
pub struct Sent {
    /// The room's middle, which others' numbers are measured from (`pack::middle_of`); the world's for a course.
    middle: [f64; 2],
    held: VecDeque<Held>,
    now: Option<Now>,
    events: VecDeque<Event>,
    dresses: VecDeque<(u64, PlayerId, String)>,
    plates: VecDeque<(u64, PlayerId, Plate)>,
    lines: VecDeque<(u64, Line)>,
    /// The ships parked at the room's island, each with its player's account (`parked_door`).
    parked: Rc<[Parked]>,
}

/// A ship parked at the room's island: its player's account, the number it is sent under, and the ship and its looks.
pub type Parked = (String, PlayerId, room::sea::Ship, room::sea::ShipLook);

/// What a player's figure shows and where they stand, as bytes to tell whether it changed.
fn look_bytes(seen: &Seen) -> Vec<u8> {
    let mut bytes = seen.shown.anim.as_bytes().to_vec();
    bytes.extend(seen.shown.frame.to_le_bytes());
    bytes.extend(seen.shown.facing.to_le_bytes());
    let (standing, ticks) = standing_parts(seen.standing);
    bytes.push(standing);
    bytes.extend(ticks.to_le_bytes());
    bytes
}

impl Sent {
    /// None sent yet, for a room whose middle is `middle`.
    #[must_use]
    pub fn around(middle: [f64; 2]) -> Self {
        Self { middle, ..Self::default() }
    }

    /// The ships parked at the room's island from now on.
    pub fn park(&mut self, ships: Vec<Parked>) {
        self.parked = ships.into();
    }

    /// The room's tick taken in, once whatever asks first: what happened since is kept, and how everyone stands.
    pub fn take(&mut self, room: &mut Room) {
        let (tick, middle) = (room.clock(), self.middle);
        if self.now.as_ref().is_some_and(|now| now.tick == tick) {
            return;
        }
        // An event the room told between its ticks carries the tick before; it is sent with this one, so a page that
        // showed that tick still hears it.
        self.events.extend(room.take_events().into_iter().map(|event| Event { tick: event.tick.max(tick), ..event }));
        self.dresses.extend(room.take_dress_changes().into_iter().map(|(player, dress)| (tick, player, dress)));
        self.plates.extend(room.take_plate_changes().into_iter().map(|(player, plate)| (tick, player, plate)));
        self.lines.extend(room.take_lines().into_iter().map(|line| (tick, line)));
        let now = Now {
            tick,
            players: room.seen().collect(),
            foes: room.foes_seen().collect(),
            shots: room.shots().copied().collect(),
            spells: room.spells_seen().collect(),
            cache: room.cache(),
            revives: room.revives(),
            public: room.public_seen(),
            encounter: room.encounter_seen(),
            outpost: room.outpost_plot(),
            breach: room.breach_seen(),
            reviving: room.reviving_seen(),
            arrivals: room.arrivals_seen().to_vec(),
        };
        let own: BTreeMap<_, _> = now
            .players
            .iter()
            .map(|seen| (seen.player, seen.fighter.to_floats()[..UNTRIMMED_FLOATS].to_vec()))
            .collect();
        let players = own.iter().map(|(player, floats)| (*player, quantized(floats, middle))).collect();
        let looks = now.players.iter().map(|seen| (seen.player, look_bytes(seen))).collect();
        let foes = now.foes.iter().map(|foe| (foe.foe, quantized(&foe_numbers(foe), middle))).collect();
        let public = now.public.clone();
        let parked = Rc::clone(&self.parked);
        self.held.push_back(Held { tick, players, looks, foes, own, public, parked });
        while self.held.len() > KEPT_TICKS {
            self.held.pop_front();
        }
        let oldest = self.held.front().map_or(tick, |held| held.tick);
        self.events.retain(|event| event.tick >= oldest);
        self.dresses.retain(|(at, ..)| *at >= oldest);
        self.plates.retain(|(at, ..)| *at >= oldest);
        self.lines.retain(|(at, _)| *at >= oldest);
        self.now = Some(now);
    }

    /// `viewer`'s snapshot after the room's last tick: everything changed since the tick their screen last showed, or
    /// everything when that tick is no longer kept; and what happened since it, or since they joined.
    pub fn snapshot_for(&mut self, room: &mut Room, viewer: PlayerId) -> Vec<u8> {
        self.take(room);
        let middle = self.middle;
        let (Some(now), Some(latest)) = (self.now.as_ref(), self.held.back()) else { return Vec::new() };
        let (shown, joined) = room.heard(viewer).map_or((0, now.tick), |(_, shown, joined)| (shown, joined));
        // The ships parked here, every one to everyone: a page that lost its own docking (reloaded) draws its own.
        let sent = |parked: &[Parked]| -> Vec<(PlayerId, room::sea::Ship, room::sea::ShipLook)> {
            parked.iter().map(|&(_, number, ship, look)| (number, ship, look)).collect()
        };
        let ships = sent(&latest.parked);
        // Tick 0 is a screen that showed nothing yet, never a base, even where a snapshot was taken before the first
        // tick. Parked ships left out stand as the base's, so a snapshot that has none where its base had some is sent
        // whole.
        let base = self.held.iter().find(|held| held.tick == shown && shown > 0 && shown < now.tick);
        let base = base.filter(|held| !ships.is_empty() || held.parked.is_empty());
        let ships = if base.is_some_and(|held| sent(&held.parked) == ships) { Vec::new() } else { ships };
        let changed = |was: Option<&Vec<u64>>, is: Option<&Vec<u64>>| base.is_none() || was != is;
        let looked = |id: &PlayerId| base.is_none_or(|held| held.looks.get(id) != latest.looks.get(id));
        let players: Vec<Seen> = now
            .players
            .iter()
            .filter(|seen| {
                seen.player == viewer
                    || looked(&seen.player)
                    || changed(base.and_then(|held| held.players.get(&seen.player)), latest.players.get(&seen.player))
            })
            .cloned()
            .collect();
        let foes: Vec<FoeSeen> = now
            .foes
            .iter()
            .filter(|foe| changed(base.and_then(|held| held.foes.get(&foe.foe)), latest.foes.get(&foe.foe)))
            .copied()
            .collect();
        let gone_players: Vec<PlayerId> = base
            .map(|held| held.players.keys().filter(|id| !latest.players.contains_key(id)).copied().collect())
            .unwrap_or_default();
        let gone_foes: Vec<FighterId> = base
            .map(|held| held.foes.keys().filter(|id| !latest.foes.contains_key(id)).copied().collect())
            .unwrap_or_default();
        let since = shown.max(joined);
        let events: Vec<Event> = self.events.iter().filter(|event| event.tick > since).copied().collect();
        let dressed: Vec<(PlayerId, &str)> = self
            .dresses
            .iter()
            .filter(|(at, ..)| *at > since)
            .map(|(_, player, dress)| (*player, dress.as_str()))
            .collect();
        // Only each player's newest plate since: a plate that changed every tick goes once, not once a tick.
        let newest: BTreeMap<PlayerId, &Plate> =
            self.plates.iter().filter(|(at, ..)| *at > since).map(|(_, player, plate)| (*player, plate)).collect();
        let plates: Vec<(PlayerId, Plate)> =
            newest.into_iter().map(|(player, plate)| (player, plate.clone())).collect();
        let lines: Vec<(u64, Line)> = self.lines.iter().filter(|(at, _)| *at > since).copied().collect();
        // The zone's events are left out while they stand as the page counts them on from the base (every tick's
        // snapshot would otherwise carry them whole, a raid's stores and banners among them, to every player).
        let counted = |held: &Held| {
            let elapsed = now.tick - held.tick;
            held.public.as_ref().map(|was| was.counted_on(elapsed)) == now.public
        };
        let public = now.public.as_ref().filter(|_| !base.is_some_and(counted));
        snapshot_bytes(&Snapshot {
            tick: now.tick,
            viewer,
            middle,
            base: base.map_or(0, |held| held.tick),
            gone_players: &gone_players,
            gone_foes: &gone_foes,
            own_base: base.and_then(|held| held.own.get(&viewer)).map(Vec::as_slice),
            base_players: base.map(|held| &held.players),
            base_foes: base.map(|held| &held.foes),
            players: &players,
            dressed: &dressed,
            plates: &plates,
            foes: &foes,
            events: &events,
            shots: &now.shots,
            lines: &lines,
            spells: &now.spells,
            cache: now.cache.as_ref().map_or(&[], |cache| cache.as_slice()),
            revives: now.revives,
            public,
            encounter: now.encounter.as_ref(),
            outpost: now.outpost,
            breach: now.breach.as_ref(),
            // The darkness is where the viewer lies, so the Court's holds only those in it (`Room::darkness_for`).
            darkness: room.darkness_for(viewer),
            reviving: &now.reviving,
            arrivals: &now.arrivals,
            ships: &ships,
            passage: room.passage_seen(viewer),
        })
    }
}
