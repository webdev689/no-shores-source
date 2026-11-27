#!/bin/bash
# Save this container's claude-mem store into the project so the next thread starts with it (install-all.sh restores it).
# Run at the end of a session. SHARED_DIR must be storage that outlives the container. Merges are not possible: the newest save wins, so save from the session that ran last.
SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}
set -e; mkdir -p "$SHARED_DIR/claude-mem"
npx -y claude-mem@15.19.0 stop >/dev/null 2>&1 || true
python3 -c "import sqlite3,os;h=os.path.expanduser('~/.claude-mem/');s=sqlite3.connect(h+'claude-mem.db');d=sqlite3.connect('/tmp/claude-mem-snap.db');s.backup(d);d.close()"
tmp=$(mktemp -d); mkdir -p $tmp/.claude-mem; cp -r ~/.claude-mem/settings.json ~/.claude-mem/chroma $tmp/.claude-mem/ 2>/dev/null || true
mv /tmp/claude-mem-snap.db $tmp/.claude-mem/claude-mem.db
# An empty store means its worker captured nothing this session: say so, and keep the last good save.
n=$(python3 -c "import sqlite3,sys;print(sqlite3.connect(sys.argv[1]).execute('select count(*) from observations').fetchone()[0])" $tmp/.claude-mem/claude-mem.db 2>/dev/null || echo 0)
if [ "$n" = 0 ]; then
  rm -rf $tmp; npx -y claude-mem@15.19.0 start >/dev/null 2>&1 || true
  echo "claude-mem NOT saved: the store holds no observations (its worker captured nothing); the last save is kept" >&2; exit 1
fi
tar czf "$SHARED_DIR/claude-mem/claude-mem.tgz" -C $tmp .claude-mem && rm -rf $tmp
npx -y claude-mem@15.19.0 start >/dev/null 2>&1 || true
echo "claude-mem saved: $n observations, $(ls -la "$SHARED_DIR/claude-mem/claude-mem.tgz")"
