use super::*;
use combat::arms::{Arms, OffHand, Ranged, Stroke, WeaponClass};
use combat::fighter::{Action, Side, Weight, fighter, player};
use combat::shots::loose;
use combat::{CombatInput, Fighter};
use movement::{Controls, Flat, TICK_SECONDS, standing, step_body};
use room::{EventKind, How};

/// An input with these controls and nothing else.
fn input(sequence: u32, controls: Controls) -> Input {
    Input { sequence, intent: Intent { controls, ..Intent::default() }, ..Input::default() }
}

/// The two players the client's test of the same bytes expects (messages.test.ts): one standing inside, one after half
/// a second's walk at a bearing of 0.3, swinging a sword at its target, foe 12, warned with 432 ticks left; and the
/// dress the first sent.
pub fn players() -> Vec<Seen> {
    let walk = Controls { forward: 1.0, yaw: 0.3, ..Controls::default() };
    let walked = (0..30).fold(standing(1.5, -2.25), |body, _| step_body(&body, &walk, &[], &Flat, TICK_SECONDS));
    let swinging = Shown { anim: "attack_sword".to_owned(), frame: 4, facing: 0.75 };
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };
    let mut fighting = player(walked, sword);
    fighting.target = Some(12);
    fighting.stamina = 88.0;
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
/// staggered with 40 of its 130 health gone, alert to the player its lock is on.
pub fn foes() -> Vec<FoeSeen> {
    let warhammer = Arms { melee: WeaponClass::Warhammer, ranged: None, off_hand: OffHand::Empty };
    let mut brute = fighter(Side::Faction(2), standing(3.0, -6.0), warhammer, Weight::Heavy, 130.0, 70.0);
    brute.health = 90.0;
    brute.target = Some(9);
    brute.action = Action::Staggered { left: 30, cause: combat::fighter::Cause::Parried };
    vec![FoeSeen {
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
    }]
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
    },
    Event {
        tick: 1234,
        kind: EventKind::Hit,
        how: Some(How::Riposte),
        striker: 9,
        defender: 12,
        amount: 35.0,
        stroke: Some(Stroke::Left),
    },
];

fn shots() -> Vec<Shot> {
    vec![loose(12, Ranged::Bow, [3.0, -6.0, 1.1], 0.5, 0.1, 1.0)]
}

/// Foe 12's ball, six ticks out east from (4, -6, 1.1) at 60 m/s, stopped half a metre into its seventh tick.
fn lines() -> Vec<Line> {
    let ball =
        Shot { ranged: Ranged::Pistolet, at: [10.0, -6.0, 1.1], velocity: [60.0, 0.0, 0.0], age: 6, ..shots()[0] };
    vec![combat::shots::stopped_line(&ball, [10.5, -6.0, 1.1])]
}

const DRESSED: [(PlayerId, &str); 1] = [(7, r#"{"body":"male"}"#)];
/// The node and rect the client's test expects in the welcome.
const NODE: (&str, [f64; 4]) = ("overlook-social", [2_808_986.0, 1_201_139.0, 2_809_442.0, 1_201_455.5]);
/// The ships the client's test expects in the sea's snapshot.
const PIRATES: [Pirate; 1] = [Pirate { id: 4, seed: 9, x: 1_000.5, y: 2_000.25, heading: 1.5, bold: true }];

/// Deep, still water everywhere.
struct Open;

impl sailing::waters::Waters for Open {
    fn at(&self, _x: f64, _y: f64, _time: f64) -> sailing::waters::Spot {
        sailing::waters::Spot { bed: -50.0, surface: Some(0.0) }
    }
}

/// Two fights as a snapshot carries them: each its player, and its view with the player's look laid to starboard, the
/// captain's port guns run out and the player's stem ramming her; player 2's with a pirate fighting too, player 5's the
/// same fight without her (the client's test reads both back).
fn fights_seen() -> Vec<(PlayerId, Vec<f64>, Commission)> {
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
        naval::wire::view_numbers(&fight, &events, Some(&aim), &Open, 0.0)
    };
    vec![(2, view(&captains), TITHE_MINIBOSS), (5, view(&captains[..1]), TITHE_MINIBOSS)]
}

/// The captain of the fight the client's test reads: a Miniboss of the Grey Tithe.
const TITHE_MINIBOSS: Commission = Commission { faction: naval::ranks::GREY_TITHE, rank: naval::ranks::Rank::Miniboss };

const SHIPS: [(PlayerId, Ship); 2] = [
    (3, Ship { x: 50_000.0, y: 149_880.25, heading: 0.0, pace: 60, rate: 5 }),
    (4, Ship { x: 61_000.0, y: 149_000.0, heading: std::f64::consts::FRAC_PI_2, pace: 0, rate: 0 }),
];

fn snapshot<'snapshot>(
    players: &'snapshot [Seen],
    foes: &'snapshot [FoeSeen],
    shots: &'snapshot [Shot],
    lines: &'snapshot [Line],
) -> Snapshot<'snapshot> {
    Snapshot { tick: 1234, players, dressed: &DRESSED, foes, events: &EVENTS, shots, lines }
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
    };
    assert_eq!(read_input(&input_bytes(&sent)).unwrap(), sent);
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
    for standing in [Standing::Inside, Standing::Warned { ticks_left: 599 }, Standing::Dead { ticks: 241 }] {
        let (kind, ticks) = standing_parts(standing);
        assert_eq!(standing_of(kind, ticks), standing);
    }
}

