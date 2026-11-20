---
type: decision
date: 2026-11-20
status: in force
---
# The Page Publishes Only After the Rooms Deploy

> Asked "The page and the rooms deploy side by side. If a rooms deploy fails, the published page is left on a
> protocol no room speaks, and nobody can join until it's fixed. #92 makes this likelier, because any edit to gear or
> Arts content now changes the protocol version. Should the page's deploy wait for the rooms' deploy?": "Yes, page
> waits (Recommended)"

## What it settles

- **On a merge into `main`, the page is published only once the rooms have deployed**, or had nothing to deploy; a
  rooms deploy that fails leaves the page as it was ([[The Rooms Deploy When Their Code Changes]]).
- A merge's yes still covers both ([[Ask Before Deploying]]).
