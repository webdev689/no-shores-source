---
id: 212
title: "claude-mem recorded nothing in a whole session (0 sessions, 0 observations), and claude-mem-save.sh only writes inside the container, so the end-of-session save carries nothing forward"
status: open
type: open-source
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/claude-mem-save.sh", "tools/claude-toolkit/install-all.sh", "CLAUDE.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the targets are the project's toolkit scripts and notes, not skills"
area: "the end-of-session steps in a cloud container"
date: 2026-11-24
session_context: "Chests and searchable containers (#192). At the end, `bash tools/claude-toolkit/claude-mem-save.sh` printed 'claude-mem saved' with a 422-byte tarball. ~/.claude-mem/claude-mem.db had sdk_sessions 0, observations 0, user_prompts 0, tool_uses 0; today's claude-mem log began at the save's own stop/start (14:09), so its worker had not been capturing during the session. The save writes $SHARED_DIR/claude-mem/claude-mem.tgz with SHARED_DIR defaulting to ~/toolkit-data, inside the container, and toolkit-data.sh says 'The claude-mem store stays out', so nothing reaches the next container either way."
parked_until:
resolved:
resolution:
reference:
commands_verified: "bash tools/claude-toolkit/claude-mem-save.sh; tar tzvf ~/toolkit-data/claude-mem/claude-mem.tgz (db 4096 bytes); python3 sqlite3 counts over ~/.claude-mem/claude-mem.db; head ~/.claude-mem/logs/claude-mem-2026-11-24.log"
---

**Issue:** Two things stack up. First, the claude-mem worker captured no session, prompt or tool use all session; the
store the save archived was empty. Second, even a full store would not outlive a cloud container: the save goes to
`~/toolkit-data/claude-mem/` and nothing pushes it. The script still prints "claude-mem saved", so the step looks done
when it carries nothing forward.

**Suggested improvement:**
- `claude-mem-save.sh`: refuse or warn when the store holds no observations ("claude-mem holds nothing to save: its
  worker captured no session").
- Say where the archive lives and that it dies with the container unless SHARED_DIR is durable.
- `install-all.sh`: verify the worker is running and capturing (a session row after the first prompt) and print FAIL
  when it is not.
- The owner decides whether the store should ride the `toolkit-data` branch, or whether the step should leave
  CLAUDE.md for cloud sessions.

**Principle:** A save step that reports success must check that it saved something, and to somewhere that outlives
the thing it is saving.
