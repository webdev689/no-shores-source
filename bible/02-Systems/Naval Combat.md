---
type: system
status: building
code:
  - crates/naval/src/ballistics.rs#elevation_for_range
  - crates/naval/src/guns.rs#SWIVEL
  - crates/naval/src/random.rs#Mulberry32
---
# Naval Combat

Broadsides between the owner's Sloop and one captain: DFO's naval combat, rebuilt in Rust
([[Pick - Sailing and Naval Combat]]) on the [[Sailing]] crate's ships.

## How it works

- **A ball** is a point under gravity alone (9.81 m/s², no drag), leaving the gun at its speed plus the deck's way.
  Its flight is a closed form of its launch, swept as a segment between steps, so no step bends a shot or tunnels one
  through a hull.
- **A gun is laid, not pointed.** A broadside fires square to the hull; the gunner sets only the range, and the low
  arc that lands there is found within the carriage's elevation.
- **The guns** are DFO's swivel: 55 m/s, -10 to 14 degrees, 149 m at most from a deck 1.1 m up.
- **The loads** are round, grape, chain and heated shot, each with DFO's factors over round shot.
- **Chance** is one seeded stream (DFO's mulberry32), so a volley scatters the same way on every machine.
