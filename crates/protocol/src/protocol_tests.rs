use super::*;
use crate::pack::unpack;
use combat::Shot;
use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::{Action, Side, Weight, fighter, player};
use combat::shots::Line;
use combat::shots::loose;
use combat::{CombatInput, Fighter};
use movement::{Controls, Flat, TICK_SECONDS, standing, step_body};
use naval::ranks::Commission;
use room::pirates::Pirate;
use room::sea::Ship;
use room::{Event, FoeSeen, Seen};
use room::{EventKind, How};

use crate::public_wire_tests::public;

/// An input with these controls and nothing else.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing inside, one after half
/// a second's walk at a bearing of 0.3, swinging a sword at its target, foe 12, warned with 432 ticks left, Veiled for
/// 150 ticks and Hasted for 30 by player 7; and the dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], &Flat, TICK_SECONDS));
    let swinging = Shown { anim: "attack_sword".to_owned(), frame: 4, facing: 0.75 };
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };
    let mut fighting = player(walked, sword);
    fighting.target = Some(12);
    fighting.stamina = 88.0;
    fighting = combat::give(&fighting, combat::Status::Veiled, 150, Some(7)).unwrap();
    fighting = combat::give(&fighting, combat::Status::Haste, 30, Some(7)).unwrap();
    vec![
        Seen {
            player: 7,
            acknowledged: 0,
            fighter: player(standing(1.5, -2.25), combat::arms::BARE_HANDS),
            standing: Standing::Inside,
            shown: Shown::default(),
        },
        Seen {
            player: 9,
            acknowledged: 30,
            fighter: fighting,
            standing: Standing::Warned { ticks_left: 432 },
            shown: swinging,
        },
    ]
}

/// The foe the client's test expects: a pirate brute (type 15) of the Elite rank, foe 12, in its first phase,
/// staggered with 40 of its 130 health gone, alert to the player its lock is on, Exposed for 200 ticks and immune to a
/// Charge for 90, standing under a name of its own.
pub fn foes() -> Vec<FoeSeen> {
    let warhammer = Arms { melee: WeaponClass::Warhammer, ranged: None, off_hand: OffHand::Empty };
    let mut brute = fighter(Side::Faction(2), standing(3.0, -6.0), warhammer, Weight::Heavy, 130.0, 70.0);
    brute.health = 90.0;
    brute.target = Some(9);
    brute.action = Action::Staggered { left: 30, cause: combat::fighter::Cause::Parried };
    brute = combat::give(&brute, combat::Status::Expose, 200, Some(9)).unwrap();
    brute.statuses.charge_immune = 90;
    let brute = FoeSeen {
        foe: 12,
        kind: 3,
        foe_type: 15,
        rank: 3,
        faction: 2,
        phase: 1,
        alert: 2,
        fighter: brute,
        level: 7,
        shield: Some(gear::element::Shield::whole(gear::Element::Cosmic, 80.0)),
        companion: None,
        name: "The Warden of the Fissure",
    };
    // An officer ashore beside player 9: a pirate swordsman's figure on the players' side.
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Shield };
    let mate = fighter(Side::Players, standing(1.0, 1.8), sword, Weight::Medium, 100.0, 50.0);
    let companion = room::Companion {
        leader: 9,
        officer: 1,
        post: gear::crew::Post::Lookout,
        given: 2,
        family: 5,
        level: 4,
        brawler: false,
        out: false,
    };
    let ashore = FoeSeen { foe: 13, kind: 2, foe_type: 14, faction: 0, fighter: mate, level: 4, name: "", ..brute };
    vec![brute, FoeSeen { shield: None, companion: Some(companion), ..ashore }]
}

pub const EVENTS: [Event; 2] = [
    Event {
        tick: 1233,
        kind: EventKind::Parried,
        how: Some(How::Swing),
        striker: 12,
        defender: 9,
        amount: 0.0,
        stroke: None,
        crit: false,
        element: 0,
    },
    Event {
        tick: 1234,
        kind: EventKind::Hit,
        how: Some(How::Riposte),
        striker: 9,
        defender: 12,
        amount: 35.0,
        stroke: Some(Stroke::Left),
        crit: true,
        element: 2,
    },
];

