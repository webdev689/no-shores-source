#!/bin/bash
# Builds a scratch room.wasm for picturing dungeons headless (dungeon-plan.ts and encounter-plan.ts write the plans):
# never committed, it adds `room_qa_entrance(n)`, so a land room's next join stands before entrance n,
# `room_qa_move(x, y)`, which stands every player of the open room there, `room_qa_freeze(on)`, which holds the
# encounters' clock while the room ticks on (a moment held for a picture), and `room_qa_encounter(what, a, b)`, which
# sets an Elite Dungeon's encounters to a moment, holds the players' health or stands the Boss (`QA_ENCOUNTER` below
# says each `what`). QA_NOFOES=1 also leaves a dungeon's garrison out but its Boss, and stands no encounter's foes
# (waves, a wrong rune's, a ward's), which otherwise kill a headless player first. It builds from HEAD in a worktree under <out dir>, which it removes again.
#
#     QA_NOFOES=1 bash tools/claude-toolkit/dungeon-qa-build.sh <out dir>
set -euo pipefail
out=$(mkdir -p "${1:?name a folder outside the repo for the build}" && cd "$1" && pwd)
repo=$(git rev-parse --show-toplevel)
worktree="$out/worktree"
git -C "$repo" worktree add -q --detach "$worktree" HEAD
trap 'git -C "$repo" worktree remove --force "$worktree"' EXIT
cp -r "$repo/generated" "$worktree/"
cd "$worktree"
python3 - <<'PY'
import os, pathlib

# 0 heals every player; 1 lifts every player to height a (onto a pad); 2 sets seal a's relic to b; 3 breaks every
# seal; 4 raises the Boss's next ward (a tick unfrozen tells it); 5 fills anchor a to share b; 6 shows a told ward's
# slam with b ticks left (b at most SLAM_EVERY, on a room older than that); 7 shows the
# Reckoning with b ticks left; 8 starts Fury's clock with b ticks left (b <= 0: Fury b ticks in), the room's clock run
# on first where it is too young for that, every stamp of the encounters moved on with it; 9 sets Litany a's show b
# ticks in (30: its first rune half shown); 10 makes every player's health twenty times as deep and holds it whole
# each tick while a is not 0, so a headless body outlives the awake Boss's blows; 11 stands the Boss and its post at (a, b), where a ward holds it.
QA_ENCOUNTER = '''    pub fn qa_encounter(&mut self, what: u32, a: f64, b: f64) {
        use crate::encounters::court::{ANCHOR_TICKS, FURY_FROM, RECKONING_WARNING, SLAM_EVERY, WARDS};
        let ticks = |left: f64| left.max(0.0) as u64;
        if what == 10 {
            crate::QA_HEALTH.store(a != 0.0, core::sync::atomic::Ordering::Relaxed);
            for found in self.players.values_mut().filter(|_| a != 0.0) {
                found.fighter.health_max *= 20.0;
                found.fighter.health = found.fighter.health_max;
            }
            return;
        }
        if what <= 1 {
            for found in self.players.values_mut() {
                if what == 0 { found.fighter.health = found.fighter.health_max; }
                else { found.fighter.body.z = a; found.fighter.body.vz = 0.0; }
            }
            return;
        }
        if what == 3 {
            let Some(mut encounters) = self.encounters.take() else { return };
            for seal in 0..encounters.seals.len() {
                if encounters.seals[seal].state != crate::encounters::SealState::Broken {
                    self.break_seal(&mut encounters, seal);
                }
            }
            self.encounters = Some(encounters);
            return;
        }
        if what == 8 && (self.clock as f64) < FURY_FROM as f64 - b {
            let on = (FURY_FROM as f64 - b) as u64 - self.clock;
            self.clock += on;
            if let Some(encounters) = self.encounters.as_mut() {
                for _ in 0..on { Self::qa_hold(encounters); }
            }
        }
        let clock = self.clock;
        let boss = self.boss();
        let Some(encounters) = self.encounters.as_mut() else { return };
        let court = &mut encounters.court;
        match what {
            2 => { if let Some(seal) = encounters.seals.get_mut(a as usize) { seal.relic = b; } }
            4 => {
                court.ward_up = true;
                let share = WARDS[court.wards_broken.min(WARDS.len() - 1)];
                if let Some(foe) = boss.and_then(|id| self.foes.get_mut(&id)) {
                    foe.fighter.health = foe.fighter.health_max * share;
                }
            }
            5 => { if let Some(held) = court.anchors.get_mut(a as usize) { *held = (b * ANCHOR_TICKS as f64) as u64; } }
            6 => court.ward_at = clock.saturating_sub(SLAM_EVERY - ticks(b).min(SLAM_EVERY)),
            7 => {
                court.wards_broken = court.wards_broken.max(1);
                court.reckoning_from = Some(clock.saturating_sub(RECKONING_WARNING - ticks(b).min(RECKONING_WARNING)));
            }
            9 => { if let Some(seal) = encounters.seals.get_mut(a as usize) { seal.shown_from = clock.saturating_sub(ticks(b)); } }
            8 => court.fury_from = Some((clock as f64 + b - FURY_FROM as f64).max(0.0) as u64),
            11 => {
                if let Some(foe) = boss.and_then(|id| self.foes.get_mut(&id)) {
                    (foe.fighter.body.x, foe.fighter.body.y) = (a, b);
                }
                if let Some(post) = self.garrison.first_mut() {
                    (post.at[0], post.at[1]) = (a, b);
                }
            }
            _ => {}
        }
    }

'''

