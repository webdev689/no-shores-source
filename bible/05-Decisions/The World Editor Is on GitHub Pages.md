---
type: decision
date: 2026-11-14
status: in force
---
# The World Editor Is on GitHub Pages

> "Id much rather deploy this as github pages instead of me having to run npm"

> Told that Pages from a private repo needs GitHub Pro and makes a public site: "I have pro"

> On when the site should update, the owner chose: "On each merge"

## What it settles

- The client, with the [[World Editor]], is published to GitHub Pages at
  `https://lattymoy.github.io/overlook-source/editor/`. Nothing needs installing to use it.
- The site is public to anyone with the link. Its pages ask search engines not to index them.
- Each merge into `main` publishes the site again: the owner's yes to a merge covers its deploy
  ([[Ask Before Deploying]]).
