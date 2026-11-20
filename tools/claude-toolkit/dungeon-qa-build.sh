#!/bin/bash
# Builds a scratch room.wasm for picturing dungeons headless (dungeon-plan.ts writes the plan): never committed, it
# adds `room_qa_entrance(n)`, so a land room's next join stands before entrance n, and `room_qa_move(x, y)`, which
# stands every player of the open room there; QA_NOFOES=1 also leaves a dungeon's garrison out, which otherwise kills
# a headless player first. It builds from HEAD in a worktree under <out dir>, which it removes again.
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
     '    }\n\n'
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
pub extern "C" fn room_qa_move(x: f64, y: f64) {
    with_open(|opened| {
        if let Opened::Land { room, .. } = opened {
            room.qa_move_all(x, y);
        }
    });
}
''')
edit('crates/room-wasm/src/lib.rs', '        Opened::Land { room, .. } => room.join(),',
     '        Opened::Land { room, .. } => dungeon_door::qa_entrance().and_then(|number| room.join_at(number)).or_else(|| room.join()),')
if os.environ.get('QA_NOFOES') == '1':
    edit('crates/room/src/dungeon_room.rs', '        room.stand_dungeon_garrison(&dungeon, levels);', '        let _ = levels;')
PY
CARGO_TARGET_DIR="$out/target" cargo build -q -p room-wasm --target wasm32-unknown-unknown --release
cp "$out/target/wasm32-unknown-unknown/release/room_wasm.wasm" "$out/room-qa.wasm"
echo "$out/room-qa.wasm"