# While frozen the encounters' clock is held: they are not kept, and each tick every time they were stamped with moves
# on a tick, so a moment (a rune's flash, a slam shown, a Reckoning's count) stays as it is while the room ticks on.
QA_HOLD = '''    pub(crate) fn qa_hold(encounters: &mut crate::encounters::Encounters) {
        let later = |at: &mut u64| *at += 1;
        for seal in &mut encounters.seals {
            later(&mut seal.shown_from);
            later(&mut seal.next_wave);
            later(&mut seal.last_step);
            seal.pressed.iter_mut().flatten().for_each(later);
            if let Some((_, at)) = seal.wrong.as_mut() { later(at); }
        }
        let court = &mut encounters.court;
        court.woke_at.iter_mut().chain(court.reckoning_from.iter_mut()).chain(court.fury_from.iter_mut()).for_each(later);
        later(&mut court.ward_at);
        court.anchors_left.iter_mut().for_each(later);
    }

'''

def edit(path, old, new):
    file = pathlib.Path(path)
    text = file.read_text()
    assert old in text, f'{path}: the code this patch expects has moved; update dungeon-qa-build.sh'
    file.write_text(text.replace(old, new, 1))

edit('crates/room/src/lib.rs', '    /// The player leaves: blows waiting on them are dropped',
     '    pub fn qa_move_all(&mut self, x: f64, y: f64) {\n'
     '        for found in self.players.values_mut() {\n'
     '            found.fighter.body.x = x;\n'
     '            found.fighter.body.y = y;\n'
     '        }\n'
     '    }\n\n' + QA_ENCOUNTER +
     '    /// The player leaves: blows waiting on them are dropped')
door = pathlib.Path('crates/room-wasm/src/dungeon_door.rs')
door.write_text(door.read_text() + '''
static QA_ENTRANCE: core::sync::atomic::AtomicU32 = core::sync::atomic::AtomicU32::new(u32::MAX);

#[unsafe(no_mangle)]
pub extern "C" fn room_qa_entrance(number: u32) {
    QA_ENTRANCE.store(number, core::sync::atomic::Ordering::Relaxed);
}

pub fn qa_entrance() -> Option<usize> {
    let number = QA_ENTRANCE.load(core::sync::atomic::Ordering::Relaxed);
    (number != u32::MAX).then(|| number as usize)
}

#[unsafe(no_mangle)]
pub extern "C" fn room_qa_freeze(on: u32) {
    room::QA_FROZEN.store(on != 0, core::sync::atomic::Ordering::Relaxed);
}

#[unsafe(no_mangle)]
pub extern "C" fn room_qa_encounter(what: u32, a: f64, b: f64) {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.qa_encounter(what, a, b);
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn room_qa_move(x: f64, y: f64) {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.qa_move_all(x, y);
        }
    });
}
''')
edit('crates/room-wasm/src/lib.rs', '        Opened::Land { room, refusal: None, .. } if !room.shifted() => room.join(),',
     '        Opened::Land { room, refusal: None, .. } if !room.shifted() => dungeon_door::qa_entrance().and_then(|number| room.join_at(number)).or_else(|| room.join()),')
edit('crates/room/src/lib.rs', '    /// The player leaves: blows waiting on them are dropped',
     QA_HOLD + '    /// The player leaves: blows waiting on them are dropped')
pathlib.Path('crates/room/src/lib.rs').write_text(pathlib.Path('crates/room/src/lib.rs').read_text() +
     '\npub static QA_FROZEN: core::sync::atomic::AtomicBool = core::sync::atomic::AtomicBool::new(false);\n'
     'pub static QA_HEALTH: core::sync::atomic::AtomicBool = core::sync::atomic::AtomicBool::new(false);\n')
edit('crates/room/src/encounters.rs',
     '        let Some(mut encounters) = self.encounters.take() else { return };\n        for seal in 0..encounters.seals.len() {',
     '        let Some(mut encounters) = self.encounters.take() else { return };\n'
     '        if crate::QA_HEALTH.load(core::sync::atomic::Ordering::Relaxed) {\n'
     '            for found in self.players.values_mut() { found.fighter.health = found.fighter.health_max; }\n'
     '        }\n'
     '        if crate::QA_FROZEN.load(core::sync::atomic::Ordering::Relaxed) {\n'
     '            Self::qa_hold(&mut encounters);\n'
     '            self.encounters = Some(encounters);\n'
     '            return;\n'
     '        }\n'
     '        for seal in 0..encounters.seals.len() {')
if os.environ.get('QA_NOFOES') == '1':
    edit('crates/room/src/dungeon_room.rs', '        let bands = room.stand_dungeon_garrison(dungeon, levels, end);',
         '        let bands = room.stand_dungeon_garrison(dungeon, levels, end);\n'
         '        let gone: Vec<_> = room.garrison.iter().skip(1).flat_map(|post| post.standing.clone()).collect();\n'
         '        room.send_away(&gone);\n'
         '        room.garrison.truncate(1);')
    edit('crates/room/src/encounters.rs', '        count: usize,\n    ) -> usize {\n',
         '        count: usize,\n    ) -> usize {\n        if count < usize::MAX {\n            let _ = (encounters, seal, spots);\n            return 0;\n        }\n')
PY
CARGO_TARGET_DIR="$out/target" cargo build -q -p room-wasm --target wasm32-unknown-unknown --release
cp "$out/target/wasm32-unknown-unknown/release/room_wasm.wasm" "$out/room-qa.wasm"
echo "$out/room-qa.wasm"