fn shots() -> Vec<Shot> {
    vec![loose(12, Ranged::Bow, [3.0, -6.0, 1.1], 0.5, 0.1, 1.0)]
}

/// Foe 12's ball, six ticks out east from (4, -6, 1.1) at 60 m/s, stopped half a metre into its seventh tick.
fn lines() -> Vec<(u64, Line)> {
    let ball =
        Shot { ranged: Ranged::Pistolet, at: [10.0, -6.0, 1.1], velocity: [60.0, 0.0, 0.0], age: 6, ..shots()[0] };
    vec![(1233, combat::shots::stopped_line(&ball, [10.5, -6.0, 1.1]))]
}

const DRESSED: [(PlayerId, &str); 1] = [(7, r#"{"body":"male"}"#)];

/// A Dawnflare heading to its end, and a Duskraven's bolt seeking a foe.
const SPELLS: [room::SpellSeen; 2] = [
    room::SpellSeen {
        id: 4,
        kind: 6,
        caster: 7,
        art: 2,
        at: [1.0, -2.0, 1.1],
        heads: Some([1.0, -26.0, 1.1]),
        seeks: None,
        age: 30,
        life: 96,
        radius: 3.0,
    },
    room::SpellSeen {
        id: 9,
        kind: room::BOLT,
        caster: 7,
        art: 3,
        at: [0.5, 0.0, 2.0],
        heads: None,
        seeks: Some(12),
        age: 2,
        life: 88,
        radius: 0.0,
    },
];
/// The node and rect the client's test expects in the welcome.
const NODE: (&str, [f64; 4]) = ("overlook-social", [2_808_986.0, 1_201_139.0, 2_809_442.0, 1_201_455.5]);
/// The ships the client's test expects in the sea's snapshot.
const PIRATES: [Pirate; 1] = [Pirate {
    id: 4,
    seed: 9,
    commission: Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Elite },
    level: 23,
    sight_m: 25_920.0,
    x: 1_000.5,
    y: 2_000.25,
    heading: 1.5,
    bold: true,
    quarry: None,
}];

/// Deep, still water everywhere.
struct Open;

impl sailing::waters::Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> sailing::waters::Spot {
        sailing::waters::Spot { bed: -50.0, surface: Some(0.0) }
    }
}

/// Two fights as a snapshot carries them: each its player, and its view with the player's look laid to starboard, the
/// captain's port guns run out and the player's stem ramming it; player 2's with a pirate fighting too, player 5's the
/// same fight without it (the client's test reads both back).
fn fights_seen() -> Vec<room::battle::FightSeen> {
    let at = |x: f64, y: f64, heading: f64| sailing::ship::Ship {
        x,
        y,
        heading,
        ahead: 0.0,
        abeam: 0.0,
        turn: 0.0,
        sail_way: 0.0,
        rung: 2,
    };
    let pirate_elite = Commission { faction: naval::ranks::PIRATES, rank: naval::ranks::Rank::Elite };
    let captains = [(at(0.0, -700.0, 3.0), TITHE_MINIBOSS, 7), (at(400.0, -700.0, 0.5), pirate_elite, 8)];
    let aim = naval::fight::Aim { bearing_deg: 90.0, range_m: 80.0, ray: None };
    let (player, captain) = (naval::fight::PLAYER, naval::fight::CAPTAIN);
    let events = [
        naval::fight::Event::RunOut { ship: captain, side: naval::arms::Side::Port },
        naval::fight::Event::Ram { ship: captain, by: player, point: [1.0, 2.0, 3.0], dealt: 4.5 },
    ];
    let view = |captains: &[(sailing::ship::Ship, Commission, u32)]| {
        let mut fight = naval::fight::Fight::among(captains, &Open, 0.0);
        fight.put_to_sea(player, at(0.0, 0.0, 0.0), &Open, 0.0);
        naval::wire::view_numbers(&fight, naval::fight::PLAYER, &events, Some(&aim), &Open, 0.0)
    };
    let seen =
        |player, numbers, may_board| room::battle::FightSeen { player, numbers, captain: TITHE_MINIBOSS, may_board };
    vec![seen(2, view(&captains), true), seen(5, view(&captains[..1]), false)]
}

