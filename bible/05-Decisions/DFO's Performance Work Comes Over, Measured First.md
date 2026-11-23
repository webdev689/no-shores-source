---
type: decision
date: 2026-11-23
status: in force
---
# DFO's Performance Work Comes Over, Measured First

The owner wrote:

> "Lets move on. Are there any improvement performance enhancements we can bring over from DFO? Like comprehensive
> culling? Im tired of dealing with performance issues"

Shown what DFO did to keep its frames short beside what No Shores does, the owner chose "All of it, measure first", in
their words "#1 and all in one PR". Asked how the render scale should work, the owner chose "Setting, auto by default".

## What it settles

- DFO's frame-time work comes over, all of it, in one pull request ([[Pick - Performance]]).
- It is measured first: a readout of the frame's time on the GPU, pass by pass.
- The resolution the world is drawn at is a Settings choice, Auto unless the player picks another.

## Claude's calls

The owner's to change:

- **What "all of it" holds**, as the owner was shown it:
  - a GPU timer and its readout;
  - render scale;
  - the sun's shadows kept between frames and their casters culled;
  - culling what is behind the camera, for every kind of thing drawn;
  - figures culled, and posed less often far off;
  - passes skipped when they have nothing to do, and nothing made afresh each frame;
  - the dungeon's depth prepass and light lists;
  - big builds sliced across frames.
- **The readout** shows only with `?perf` in the page's address.
