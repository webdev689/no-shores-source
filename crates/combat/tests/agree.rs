//! The fight agrees to the bit wherever it runs: this scripted fight of a player against a still foe, through swings,
//! a guard, a dodge, an aimed shot, a quick one and a drink, is fingerprinted here, natively, and by the client's test
//! of the same fight through WebAssembly (client/src/rules/combatRules.test.ts lists the same course and script).

use combat::arms::{Arms, OffHand, Ranged, WeaponClass};
use combat::fighter::{Side, Weight, fighter};
use combat::{CombatInput, Fighter, Intent, Stroke, player_tick};
use movement::{Block, Controls, standing};

/// Both tests hold this value; a change to the fight changes it in both, on purpose.
pub const FIGHT_HASH: &str = "bd71a7856dbd24fb";

const COURSE: [Block; 1] = [Block { min_x: -3.0, min_y: -8.0, max_x: 3.0, max_y: -7.0, top: 1.2, bottom: 0.0 }];

/// Ticks, then forward, sideways, yaw, the stroke held (0 none), guard, dodge, shoot, aim, arms (0 a sword and
/// shield, 1 a bow), and a drink asked on the phase's first tick.
type Phase = (usize, f64, f64, f64, u8, bool, bool, bool, bool, u8, bool);

/// Walk at the foe, swing twice, back off guarding, dodge aside, then aim a bow and fire it, fire a quick shot, and
/// drink a healing charge walking away.
const SCRIPT: [Phase; 11] = [
    (40, 1.0, 0.0, 0.1, 0, false, false, false, false, 0, false),
    (70, 0.0, 0.0, 0.1, 6, false, false, false, false, 0, false),
    (80, -1.0, 0.0, 0.0, 0, true, false, false, false, 0, false),
    (1, 0.0, 1.0, 0.0, 0, false, true, false, false, 0, false),
    (40, 0.0, 0.0, 0.0, 0, false, false, false, false, 0, false),
    (50, 0.0, 0.0, -0.2, 0, false, false, false, true, 1, false),
    (1, 0.0, 0.0, -0.2, 0, false, false, true, true, 1, false),
    (40, 0.0, 0.0, -0.2, 0, false, false, false, false, 1, false),
    (1, 0.0, 0.0, -0.2, 0, false, false, true, false, 1, false),
    (40, 0.0, 0.0, -0.2, 0, false, false, false, false, 1, false),
    (70, -1.0, 0.0, -0.2, 0, false, false, false, false, 1, true),
];

/// The player's health as the script begins: short of its most, so the drink takes.
const WOUNDED: f64 = 60.0;

/// The still foe the player fights, 3 m north of where it starts.
pub fn foe() -> Fighter {
    let arms = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Empty };
    fighter(Side::Faction(1), standing(0.0, -3.0), arms, Weight::Medium, 70.0, 35.0)
}

pub fn run_script() -> Vec<Fighter> {
    let sword = Arms { melee: WeaponClass::Sword, ranged: None, off_hand: OffHand::Shield };
    let bow = Arms { melee: WeaponClass::Fists, ranged: Some(Ranged::Bow), off_hand: OffHand::Empty };
    let mut fighters = Vec::new();
    let mut player = Fighter { health: WOUNDED, ..combat::fighter::player(standing(0.0, 2.0), sword) };
    let view = [(2, foe())];
    for (ticks, forward, sideways, yaw, stroke, guard, dodge, shoot, aim, arms, heal) in SCRIPT {
        for tick in 0..ticks {
            player.arms = if arms == 1 { bow } else { sword };
            let controls = Controls { forward, sideways, yaw, ..Controls::default() };
            let combat = CombatInput {
                attack: Stroke::from_number(stroke),
                guard,
                dodge: dodge && tick == 0,
                shoot,
                pitch: 0.1,
                aim,
                mark: None,
                heal: heal && tick == 0,
                telegraph: None,
            };
            player = player_tick(1, &player, &Intent { controls, combat }, &view, &COURSE, &movement::Flat).0;
            fighters.push(player);
        }
    }
    fighters
}

/// FNV-1a over each fighter's numbers' little-endian bits, as the client's test takes it.
pub fn fingerprint(fighters: &[Fighter]) -> String {
    let hash = fighters.iter().flat_map(Fighter::to_floats).fold(0xcbf2_9ce4_8422_2325_u64, |hash, value| {
        value
            .to_bits()
            .to_le_bytes()
            .iter()
            .fold(hash, |hash, &byte| (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3))
    });
    format!("{hash:016x}")
}

#[test]
fn the_scripted_fight_swings_guards_dodges_shoots_and_drinks() {
    let fighters = run_script();
    let kinds: Vec<&str> = fighters
        .iter()
        .map(|fighter| match fighter.action {
            combat::Action::Attack(_) => "attack",
            combat::Action::Guard { .. } => "guard",
            combat::Action::Dodge { .. } => "dodge",
            combat::Action::Draw { .. } => "draw",
            combat::Action::Reload { .. } => "reload",
            combat::Action::Drink { .. } => "drink",
            _ => "other",
        })
        .collect();
    for kind in ["attack", "guard", "dodge", "draw", "reload", "drink"] {
        assert!(kinds.contains(&kind), "the script never puts the fighter in {kind}");
    }
    let last = fighters.last().expect("a fight");
    assert_eq!((last.health, last.charges), (WOUNDED + 40.0, 2), "the drink healed 40 and spent a charge");
    assert_eq!(fighters.iter().filter_map(|fighter| fighter.target).next(), Some(2), "its lock takes the foe");
}

#[test]
fn the_scripted_fight_moves_to_the_fingerprint_both_tests_hold() {
    assert_eq!(fingerprint(&run_script()), FIGHT_HASH);
}

/// A look turned past half a turn steps the body as the room's player tick steps it, to the bit: the browser predicts a
/// walker by the movement rules alone, and the room by the fight's.
#[test]
fn a_walker_turned_past_half_a_turn_steps_as_the_room_steps_them() {
    let open = Arms { melee: WeaponClass::Fists, ranged: None, off_hand: OffHand::Empty };
    for yaw in [3.5, 4.0, 7.0, -4.0, 10.0, -100.0] {
        let mut walker = fighter(Side::Players, standing(0.0, 0.0), open, Weight::Medium, 100.0, 50.0);
        let mut body = walker.body;
        for _ in 0..30 {
            let controls = Controls { forward: 1.0, yaw, ..Controls::default() };
            body = movement::step_body(&body, &controls, &COURSE, &movement::Flat, movement::TICK_SECONDS);
            let intent = Intent { controls, combat: CombatInput::default() };
            walker = player_tick(1, &walker, &intent, &[], &COURSE, &movement::Flat).0;
            assert_eq!(body, walker.body, "at yaw {yaw}");
        }
    }
}