/// The captain of the fight the client's test reads: a Miniboss of the Grey Tithe.
const TITHE_MINIBOSS: Commission = Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Miniboss };

const SHIPS: [(PlayerId, Ship); 2] = [
    (3, Ship { x: 50_000.0, y: 149_880.25, heading: 0.0, pace: 60, rate: 5 }),
    (4, Ship { x: 61_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0, rate: 0 }),
];

/// The room's middle the test snapshot measures others from, as a node's rect (-1, -4, 3, 0) floors it.
const MIDDLE: [f64; 2] = [1.0, -2.0];

/// The test snapshot, for player 9: whole, building on nothing.
fn snapshot<'snapshot>(
    players: &'snapshot [Seen],
    foes: &'snapshot [FoeSeen],
    (shots, lines): (&'snapshot [Shot], &'snapshot [(u64, Line)]),
    public: &'snapshot room::public::PublicSeen,
) -> Snapshot<'snapshot> {
    Snapshot {
        tick: 1234,
        viewer: 9,
        middle: MIDDLE,
        base: 0,
        gone_players: &[],
        gone_foes: &[],
        own_base: None,
        base_players: None,
        base_foes: None,
        players,
        dressed: &DRESSED,
        foes,
        events: &EVENTS,
        shots,
        lines,
        spells: &SPELLS,
        public: Some(public),
    }
}

/// Whether `read` is `sent` packed and unpacked: each within half a thousandth.
fn near(sent: &[f64], read: &[f64]) -> bool {
    sent.len() == read.len()
        && sent.iter().zip(read).all(|(one, two)| (one - two).abs() <= 0.0005 + 1e-9 || (one.is_nan() && two.is_nan()))
}

/// The dresses a message holds.
fn dressed_in(
    dressed: Option<flatbuffers::Vector<'_, flatbuffers::ForwardsUOffset<messages::Dressed<'_>>>>,
) -> Vec<(u32, String)> {
    dressed.unwrap().iter().map(|each| (each.player(), each.dress().unwrap_or_default().to_owned())).collect()
}

#[test]
fn an_input_reads_back_as_its_number_intent_look_dress_arms_view_ask_and_respawn() {
    let shown = Shown { anim: "ride_gallop".to_owned(), frame: 3, facing: -1.5 };
    let controls = Controls { forward: 1.0, sideways: -0.5, yaw: 0.3, run: true, crouch: true, ..Controls::default() };
    let combat = CombatInput {
        attack: Some(Stroke::Up),
        guard: true,
        dodge: false,
        shoot: true,
        pitch: -0.2,
        aim: true,
        mark: Some([1.0, -2.0, 1.5]),
        heal: true,
        telegraph: None,
    };
    let sent = Input {
        sequence: 42,
        intent: Intent { controls, combat },
        shown,
        dress: Some("dressed".to_owned()),
        arms: Arms { melee: WeaponClass::Dagger, ranged: None, off_hand: OffHand::Shield }.code(),
        seen: 977,
        spawn: Some(SpawnAsk::Foe { foe_type: 12, rank: 5, shield: 2 }),
        respawn: true,
        ask: Some(room::Asked::Gear(gear::Ask::Feed { item: 4 })),
        spawn_level: 12,
        cast: Some(room::Cast { spell: 8, aim: Some([3.0, -12.5, 0.25]) }),
    };
    assert_eq!(read_input(&input_bytes(&sent)).unwrap(), sent);
    let unaimed = Input { cast: Some(room::Cast { spell: 2, aim: None }), ..sent.clone() };
    assert_eq!(read_input(&input_bytes(&unaimed)).unwrap(), unaimed);
    let badly = Input { cast: Some(room::Cast { spell: 8, aim: Some([f64::NAN, 0.0, 0.0]) }), ..sent.clone() };
    assert_eq!(read_input(&input_bytes(&badly)).unwrap().cast, Some(room::Cast { spell: 8, aim: None }));
    let clearing = Input { spawn: Some(SpawnAsk::Clear), ..input(2, Controls::default()) };
    assert_eq!(read_input(&input_bytes(&clearing)).unwrap(), clearing);
    let plain = read_input(&input_bytes(&input(1, Controls::default()))).unwrap();
    let asked = (plain.dress, plain.spawn, plain.intent.combat, plain.respawn);
    assert_eq!(asked, (None, None, CombatInput::default(), false));
    // An input with no fight's numbers at all asks nothing in the fight, and lays no aim's mark at the world's origin.
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(&[0.0; CONTROLS_FLOATS]));
    let bare = messages::Input::create(&mut builder, &messages::InputArgs { controls, ..Default::default() });
    builder.finish(bare, None);
    assert_eq!(read_input(builder.finished_data()).unwrap().intent.combat, CombatInput::default());
}

