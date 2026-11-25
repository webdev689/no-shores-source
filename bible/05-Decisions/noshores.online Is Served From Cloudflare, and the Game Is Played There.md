---
type: decision
date: 2026-11-24
status: in force
---
# noshores.online Is Served From Cloudflare, and the Game Is Played There

> Asked where the website at noshores.online is served, offered "A Cloudflare Worker serving the built site, beside
> the rooms and accounts, deployed by CI on merge. You move the domain's nameservers from Porkbun to Cloudflare once;
> no Porkbun key is ever kept.": "Cloudflare (Recommended)"

> Asked whether the game is played from noshores.online or stays where it is, offered "The game moves under the
> domain (e.g. noshores.online/play). R2, the accounts and the rooms then have to allow the new address; a bigger
> change.": "Play at noshores.online"

## What it settles

- The [[Website]] is served by a Cloudflare Worker beside the rooms and the accounts ([[Servers on Cloudflare]]),
  deployed from `main` by CI on a merge; the owner's yes to a merge covers it ([[Ask Before Deploying]]).
- The owner moves `noshores.online`'s nameservers from Porkbun to Cloudflare once. No Porkbun key is kept.
- The game is played under `noshores.online`, and the site's Play goes there. R2, the accounts and the rooms allow
  that address.
- It answers [[The Website Is at noshores.online, After DFO's]]'s open point of where the site is hosted.
