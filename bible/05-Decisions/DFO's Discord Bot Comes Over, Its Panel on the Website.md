---
type: decision
date: 2026-11-24
status: in force
---
# DFO's Discord Bot Comes Over, Its Panel on the Website

> "though I also do want to port over the bot work we never merged so I can use it for our discord and its creation,
> keeping the tool on the website to use"

> Asked how it comes over: "Strict TypeScript Worker (Recommended)"

> Asked which of its modules come over, offered Safety, Community, Engagement and a link to the game: "Safety,
> Community,Engagement,We already have discord integration on standby ingame. Id like to tackle that also with
> whatever you need."

## What it settles

- DFO's Discord bot, never merged there, comes over for the No Shores Discord: a Cloudflare Worker in strict
  TypeScript under `server/bot/`, beside the accounts ([[Pick - Discord Bot]], [[Discord Bot]]).
- All of its modules come over: safety (moderation, logs, auto-mod, anti-raid), community (welcome, levels, role
  menus, tags, announcements) and engagement (giveaways, polls, starboard, tickets, suggestions, birthdays, temporary
  voice, invites, stats, socials).
- Its panel, the tool that sets it up and writes its messages, is a page of the website
  ([[The Website Is at noshores.online, After DFO's]]).
- The bot is linked to the game through the accounts' Discord sign-in and link, which already exist
  ([[Accounts]]).
- The Discord application's keys are the owner's to add, and the bot deploys only on the owner's yes
  ([[Ask Before Deploying]]).
