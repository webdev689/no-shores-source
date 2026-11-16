#!/bin/bash
# usage: serena-languages.sh <repo>. Prints a --language flag for each language whose build file sits at the repo's
# root. serena project create infers only the main language, so a TypeScript and Rust repo would get one language
# server and Serena could not read the other's files. Prints nothing when no build file is found: Serena infers.
for pair in Cargo.toml:rust tsconfig.json:typescript pyproject.toml:python go.mod:go; do
  [ -f "$1/${pair%%:*}" ] && printf -- '--language %s ' "${pair#*:}"
done
true