#[test]
fn a_foe_asked_for_by_its_role_alone_is_the_pirates_type_in_that_role() {
    let asked = |role: u8| {
        let mut builder = flatbuffers::FlatBufferBuilder::new();
        let controls = Some(builder.create_vector(&[0.0; CONTROLS_FLOATS]));
        let args = messages::InputArgs { controls, spawn: role, ..Default::default() };
        let message = messages::Input::create(&mut builder, &args);
        builder.finish(message, None);
        read_input(builder.finished_data()).unwrap().spawn
    };
    let foe = |foe_type, rank| Some(SpawnAsk::Foe { foe_type, rank, shield: 0 });
    // The pirates' Skirmisher to their Brute and Archer as Majors; their Captain at his first rank, an Elite.
    let roles: Vec<_> = (1..=5).map(asked).collect();
    assert_eq!(roles, [foe(13, 2), foe(14, 2), foe(15, 2), foe(16, 2), foe(17, 3)]);
    assert_eq!((asked(0), asked(6), asked(CLEAR_FOES)), (None, None, Some(SpawnAsk::Clear)));
    // A shield's element rides above the role's four bits.
    let shielded = Some(SpawnAsk::Foe { foe_type: 14, rank: 2, shield: 3 });
    assert_eq!(asked(2 | (3 << room::SHIELD_SHIFT)), shielded);
}

