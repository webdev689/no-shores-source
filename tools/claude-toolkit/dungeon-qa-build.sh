#!/bin/bash
# Builds a scratch room.wasm for picturing dungeons headless (dungeon-plan.ts writes the plan): never committed, it
# adds `room_qa_entrance(n)`, so a land room's next join stands before entrance n, `room_qa_move(x, y)`, which
# stands every player of the open room there, `room_qa_freeze(on)`, which stops the open land room's clock (a moment
# held for a picture), and `room_qa_encounter(what, a, b)`, which sets an Elite Dungeon's encounters to a moment
# (`qa_encounter` below says each `what`). QA_NOFOES=1 also leaves a dungeon's garrison out but its Boss, and stands no
# encounter's waves, which otherwise kill a headless player first. It builds from HEAD in a worktree under <out dir>,
# which it removes again.
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
# seal; 4 raises the Boss's next ward; 5 fills anchor a to share b; 6 shows the slam with b ticks left; 7 shows the
# Reckoning with b ticks left; 8 starts Fury's clock with b ticks left (b <= 0: Fury b ticks in).
QA_ENCOUNTER = '''    pub fn qa_encounter(&mut self, what: u32, a: f64, b: f64) {
        use crate::encounters::court::{ANCHOR_TICKS, FURY_FROM, RECKONING_WARNING, SLAM_EVERY, WARDS};
        let clock = self.clock;
        let ticks = |left: f64| left.max(0.0) as u64;
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
            6 => court.ward_at = (clock + ticks(b)).saturating_sub(SLAM_EVERY),
            7 => {
                court.wards_broken = court.wards_broken.max(1);
                court.reckoning_from = Some((clock + ticks(b)).saturating_sub(RECKONING_WARNING));
            }
            8 => court.fury_from = Some((clock as f64 + b - FURY_FROM as f64).max(0.0) as u64),
            _ => {}
        }
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

static QA_FROZEN: core::sync::atomic::AtomicBool = core::sync::atomic::AtomicBool::new(false);

#[unsafe(no_mangle)]
pub extern "C" fn room_qa_freeze(on: u32) {
    QA_FROZEN.store(on != 0, core::sync::atomic::Ordering::Relaxed);
}

pub fn qa_frozen() -> bool {
    QA_FROZEN.load(core::sync::atomic::Ordering::Relaxed)
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
edit('crates/room-wasm/src/lib.rs', '        Opened::Land { room, refusal: None, .. } => room.join(),',
     '        Opened::Land { room, refusal: None, .. } => dungeon_door::qa_entrance().and_then(|number| room.join_at(number)).or_else(|| room.join()),')
edit('crates/room-wasm/src/lib.rs', '        Opened::Land { room, .. } => room.tick(),',
     '        Opened::Land { room, .. } => if !dungeon_door::qa_frozen() { room.tick() },')
if os.environ.get('QA_NOFOES') == '1':
    edit('crates/room/src/dungeon_room.rs', '        room.stand_dungeon_garrison(dungeon, levels, end);',
         '        room.stand_dungeon_garrison(dungeon, levels, end);\n        room.garrison.truncate(1);')
    edit('crates/room/src/encounters.rs', '        let count = living.clamp(WAVE_FOES.0, WAVE_FOES.1);\n        self.stand_foes(encounters, seal, spots, count)',
         '        let _ = (encounters, seal, spots, living);\n        0')
PY
CARGO_TARGET_DIR="$out/target" cargo build -q -p room-wasm --target wasm32-unknown-unknown --release
cp "$out/target/wasm32-unknown-unknown/release/room_wasm.wasm" "$out/room-qa.wasm"
echo "$out/room-qa.wasm"
