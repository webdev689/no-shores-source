---
id: 35
title: "claude-mem's semantic search was down in every worker (Chroma refused the connection)"
status: actioned
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/install-all.sh", "tools/claude-toolkit/check-tools.sh"]
siblings_checked: "family: the kit's MCP servers in workers. serena, headroom, context7 answered in all three; skillsmp has no key here (observation 1)."
area: "claude-mem in headless workers"
date: "2026-11-19"
session_context: "Workers opening, sea and ending each made their one claude-mem search; it fell back to keyword search."
commands_verified: "NOT RUN by the controller; the workers' reports say the Chroma connection was refused. check-tools printed WARN claude-mem: no store yet."
resolved: 2026-11-27
resolution: "review 2026-11-27, already in place: tools/claude-toolkit/check_tools.py:249-257 (check-tools runs a real MCP search and FAILs if it answers nothing)"
---

The workers' first action is a claude-mem search. In this container its Chroma backend refused connections, so search
fell back to keywords and found nothing useful. check-tools only warned that no store exists yet (a first thread). A
check that the semantic search answers, not only that the plugin is installed, would catch this at install.