#[test]
fn bytes_that_are_not_an_input_and_numbers_of_the_wrong_count_are_refused() {
    assert!(read_input(&[]).is_err());
    assert!(read_input(&[0xff; 7]).is_err());
    let whole = input_bytes(&input(1, Controls::default()));
    assert!(read_input(&whole[..whole.len() / 2]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let controls = Some(builder.create_vector(&[0.0; 6]));
    let short = messages::Input::create(&mut builder, &messages::InputArgs { controls, ..Default::default() });
    builder.finish(short, None);
    assert_eq!(read_input(builder.finished_data()), Err("controls are 7 numbers, not 6".to_owned()));
}

#[test]
fn a_course_reads_back_as_its_points_and_pace_and_odd_numbers_are_refused() {
    let points = [[50_000.0, 150_000.5], [51_000.0, 149_000.0]];
    assert_eq!(read_course(&course_bytes(&points, 20)), Ok((points.to_vec(), 20)));
    assert_eq!(read_course(&course_bytes(&[], 5)), Ok((Vec::new(), 5)));
    assert!(read_course(&[1, 2, 3]).is_err());
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = Some(builder.create_vector(&[1.0, 2.0, 3.0]));
    let course =
        messages::Course::create(&mut builder, &messages::CourseArgs { points: odd, pace: 5, ..Default::default() });
    builder.finish(course, None);
    assert_eq!(read_course(builder.finished_data()), Err("a course's points are pairs, not 3 numbers".to_owned()));
}

#[test]
fn every_standing_crosses_and_comes_back() {
    for standing in [
        Standing::Inside,
        Standing::Warned { ticks_left: 599 },
        Standing::Dead { ticks: 241, fell: false },
        Standing::Dead { ticks: 3, fell: true },
    ] {
        let (kind, ticks) = standing_parts(standing);
        assert_eq!(standing_of(kind, ticks), standing);
    }
}

#[test]
fn a_welcome_and_snapshots_read_back_to_the_bit() {
    let welcome = joined_bytes(7, &DRESSED, Some(NODE), 1_234_567.25);
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap().joined().unwrap();
    assert_eq!((joined.player(), joined.node(), joined.epoch()), (7, Some(NODE.0), 1_234_567.25));
    assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), NODE.1);
    assert_eq!(dressed_in(joined.dressed()), vec![(7, DRESSED[0].1.to_owned())]);
    let plain = joined_bytes(7, &[], None, 0.0);
    let plain = flatbuffers::root::<messages::FromRoom>(&plain).unwrap().joined().unwrap();
    assert_eq!((plain.node(), plain.bounds().is_none()), (None, true));

    let (players, foes, shots, lines, public) = (players(), foes(), shots(), lines(), public());
    let bytes = snapshot_bytes(&snapshot(&players, &foes, (&shots, &lines), &public));
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(read.tick(), 1234);
    let read_players: Vec<_> = read.players().unwrap().iter().collect();
    assert_eq!(read_players.iter().map(messages::Seen::player).collect::<Vec<_>>(), [7, 9]);
    assert!(read_players[0].fighter().is_none(), "another player's fighter crosses packed");
    let other = unpack(read_players[0].packed().unwrap().bytes(), crate::UNTRIMMED_FLOATS, MIDDLE).unwrap();
    assert!(near(&players[0].fighter.to_floats()[..crate::UNTRIMMED_FLOATS], &other));
    // The player the snapshot is for has their fighter whole, less its trim: put back the plain one they wear.
    let mut own: Vec<f64> = read_players[1].fighter().unwrap().iter().collect();
    assert_eq!(own.len(), crate::UNTRIMMED_FLOATS);
    assert_eq!(body_of(&own[..22]), Some(players[1].fighter.body));
    own.extend(combat::Trim::PLAIN.to_floats());
    assert_eq!(Fighter::from_floats(&own.try_into().unwrap()), players[1].fighter);
    assert!(read_players[1].packed().is_none());
    assert_eq!(read.middle().unwrap().iter().collect::<Vec<_>>(), MIDDLE, "it says what others are measured from");
    let standings: Vec<Standing> =
        read.players().unwrap().iter().map(|seen| standing_of(seen.standing(), seen.standing_ticks())).collect();
    assert_eq!(standings, players.iter().map(|seen| seen.standing).collect::<Vec<_>>());
    let foe = read.foes().unwrap().get(0);
    let numbers = unpack(foe.packed().unwrap().bytes(), crate::land::FOE_NUMBERS, MIDDLE).unwrap();
    assert!(foe.changed().is_none(), "a foe in a whole snapshot crosses whole");
    let (glance, rest) = numbers.split_at(combat::floats::GLANCE_FLOATS);
    assert_eq!(foe.id(), 12);
    assert!(near(&foes[0].fighter.glance(), glance), "a foe's glance crosses packed");
    // Its role, type, rank, faction, phase, alertness and level; its shield; its debuffs' ticks; no one's companion.
    assert_eq!(rest, [3.0, 15.0, 3.0, 2.0, 1.0, 2.0, 7.0, 3.0, 40.0, 40.0, 200.0, 0.0, 90.0, 0.0, 0.0, 0.0, 0.0]);
    assert_eq!(foe.name(), Some("The Warden of the Fissure"), "the name it stands under crosses");
    let event = read.public_event().unwrap();
    let counts = (event.kind(), event.phase(), event.ticks_left(), event.next_kind(), event.next_ticks());
    assert_eq!(counts, (1, 1, 12_000, 2, 25_200));
    let stood = (event.stage(), event.stages(), event.progress(), event.needed(), event.heroic(), event.bonus());
    assert_eq!(stood, (2, 2, 11, 14, 2, true));
    assert_eq!(event.ground().unwrap().iter().collect::<Vec<_>>(), public.ground.to_vec());
    let marks: Vec<_> = event.marks().unwrap().iter().map(|mark| (mark.kind(), mark.id(), mark.health())).collect();
    assert_eq!(marks, vec![(1, 0, 0.25), (5, 9, 1.0)]);
    let ashore = read.foes().unwrap().get(1);
    let numbers = unpack(ashore.packed().unwrap().bytes(), crate::land::FOE_NUMBERS, MIDDLE).unwrap();
    // A companion's leader, given and family names, and post (the Lookout), last.
    assert_eq!(numbers[crate::land::FOE_NUMBERS - 4..], [9.0, 2.0, 5.0, 4.0]);
    assert_eq!(ashore.name(), None, "and no name of an event's");
    let events: Vec<_> =
        read.events().unwrap().iter().map(|event| (event.tick(), event.kind(), event.how(), event.amount())).collect();
    assert_eq!(events, vec![(1233, 3, 1, 0.0), (1234, 1, 2, 35.0)]);
    let marked: Vec<_> = read.events().unwrap().iter().map(|event| (event.crit(), event.element())).collect();
    assert_eq!(marked, vec![(false, 0), (true, 2)], "a crit and a blow's element cross");
    let flying = read.shots().unwrap().get(0);
    assert_eq!((flying.owner(), flying.ranged()), (12, 1));
    assert_eq!(flying.at().unwrap().iter().collect::<Vec<_>>(), shots[0].at.to_vec());
    assert!(flying.muzzle().is_none(), "a shot still flying carries no muzzle");
    let stopped = read.shots().unwrap().get(1);
    let ends = |shot: messages::Flying<'_>| {
        [shot.at(), shot.velocity(), shot.muzzle()].map(|part| part.map(|numbers| numbers.iter().collect::<Vec<_>>()))
    };
    let (stopped_at, line) = lines[0];
    assert_eq!((flying.stopped(), stopped.stopped()), (0, stopped_at), "a stopped ball carries the tick it stopped");
    let sent = [Some(line.last.at.to_vec()), Some(line.last.velocity.to_vec()), Some(line.muzzle.to_vec())];
    assert_eq!((stopped.age(), ends(stopped)), (6, sent), "a stopped ball's last segment, and where it left its gun");
    assert!(read.ships().is_none());
    let spells: Vec<_> = read.spells().unwrap().iter().collect();
    let numbers = |spell: &messages::Spell<'_>| (spell.id(), spell.kind(), spell.caster(), spell.art(), spell.seeks());
    assert_eq!(spells.iter().map(numbers).collect::<Vec<_>>(), [(4, 6, 7, 2, 0), (9, 10, 7, 3, 12)]);
    let heads = spells[0].heads().map(|heads| heads.iter().collect::<Vec<_>>());
    let told = (heads, spells[0].age(), spells[0].life(), spells[0].radius());
    assert_eq!(told, (Some(vec![1.0, -26.0, 1.1]), 30, 96, 3.0));
    assert!(spells[1].heads().is_none(), "a bolt seeks; it heads nowhere");

    let bytes = sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen(), &aboard_seen(), &SeaHarbour::default());
    let sea = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    let ships: Vec<(PlayerId, Ship)> = sea
        .ships()
        .unwrap()
        .iter()
        .map(|ship| {
            (
                ship.player(),
                Ship { x: ship.x(), y: ship.y(), heading: ship.heading(), pace: ship.pace(), rate: ship.pace() },
            )
        })
        .collect();
    // The pace a ship crosses at is the one it sailed at, held down near a pirate, not the one asked.
    let sent = SHIPS.map(|(player, ship)| (player, Ship { pace: ship.rate, ..ship }));
    assert_eq!((sea.tick(), ships), (77, sent.to_vec()));
    let pirate = sea.pirates().unwrap().get(0);
    assert_eq!((pirate.id(), pirate.x(), pirate.y(), pirate.heading()), (4, 1_000.5, 2_000.25, 1.5));
    let commission = PIRATES[0].commission;
    assert_eq!((pirate.faction(), pirate.rank()), (commission.faction, commission.rank.number()));
    assert_eq!(pirate.hull(), commission.hull().number(), "it sails its rank's hull");
    assert_eq!((pirate.level(), pirate.sight()), (23, 25_920.0), "its level and the distance it is sighted from");
    assert!((pirate.way() - 2.64).abs() < 1e-12, "an Elite's way at sea: {}", pirate.way());
    let fight = sea.fights().unwrap().get(0);
    assert_eq!((fight.faction(), fight.rank()), (1, 4), "the fight's captain a Grey Tithe Miniboss");
    assert_eq!(fight.hull(), sailing::HullKind::Brig.number(), "in a Brig");
    assert!(fight.may_board() && !sea.fights().unwrap().get(1).may_board(), "whether each player may board");
    let numbers =
        |numbers: Option<flatbuffers::Vector<'_, f64>>| -> Option<Vec<f64>> { Some(numbers?.iter().collect()) };
    let alone = sea.fights().unwrap().get(1);
    // A page that knows one captain reads the view whole, the same with others in the fight or without them.
    assert_eq!((fight.player(), numbers(fight.view())), (2, numbers(alone.view())));
    let (seen, others): (Vec<f64>, Vec<f64>) = (fights_seen()[0].numbers.clone(), numbers(fight.others()).unwrap());
    assert_eq!((others[0], others.len()), (1.0, 1 + 3 + naval::wire::VESSEL_NUMBERS + 4), "one other captain");
    assert!(seen.windows(others.len()).any(|part| part == others), "its numbers as the fight's view holds them");
    assert_eq!((alone.player(), numbers(alone.others())), (5, None), "none, as a room from before others sends it");
    let walker = sea.players().unwrap().get(0);
    let body = body_of(&walker.fighter().unwrap().iter().collect::<Vec<_>>());
    assert_eq!((walker.player(), walker.acknowledged(), body), (3, 41, Some(aboard_seen()[0].2)));
}