#[test]
fn a_welcome_and_snapshots_read_back_to_the_bit() {
    let welcome = joined_bytes(7, &DRESSED, Some(NODE));
    let joined = flatbuffers::root::<messages::FromRoom>(&welcome).unwrap().joined().unwrap();
    assert_eq!((joined.player(), joined.node()), (7, Some(NODE.0)));
    assert_eq!(joined.bounds().unwrap().iter().collect::<Vec<_>>(), NODE.1);
    assert_eq!(dressed_in(joined.dressed()), vec![(7, DRESSED[0].1.to_owned())]);
    let plain = joined_bytes(7, &[], None);
    let plain = flatbuffers::root::<messages::FromRoom>(&plain).unwrap().joined().unwrap();
    assert_eq!((plain.node(), plain.bounds().is_none()), (None, true));

    let (players, foes, shots, lines) = (players(), foes(), shots(), lines());
    let bytes = snapshot_bytes(&snapshot(&players, &foes, &shots, &lines));
    let read = flatbuffers::root::<messages::FromRoom>(&bytes).unwrap().snapshot().unwrap();
    assert_eq!(read.tick(), 1234);
    let fighters: Vec<Fighter> = read
        .players()
        .unwrap()
        .iter()
        .map(|seen| {
            // A snapshot's fighter leaves out its trim: put back the plain one each test player wears.
            let mut floats: Vec<f64> = seen.fighter().unwrap().iter().collect();
            assert_eq!(floats.len(), crate::UNTRIMMED_FLOATS);
            floats.extend(combat::Trim::PLAIN.to_floats());
            Fighter::from_floats(&floats.try_into().unwrap())
        })
        .collect();
    assert_eq!(fighters, players.iter().map(|seen| seen.fighter).collect::<Vec<_>>());
    let bodies: Vec<_> = read
        .players()
        .unwrap()
        .iter()
        .map(|seen| body_of(&seen.fighter().unwrap().iter().take(22).collect::<Vec<_>>()))
        .collect();
    assert_eq!(bodies, players.iter().map(|seen| Some(seen.fighter.body)).collect::<Vec<_>>());
    let standings: Vec<Standing> =
        read.players().unwrap().iter().map(|seen| standing_of(seen.standing(), seen.standing_ticks())).collect();
    assert_eq!(standings, players.iter().map(|seen| seen.standing).collect::<Vec<_>>());
    let foe = read.foes().unwrap().get(0);
    let glance: [f64; combat::floats::GLANCE_FLOATS] =
        foe.glance().unwrap().iter().collect::<Vec<_>>().try_into().unwrap();
    assert_eq!((foe.id(), foe.kind(), glance), (12, 3, foes[0].fighter.glance()));
    let named = (foe.type_(), foe.rank(), foe.faction(), foe.phase(), foe.alert());
    assert_eq!(named, (15, 3, 2, 1, 2), "its type, rank, faction, phase and alertness cross");
    assert_eq!((foe.shield_element(), foe.shield(), foe.shield_most()), (3, 40.0, 40.0));
    let events: Vec<_> =
        read.events().unwrap().iter().map(|event| (event.tick(), event.kind(), event.how(), event.amount())).collect();
    assert_eq!(events, vec![(1233, 3, 1, 0.0), (1234, 1, 2, 35.0)]);
    let flying = read.shots().unwrap().get(0);
    assert_eq!((flying.owner(), flying.ranged()), (12, 1));
    assert_eq!(flying.at().unwrap().iter().collect::<Vec<_>>(), shots[0].at.to_vec());
    assert!(flying.muzzle().is_none(), "a shot still flying carries no muzzle");
    let stopped = read.shots().unwrap().get(1);
    let ends = |shot: messages::Flying<'_>| {
        [shot.at(), shot.velocity(), shot.muzzle()].map(|part| part.map(|numbers| numbers.iter().collect::<Vec<_>>()))
    };
    let line = lines[0];
    let sent = [Some(line.last.at.to_vec()), Some(line.last.velocity.to_vec()), Some(line.muzzle.to_vec())];
    assert_eq!((stopped.age(), ends(stopped)), (6, sent), "a stopped ball's last segment, and where it left its gun");
    assert!(read.ships().is_none());

    let bytes = sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen(), &aboard_seen());
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
    // The pace a ship crosses at is the one she sailed at, held down near a pirate, not the one asked.
    let sent = SHIPS.map(|(player, ship)| (player, Ship { pace: ship.rate, ..ship }));
    assert_eq!((sea.tick(), ships), (77, sent.to_vec()));
    let pirate = sea.pirates().unwrap().get(0);
    assert_eq!((pirate.id(), pirate.x(), pirate.y(), pirate.heading()), (4, 1_000.5, 2_000.25, 1.5));
    let commission = PIRATES[0].commission();
    assert_eq!((pirate.faction(), pirate.rank()), (commission.faction, commission.rank.number()));
    let fight = sea.fights().unwrap().get(0);
    assert_eq!((fight.faction(), fight.rank()), (1, 4), "her captain a Grey Tithe Miniboss");
    let numbers =
        |numbers: Option<flatbuffers::Vector<'_, f64>>| -> Option<Vec<f64>> { Some(numbers?.iter().collect()) };
    let alone = sea.fights().unwrap().get(1);
    // A page that knows one captain reads the view whole, the same with others in the fight or without them.
    assert_eq!((fight.player(), numbers(fight.view())), (2, numbers(alone.view())));
    let (seen, others): (Vec<f64>, Vec<f64>) = (fights_seen()[0].1.clone(), numbers(fight.others()).unwrap());
    assert_eq!((others[0], others.len()), (1.0, 1 + 2 + naval::wire::VESSEL_NUMBERS + 4), "one other captain");
    assert!(seen.windows(others.len()).any(|part| part == others), "her numbers as the fight's view holds them");
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
    assert!(read_sea_input(builder.finished_data()).is_err(), "a course's legs turn her, not a facing");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let facing = Some(builder.create_vector(&[0.5, 1.0]));
    let two = messages::Course::create(&mut builder, &messages::CourseArgs { facing, ..Default::default() });
    builder.finish(two, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "she faces one heading");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let walk = Some(builder.create_vector(&[1.0, 0.0]));
    let short = messages::Course::create(&mut builder, &messages::CourseArgs { walk, ..Default::default() });
    builder.finish(short, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "a step's controls are all its numbers");
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let odd = messages::Course::create(&mut builder, &messages::CourseArgs { helm: 3, ..Default::default() });
    builder.finish(odd, None);
    assert!(read_sea_input(builder.finished_data()).is_err(), "the helm is left or taken, nothing else");
}

