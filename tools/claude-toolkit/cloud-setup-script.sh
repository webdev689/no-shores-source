#!/bin/bash
# Paste this into the cloud environment's Setup script. It runs the install before Claude starts, so plugins and MCP
# servers load in the first session. Point KIT_DIR at wherever the kit lives in your container (a mounted folder, or a
# clone of your own repo that carries the kit). It never fails: a non-zero Setup script stops sessions from starting.
export PATH="$HOME/.local/bin:/opt/claude-code/bin:/opt/node22/bin:$PATH"
export KIT_DIR=${KIT_DIR:-$HOME/toolkit}
[ -f "$KIT_DIR/install-all.sh" ] && bash "$KIT_DIR/install-all.sh" > /tmp/toolkit-setup.log 2>&1
exit 0
