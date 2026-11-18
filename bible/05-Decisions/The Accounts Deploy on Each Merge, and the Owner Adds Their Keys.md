---
type: decision
date: 2026-11-17
status: in force
---
# The Accounts Deploy on Each Merge, and the Owner Adds Their Keys

> Asked whether CI may deploy the accounts' own Worker after each merge to main, creating its D1 database and applying
> its migrations first, as it deploys the rooms and the page: "Yes, deploy on each merge (Recommended)"

> Asked how the accounts' keys are kept: "Let's discuss keys". Told that the rooms can read players' sessions from the
> accounts' database, so no signing key is needed, and that the one key left is the Discord app's client secret, kept
> as a repository secret that CI hands to the Worker: "I can do the keys"

## What it settles

- **The accounts are their own Worker**, over D1, so a deploy of theirs drops no one from a room. CI deploys it after
  each merge into `main` once the check passes, as [[The Rooms Deploy on Each Merge]], creating its database and
  applying its migrations first.
- **No signing key.** A session is a random token in the player's browser, kept only as a hash in the database, and
  the rooms read it there.
- **The owner adds the keys**: the Discord app's client ID and secret as the repository's `DISCORD_CLIENT_ID` and
  `DISCORD_CLIENT_SECRET`, which CI hands to the Worker as its secrets, never written to the repository or printed.
