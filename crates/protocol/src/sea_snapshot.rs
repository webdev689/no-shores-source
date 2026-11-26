//! The sea room's snapshot: every ship at sea, every hostile ship, each player's fight, each player off the helm on
//! their ship's deck, and what the sea keeps after its fights (what floats, each ship's kept hurts, what each player is
//! told, and each deck boarded), the islands each player sees or has found, and the traffic's friendly ships the room
//! has taken off their routes.

use crate::plates_wire::plates_vector;
use crate::{PlayerId, finish_snapshot, messages};
use movement::Body;
use naval::ranks::Commission;
use room::hostiles::Hostile;
use room::sea::Ship;

/// Everything at sea after the sea room's tick `tick`: every ship, every captain's with its faction, rank and hull,
/// each player's fight as the naval crate's numbers (`naval::wire::view_numbers`, its other captains parted off into a
/// field of their own) with its captain's commission and hull, and each player off the helm with the number of their
/// last step taken and their body on deck.
#[must_use]
pub fn sea_snapshot_bytes(
    tick: u64,
    ships: &[(PlayerId, Ship)],
    hostiles: &[Hostile],
    fights: &[room::battle::FightSeen],
    aboard: &[(PlayerId, u32, Body)],
    harbour: &SeaHarbour,
) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let each: Vec<_> = aboard
        .iter()
        .map(|&(player, acknowledged, body)| {
            let fighter = Some(builder.create_vector(&body.to_floats()));
            let anim = Some(builder.create_string(""));
            let args =
                messages::SeenArgs { player, acknowledged, anim, facing: body.facing, fighter, ..Default::default() };
            messages::Seen::create(&mut builder, &args)
        })
        .collect();
    let players = Some(builder.create_vector(&each));
    let each: Vec<_> = ships
        .iter()
        .map(|&(player, ship)| {
            let look = harbour.looks.iter().find(|(each, _)| *each == player).map(|(_, look)| *look);
            ship_offset(&mut builder, player, ship, look)
        })
        .collect();
    let ships = Some(builder.create_vector(&each));
    let each: Vec<_> = hostiles
        .iter()
        .map(|hostile| {
            let Hostile { id, x, y, heading, level, sight_m: sight, commission: Commission { faction, rank }, .. } =
                *hostile;
            let hull = rank.hull().number();
            let way = room::sighting::way_of(rank);
            let args =
                messages::HostileArgs { id, x, y, heading, faction, rank: rank.number(), hull, level, sight, way };
            messages::Hostile::create(&mut builder, &args)
        })
        .collect();
    let hostiles = Some(builder.create_vector(&each));
    let each: Vec<_> = fights
        .iter()
        .map(|room::battle::FightSeen { player, numbers, captain: commission, may_board }| {
            let (view, others) = naval::wire::parted(numbers);
            let (view, faction, rank) =
                (Some(builder.create_vector(&view)), commission.faction, commission.rank.number());
            let others = (!others.is_empty()).then(|| builder.create_vector(&others));
            let hull = commission.hull().number();
            messages::SeaFight::create(
                &mut builder,
                &messages::SeaFightArgs { player: *player, view, faction, rank, others, hull, may_board: *may_board },
            )
        })
        .collect();
    let fights = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .flotsam
        .iter()
        .map(|&(player, id, [x, y], kind)| {
            messages::Flotsam::create(&mut builder, &messages::FlotsamArgs { player, id, x, y, kind })
        })
        .collect();
    let flotsam = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .kept
        .iter()
        .map(|&(player, [hull, sail, crew], repair_left)| {
            messages::Kept::create(&mut builder, &messages::KeptArgs { player, hull, sail, crew, repair_left })
        })
        .collect();
    let kept = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .told
        .iter()
        .map(|(player, numbers)| {
            let numbers = Some(builder.create_vector(numbers));
            messages::Told::create(&mut builder, &messages::ToldArgs { player: *player, numbers })
        })
        .collect();
    let told = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .decks
        .iter()
        .map(|(aboard, hull, snapshot, hold_left)| {
            let players: Vec<PlayerId> = aboard.iter().map(|(player, _)| *player).collect();
            let boarders: Vec<PlayerId> = aboard.iter().map(|(_, boarder)| *boarder).collect();
            let (players, boarders) = (Some(builder.create_vector(&players)), Some(builder.create_vector(&boarders)));
            let snapshot = Some(builder.create_vector(snapshot));
            let hold_left = hold_left.map_or(-1, |ticks| i16::try_from(ticks).unwrap_or(i16::MAX));
            let args = messages::DeckArgs { players, boarders, hull: *hull, snapshot, hold_left };
            messages::Deck::create(&mut builder, &args)
        })
        .collect();
    let decks = Some(builder.create_vector(&each));
    let each: Vec<_> = harbour
        .islands
        .iter()
        .map(|&IsleSeen { id, seed, at: [x, y], kind, continent, found }| {
            messages::Isle::create(&mut builder, &messages::IsleArgs { id, seed, x, y, kind, continent, found })
        })
        .collect();
    // None when there are none, so a sea without islands sends the bytes it always did.
    let islands = (!each.is_empty()).then(|| builder.create_vector(&each));
    let each: Vec<_> = harbour
        .friendlies
        .iter()
        .map(|&room::friendlies::Friendly { traffic, x, y, heading, hull, .. }| {
            let args = messages::FriendlyArgs { traffic, x, y, heading, hull: hull.number() };
            messages::Friendly::create(&mut builder, &args)
        })
        .collect();
    let friendlies = (!each.is_empty()).then(|| builder.create_vector(&each));
    let taken = (!harbour.taken.is_empty()).then(|| builder.create_vector(&harbour.taken));
    let plates = (!harbour.plates.is_empty()).then(|| plates_vector(&mut builder, &harbour.plates));
    let each: Vec<_> = harbour
        .charted
        .iter()
        .map(|(player, [x, y], name)| {
            let name = (!name.is_empty()).then(|| builder.create_string(name));
            messages::Charted::create(&mut builder, &messages::ChartedArgs { player: *player, x: *x, y: *y, name })
        })
        .collect();
    let charted = (!each.is_empty()).then(|| builder.create_vector(&each));
    let args = messages::SnapshotArgs {
        tick,
        players,
        ships,
        hostiles,
        fights,
        flotsam,
        kept,
        told,
        decks,
        islands,
        taken,
        friendlies,
        plates,
        charted,
        ..messages::SnapshotArgs::default()
    };
    finish_snapshot(builder, &args)
}

