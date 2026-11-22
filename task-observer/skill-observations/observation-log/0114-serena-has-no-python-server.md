# 0091 serena-has-no-python-server

- Date: 2026-11-21
- Seen by: worker assetsfix2 (OBSERVATIONS line), overlook-source, public events second audit
- What happened: the worker brief (common2/common3.md) requires Serena get_symbols_overview on every file the worker
  will change and find_symbol before every function edit. The Serena project is created by run-worker.sh with
  serena-languages.sh, which gives only rust and typescript; tools/*.py (kit.py, forge_publish.py, latticekit.py)
  got no symbols, so the worker fell back to grep/sed and scripted rewrites.
- Proposed change: the brief template says the Serena steps apply to Rust and TypeScript files; for Python, read with
  Read/Grep and edit with Edit. Or add python to serena-languages.sh when tools/ holds .py files the item changes.
- Status: open
