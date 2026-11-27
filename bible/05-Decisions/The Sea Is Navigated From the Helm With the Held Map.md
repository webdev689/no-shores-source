---
type: decision
date: 2026-11-17
status: in force
---
# The Sea Is Navigated From the Helm With the Held Map

> "I think the next thing is implementing the map (which the forge system should have).
>
> Basically, when on the open sea. If near an island, you should be prompted to either dock at a port, or land if not
> at a port, which would then trigger the animation that you see that overviews the area, and shows all available
> nodes.
>
> You shouldnt be able to see all the nodes at sea. Only an icon above a port city if near.
>
> When on the open sea, you should have a navigation panel with options, the first being the map, which pans you down
> to your ship in first person at the helm, opening the first person hands holding the map (in sprite forge). This
> will show you the entire map, along with being able to click and plan routes which then takes you back to the
> overworld style view.
>
> See kinda how DFO does it and let's improve on it."

Of the held map's art: "Its apart of our own blender pipeline"

The owner's answers to the questions that followed:

> Whether DFO's held-map code comes over, with Overlook's own world inked on the parchment: "Yes, port it"
>
> What the held map shows besides the coasts and the ship: "Fog of war. Only discovered islands, ports, discovered
> nodes, future quest tracking, etc"
>
> Where docking at a port city takes the player: "The overview"
>
> How routes are planned on the map, offered first one destination with the way round the land planned for the
> player, or else several waypoints: "#1 which can be interrupted at any time and easily resumed"

## What it settles

- **At sea, near an island**, the player is offered to dock, at a port, or to land, off any other coast. Either one
  flies the view up over the island's side and shows all the nodes that can be reached there ([[Game]]) (replaced: a
  click on a port's icon or its island asks to dock, and the island's nodes stand in a panel, [[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]).
- **At sea, no nodes are shown.** A port city shows an icon over it when the ship is near.
- **A navigation panel** is open at sea. Its first option is the map (replaced: the ship's console, whose Oversea view
  plans a voyage on the map, [[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]).
- **The map** takes the view down to the player's ship, in first person at the helm, and raises the first-person hands
  holding the map, from the owner's own art. It shows the whole world under fog of war: only the islands, ports and
  nodes the player has discovered, and later what their quests track ([[World Map]]) (replaced: no fog,
  [[Other Ships Wear Their Players' Marks, the Sea Map Has No Fog, and New Players Ride a Bay That Bursts]]).
- **A route** is one destination clicked on the map; the way round the land is planned for the player. Planning it
  takes the view back to the Overworld's, and the voyage can be stopped at any time and resumed with ease
  ([[Overworld]]).
- **DFO's held map comes over** as the pick [[Pick - Held Map]]: its code is the basis, Daggerfall's map data is left
  behind, and Overlook's own world is inked on the parchment. The art is the owner's own work.