/// A ship as a snapshot carries it: its player's number, where it lies, its heading and the pace it sailed at, and its
/// looks, the Sloop as built for none.
pub(crate) fn ship_offset<'built>(
    builder: &mut flatbuffers::FlatBufferBuilder<'built>,
    player: PlayerId,
    Ship { x, y, heading, rate, .. }: Ship,
    look: Option<room::sea::ShipLook>,
) -> flatbuffers::WIPOffset<messages::Ship<'built>> {
    let built = || (gear::ship::fleet::Dress::default().numbers(), [gear::ship::fleet::NO_WORD; 2]);
    let (dress, name) = look.map_or_else(built, |look| (look.dress, look.name));
    let (dress, name) = (Some(builder.create_vector(&dress)), Some(builder.create_vector(&name)));
    let (hull, emblem) = look.map_or((0, 0), |look| (look.hull, look.emblem));
    let args = messages::ShipArgs { player, x, y, heading, pace: rate, hull, dress, name, emblem };
    messages::Ship::create(builder, &args)
}

/// What the sea's snapshot carries beside its ships and fights: each piece of what floats (its player, its number,
/// where it floats and its kind, 0 a crate, 1 a barrel, 2 a chest), each player's ship's kept hurts with the seconds
/// its repair has left, what each player is told this tick, and each deck boarded (each boarder's number at sea with
/// theirs on its deck, its hull, and its deck room's snapshot), the islands the player sees or has found, each traffic
/// id the room has taken off its route, the friendly ships it keeps at sea, the plate over each other player's ship
/// the player is sent, and the sea's chart when it is sent (`charted`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SeaHarbour {
    pub flotsam: Vec<(PlayerId, u32, [f64; 2], u8)>,
    pub kept: Vec<(PlayerId, [f64; 3], f64)>,
    pub told: Vec<(PlayerId, Vec<f64>)>,
    pub decks: Vec<SeaDeck>,
    pub islands: Vec<IsleSeen>,
    pub taken: Vec<u64>,
    pub friendlies: Vec<room::friendlies::Friendly>,
    pub plates: Vec<(PlayerId, room::Plate)>,
    /// How each player's ship looks, the player's own among them (`Sea::look`); a ship with none is the Sloop as built.
    pub looks: Vec<(PlayerId, room::sea::ShipLook)>,
    /// Every ship in the room, the player's own among them, with its captain's name, for the held map: sent about once
    /// a second, empty between.
    pub charted: Vec<(PlayerId, [f64; 2], String)>,
}

/// A sea island as a player is told of it: its number and seed, where its middle is, its kind's number, its water's
/// continent's index, and whether they have found it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IsleSeen {
    pub id: u32,
    pub seed: u64,
    pub at: [f64; 2],
    pub kind: u8,
    pub continent: u8,
    pub found: bool,
}

/// A deck boarded as the snapshot carries it: each boarder's number at sea with theirs on its deck, its hull, its deck
/// room's snapshot, and the sea's ticks its won deck holds its boarders yet (none while its crew still fights).
pub type SeaDeck = (Vec<(PlayerId, PlayerId)>, u8, Vec<u8>, Option<u64>);