/// A player off the helm on their deck, in their ship's frame: their number, their last step taken, their body.
fn aboard_seen() -> Vec<(PlayerId, u32, Body)> {
    vec![(3, 41, Body { z: 0.8, facing: 0.5, ..standing(0.25, 2.5) })]
}

#[test]
fn a_step_of_a_walk_on_deck_and_the_helm_cross_in_a_course_message() {
    let controls = Controls { forward: 1.0, sideways: -0.5, yaw: 0.25, run: true, ..Controls::default() };
    assert_eq!(read_sea_input(&walk_bytes(12, &controls)), Ok(SeaInput::Walk(12, controls)));
    assert_eq!(read_sea_input(&helm_bytes(true)), Ok(SeaInput::LeaveHelm));
    assert_eq!(read_sea_input(&helm_bytes(false)), Ok(SeaInput::TakeHelm));
    assert_eq!(read_sea_input(&face_bytes(1.25)), Ok(SeaInput::Face(1.25)));
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let (points, facing) = (Some(builder.create_vector(&[1.0, 2.0])), Some(builder.create_vector(&[0.5])));
    let args = messages::CourseArgs { points, facing, ..Default::default() };
    let both = messages::Course::create(&mut builder, &args);
    builder.finish(both, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "a course's legs turn it, not a facing");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let facing = Some(builder.create_vector(&[0.5, 1.0]));
    let two = messages::Course::create(&mut builder, &messages::CourseArgs { facing, ..Default::default() });
    builder.finish(two, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "it faces one heading");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let walk = Some(builder.create_vector(&[1.0, 0.0]));
    let short = messages::Course::create(&mut builder, &messages::CourseArgs { walk, ..Default::default() });
    builder.finish(short, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "a step's controls are all its numbers");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = messages::Course::create(&mut builder, &messages::CourseArgs { helm: 4, ..Default::default() });
    builder.finish(odd, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "the helm is left or taken, or a chase, nothing else");
    assert_eq!(read_sea_input(&chase_bytes(7)), Ok(SeaInput::Chase(Some(7))), "a chase of ship 7");
    assert_eq!(read_sea_input(&chase_bytes(0)), Ok(SeaInput::Chase(None)), "the chase let go");
}

