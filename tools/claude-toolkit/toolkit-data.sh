#!/bin/bash
# The kit's observation log outlives the container on the orphan branch toolkit-data of the repository.
#   restore (install-all.sh): once a container, takes the branch's log into $SHARED_DIR and notes the commit it came
#     from; with origin out of reach it restores nothing, and the next restore tries again.
#   save (a session's end): commits the log over that commit and merges it onto the branch's tip: a parallel session's
#     save is kept, lines both appended to a log are both kept, where both changed one line this container's wins, and
#     an observation number both took moves past the highest there; the merged log comes back here.
# A log not restored from an existing branch is never saved over it. The claude-mem store stays out: an archive.
set -euo pipefail
SHARED_DIR=${SHARED_DIR:-$HOME/toolkit-data}; REPO=${REPO_DIR:-$(git rev-parse --show-toplevel)}
TO="$SHARED_DIR/task-observer"; LOG="$TO/skill-observations"; FROM="$TO/restored-from"
OBS=task-observer/skill-observations/observation-log
# Whether origin holds the branch: 0 it does, 2 it does not; anything else, origin could not be asked.
branch() { git -C "$REPO" ls-remote -q --exit-code origin refs/heads/toolkit-data >/dev/null 2>&1 && echo 0 || echo $?; }
unreached() { echo "toolkit-data: origin could not be reached; $1" >&2; }

# The observation numbers this save took that another file holds at the branch's tip `$2`, in the worktree `$1`, each
# moved past the highest number there (its file renamed, its `id:` with it), and committed.
renumber() {
  local wt=$1 tip=$2 top floor file number name moved=no
  top=$(git -C "$wt" ls-tree -r --name-only HEAD -- "$OBS" | sed -n 's|.*/\([0-9]\{4\}\)-[^/]*\.md$|\1|p' | sort -n | tail -1)
  floor=$(sed '1!d; s/[^0-9]//g' "$wt/$OBS/archive/.id-floor" 2>/dev/null || true)
  top=$((10#${top:-0})); [ -z "$floor" ] || [ "$((10#$floor))" -le "$top" ] || top=$((10#$floor))
  while IFS= read -r file; do
    number=$(basename "$file" | cut -c1-4)
    [[ $number =~ ^[0-9]{4}$ ]] || continue
    git -C "$wt" ls-tree -r --name-only "$tip" -- "$OBS" | grep -q "/$number-" || continue
    top=$((top + 1)); name="$(dirname "$file")/$(printf '%04d' "$top")-$(basename "$file" | cut -c6-)"
    git -C "$wt" mv "$file" "$name"
    sed "s/^id: 0*$((10#$number))\$/id: $top/" "$wt/$name" > "$wt/$name.new" && mv "$wt/$name.new" "$wt/$name"
    git -C "$wt" add -A; moved=yes
  done < <(git -C "$wt" diff --name-only --diff-filter=A "$tip" HEAD -- "$OBS")
  [ "$moved" = no ] || git -C "$wt" commit -q -m "The kit's observation log: numbers another session took, moved on"
}

case "${1:-}" in
restore)
  [ ! -f "$FROM" ] || { echo "toolkit-data: restored already"; exit 0; }
  case $(branch) in
    0) ;;
    2) echo "toolkit-data: no branch to restore from"; exit 0 ;;
    *) unreached "nothing restored: run 'toolkit-data.sh restore' again before saving"; exit 0 ;;
  esac
  git -C "$REPO" fetch -q origin toolkit-data 2>/dev/null || { unreached "nothing restored"; exit 0; }
  # The branch's log goes over what is here: before a first restore, only what a fresh install laid.
  mkdir -p "$SHARED_DIR" && git -C "$REPO" archive FETCH_HEAD task-observer | tar -x -C "$SHARED_DIR"
  git -C "$REPO" rev-parse FETCH_HEAD > "$FROM"
  echo "toolkit-data: restored" ;;
save)
  [ -d "$LOG" ] || { echo "toolkit-data: no observation log at $LOG"; exit 0; }
  BASE=$(cat "$FROM" 2>/dev/null || true)
  if [ -z "$BASE" ]; then
    case $(branch) in
      2) ;;
      0) echo "toolkit-data: this log was not restored from the branch (toolkit-data.sh restore); not saving over it" >&2
         exit 1 ;;
      *) unreached "nothing saved"; exit 1 ;;
    esac
  fi
  WT=$(mktemp -d)/toolkit-data; UNION=$(mktemp)
  echo '*.log merge=union' > "$UNION"
  trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || true; rm -f "$UNION"
        git -C "$REPO" branch -q -D toolkit-data-save 2>/dev/null || true' EXIT
  if [ -n "$BASE" ]; then
    git -C "$REPO" cat-file -e "$BASE^{commit}" 2>/dev/null || git -C "$REPO" fetch -q origin toolkit-data
    git -C "$REPO" worktree add -q --detach "$WT" "$BASE"
  else
    git -C "$REPO" worktree add -q --orphan -b toolkit-data-save "$WT"
  fi
  mkdir -p "$WT/task-observer"; rm -rf "$WT/task-observer/skill-observations"; cp -a "$LOG" "$WT/task-observer/"
  git -C "$WT" add -A
  if ! git -C "$WT" diff --cached --quiet; then git -C "$WT" commit -q -m "The kit's observation log, $(date -u +%F)"
  elif [ -z "$BASE" ]; then echo "toolkit-data: nothing to save"; exit 0; fi
  for wait in 2 4 8 16; do
    if git -C "$WT" fetch -q origin toolkit-data 2>/dev/null; then
      if ! git -C "$WT" -c core.attributesFile="$UNION" rebase -q -X theirs FETCH_HEAD; then
        git -C "$WT" rebase --abort || true
        echo "toolkit-data: this log and the branch's could not be merged; nothing saved" >&2; exit 1
      fi
      renumber "$WT" FETCH_HEAD
    fi
    if git -C "$WT" push -q origin HEAD:refs/heads/toolkit-data; then
      rm -rf "$LOG"; cp -a "$WT/task-observer/skill-observations" "$TO/"
      git -C "$WT" rev-parse HEAD > "$FROM"; echo "toolkit-data: saved"; exit 0
    fi
    sleep "$wait"   # another session saved first: merge onto its save and try again
  done
  echo "toolkit-data: the push failed four times" >&2; exit 1 ;;
*) echo "usage: toolkit-data.sh restore|save" >&2; exit 2 ;;
esac
