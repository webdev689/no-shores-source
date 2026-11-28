//! What a Breach keeps past its room's life: a run given back its checkpoint stands whoever joins at it, each
//! encounter before it won and its seals open; a gate given back its runs stays open to their companies, takes none it
//! shut again, and lets those go two days after they opened; and neither takes the other's.

use super::super::breach_tests::{at, breach, run};
use super::super::fights_tests::put_at;
use super::super::gate::{MOORINGS, SPENT_MINUTES};
use super::super::gate_tests::gate_room;
use super::super::{CHOIR, MENDING, Phase};
use super::Kept;
use crate::Room;
use crate::encounters::encounters_tests::{hardy, put};
use gear::breach::Tier;
use std::collections::{BTreeMap, BTreeSet};

#[test]
fn a_run_given_back_its_checkpoint_stands_whoever_joins_there_with_each_encounter_before_it_won() {
    let (mut room, players) = run(Tier::Normal, 2);
    put_at(&mut room, players[0], "mending", "checkpoint");
    room.tick();
    let mut breach_box = room.breach.take().expect("run");
    room.win_encounter(&mut breach_box, MENDING);
    breach_box.chests.insert(1);
    room.breach = Some(breach_box);
    let kept = room.breach_kept().expect("a run keeps its checkpoint");
    assert_eq!(kept, Kept::Run { stage: 2, chests: BTreeSet::from([1]) }, "the Choir's start, its chest earned");
    let mut again = Room::breach_run(Tier::Normal, 29_000_000).expect("opened afresh");
    assert!(again.restore_breach(kept.clone()));
    let restored = breach(&again);
    assert_eq!((restored.phases[MENDING], restored.phases[CHOIR]), (Phase::Won, Phase::Waiting));
    assert_eq!(restored.open_seals, breach(&room).open_seals, "the Mending's seal open");
    assert_ne!(restored.standing_key.0, 0, "its blocks stood with the seal open");
    assert_eq!(again.breach_kept(), Some(kept), "kept again as given");
    let player = hardy(&mut again);
    let (body, stage) = (again.players[&player].fighter.body, at(&again, "choir", "checkpoint"));
    assert!(combat::sight::apart([body.x, body.y], [stage[0], stage[1]]) < 1.0, "joining at the Choir's start");
    again.tick();
    assert_eq!(breach(&again).phases[CHOIR], Phase::Waiting, "begun only as they walk on into it");
    let mut past = Room::breach_run(Tier::Normal, 29_000_000).expect("opened afresh");
    assert!(past.restore_breach(Kept::Run { stage: 99, chests: BTreeSet::new() }));
    assert_eq!(breach(&past).reached, 6, "a stage past the last read as the last");
}

#[test]
fn a_gate_given_back_its_runs_stays_open_to_them_takes_none_it_shut_and_lets_those_go_after_two_days() {
    let (mut room, _) = gate_room(0);
    let minute = room.minute;
    let gate = room.breach_gate.as_mut().expect("a gate");
    gate.opened.insert("run-a".to_owned(), minute);
    gate.spent.insert("run-b".to_owned(), minute);
    let kept = room.breach_kept().expect("a gate keeps its runs");
    let (mut again, players) = gate_room(3);
    assert!(again.restore_breach(kept));
    assert!(again.breach_opened("run-a"), "open to its company as before");
    for &player in &players {
        assert!(again.breach_company(player, "run-b", Tier::Normal));
    }
    let mooring = again.breach_gate.as_ref().and_then(|gate| gate.socket(MOORINGS[0])).expect("a mooring");
    put(&mut again, players[0], mooring);
    again.tick();
    assert!(again.breach_gate.as_ref().expect("gate").held_by.is_none(), "a run it shut takes it no more");
    again.set_minute(minute + SPENT_MINUTES);
    again.tick();
    let none = Kept::Gate { opened: BTreeMap::new(), spent: BTreeMap::new() };
    assert_eq!(again.breach_kept(), Some(none), "each let go two days after it opened");
}

#[test]
fn a_run_takes_no_gates_runs_and_a_gate_no_runs_checkpoint() {
    let (mut gate, _) = gate_room(0);
    assert!(!gate.restore_breach(Kept::Run { stage: 2, chests: BTreeSet::new() }));
    let (mut run, _) = run(Tier::Hard, 1);
    assert!(!run.restore_breach(Kept::Gate { opened: BTreeMap::new(), spent: BTreeMap::new() }));
    assert_eq!(breach(&run).reached, 0);
}