#[test]
fn orders_cross_in_a_course_message_and_a_course_without_them_is_a_course() {
    let orders = Orders {
        helm: sailing::ship::Helm { steer: 0.5, climb: -1 },
        aim: None,
        fire: true,
        brace: false,
        load: None,
        boost: true,
    };
    assert_eq!(read_sea_input(&orders_bytes(&orders)), Ok(SeaInput::Orders(orders)));
    assert_eq!(read_sea_input(&course_bytes(&[[1.0, 2.0]], 5)), Ok(SeaInput::Course(vec![[1.0, 2.0]], 5)));
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    let (players, foes, shots, lines, public) = (players(), foes(), shots(), lines(), public());
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED, Some(NODE), 1_234_567.25)).unwrap();
    let snapshot = snapshot_bytes(&snapshot(&players, &foes, (&shots, &lines), &public));
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot).unwrap();
    let sea = sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen(), &aboard_seen(), &SeaHarbour::default());
    std::fs::write(format!("{folder}/sea.bin"), sea).unwrap();
}

#[test]
fn a_fighter_built_on_another_sends_only_the_numbers_that_changed() {
    let base = [1.0, 2.0, f64::NAN, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
    let now = [1.0, 2.5, f64::NAN, 4.0, 5.0, 6.0, 7.0, 8.0, -9.0];
    let (numbers, bits) = crate::land::changed_since(&now, &base);
    assert_eq!((numbers, bits), (vec![2.5, -9.0], vec![0b0000_0010, 0b0000_0001]), "a NaN that stays is no change");
    let (all, every) = crate::land::changed_since(&now, &base[..3]);
    assert_eq!((all.len(), every), (9, vec![0xff, 0x01]), "a base of another length changes every number");
}

/// An input whose earlier inputs are one table written once and pointed at again and again: small on the wire, yet a
/// reader that followed every pointer would read it thousands of times.
fn aliased_input(times: usize) -> Vec<u8> {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let mut heavy = input(1, Controls::default());
    heavy.shown.anim = "a".repeat(2_500);
    let once = input_offset(&mut builder, &heavy, None);
    let again = builder.create_vector(&vec![once; times]);
    let top = input_offset(&mut builder, &input(2, Controls::default()), Some(again));
    builder.finish(top, None);
    builder.finished_data().to_vec()
}

#[test]
fn an_input_pointing_at_one_earlier_input_again_and_again_is_refused_before_it_is_read_through() {
    let bytes = aliased_input(900);
    assert!(bytes.len() < 8_192, "it fits a message: {} bytes", bytes.len());
    for read in [read_inputs(&bytes).map(|_| ()), read_input(&bytes).map(|_| ())] {
        let refused = read.expect_err("refused");
        assert!(!refused.contains("earlier inputs, more than"), "the verifier stops it first: {refused}");
    }
    // As many as an input may carry, written once each, still read.
    let earlier: Vec<Input> = (1..=8).map(|sequence| input(sequence, Controls::default())).collect();
    assert_eq!(read_inputs(&inputs_bytes(&input(9, Controls::default()), &earlier)).expect("read").len(), 9);
}