#[test]
fn orders_cross_in_a_course_message_and_a_course_without_them_is_a_course() {
    let orders = Orders {
        helm: sailing::ship::Helm { steer: 0.5, crab: false, climb: -1 },
        aim: None,
        fire: true,
        brace: false,
        load: None,
    };
    assert_eq!(read_sea_input(&orders_bytes(&orders)), Ok(SeaInput::Orders(orders)));
    assert_eq!(read_sea_input(&course_bytes(&[[1.0, 2.0]], 5)), Ok(SeaInput::Course(vec![[1.0, 2.0]], 5)));
}

/// The client's test reads these bytes to check that what the server writes, the browser reads to the bit.
#[test]
fn the_bytes_for_the_clients_test_are_written() {
    let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/protocol");
    std::fs::create_dir_all(folder).unwrap();
    let (players, foes, shots, lines) = (players(), foes(), shots(), lines());
    std::fs::write(format!("{folder}/joined.bin"), joined_bytes(7, &DRESSED, Some(NODE))).unwrap();
    let snapshot = snapshot_bytes(&snapshot(&players, &foes, &shots, &lines));
    std::fs::write(format!("{folder}/snapshot.bin"), snapshot).unwrap();
    let sea = sea_snapshot_bytes(77, &SHIPS, &PIRATES, &fights_seen(), &aboard_seen());
    std::fs::write(format!("{folder}/sea.bin"), sea).unwrap();
}
