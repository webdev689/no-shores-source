---
type: decision
date: 2026-11-26
status: in force
---
# The Welcome's Gifts, the Hordes, the Ride and the Lessons as Claude Builds Them

Every call Claude made building [[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]
and [[Keepers, Quests and Items Obtained Follow Destiny 2's Vendor Screen]], on the owner's "treat all this work as
your baby". Each is the owner's to change.

## The keepers' gifts and the weapon choice

| Call | Chosen | Why |
|---|---|---|
| The Weaponsmith's gift | One Melee and one Ranged piece of her starter stock, free at her counter, chosen by holding it as a purchase is; owed until taken, whenever that is | "Give the player a choice of melee weapon and ranged weapon"; her counter already sells them, so the choice is made where it will be made again |
| Her starter stock | Every Melee kind (13) and every Ranged kind (5), Normal at the buyer's level, 50 Aurem each to anyone, the Sword & Shield first; while her gift is owed every piece of an owed slot is shown "Free" and the first taken spends it | "of any kind"; the stock stays the same for everyone, only the price is the player's |
| The Armorsmith's gift | Her four starter pieces (head, torso, arms, legs), Normal at the player's level, carried | "Put them on" then teaches wearing them |
| The Mage's gift | A sealed Magic Vestige for the head, at the player's level, carried | She opens Vestiges: the first one is hers to open. Magic is the first rarity sealed; the head, so it never replaces the weapon chosen |
| The Vault Keeper's gift | A Normal cloak at the player's level, laid in the vault | Teaches taking a piece out; the cloak is the one piece no keeper sells |
| The Tailor's gift | Harbour Blue, a Magic dye, kept | She sells dyes; Overlook's own harbour's colour |
| The Postmaster's gift | A letter, its source a keeper's gift (a new mail source, 6), holding a sealed Magic Vestige for the legs, at the player's level | Teaches taking a letter; the legs, so it differs from the Mage's and never replaces the weapons |
| The Tack's and the Harbourmaster's | The Bay and the Sloop, as before | The owner's "The Tack keeps the Bay, the Harbourmaster the Sloop" |
| How a gift is written | A goal's reward names it (`"gift": "armour"` and so on); a goal may give Aurem, the horse or a gift | One field for every keeper's, paid by the room as the goal is met |
| Once a character | Each gift kept given by name in the quest log, the Weaponsmith's slots still free beside it | A reload, a rejoin, a later round or a place read anew never gives one twice |
| A save partway round before the gifts | Given, as it is read, the gift of each keeper it has heard; the rest as it hears them | As fair as the Tack's Bay: what the round would have given it |
| One who pledges before the round is done | Given, as they pledge, every gift the opening's tasks still held; the Weaponsmith's choice stays free at her counter; the Bay and the Sloop at their counters as before | The Tack's Bay is free at her counter to one who pledged first; the rest have no counter that gives them otherwise |
| One past the round before the gifts | Owed nothing new (on "Take your ship" or later, pledged, or done) | The owner's word is for the tutorial's visits; they made theirs with the stranger's Aurem |
| "Arm yourself" | Gone; its id is "Put them on"'s old id, so a save there reads on "Put them on", its counts at nothing | The gifts arm the player; nothing is left to buy |
| "Put them on" | Asks the Melee weapon, the four armour pieces and the Ranged weapon, the Ranged last | The player chose a Ranged weapon too; last, so the goals before keep their places |
| An old save on "Put them on" or "Arm yourself" | Asked the Ranged weapon too, bought at 50 Aurem from what is left of the stranger's 400, as nothing is owed past the round | One rule for every save; the owner may rather have them given it |
| The stranger's words | Two lines: her history ("Three ports still stand against the Grey Tithe. Overlook pays them nothing.") and her farewell ("Every keeper here has a gift for you. Stay out of the Tithe's books."), both face to face; every scene naming a place gone with its flight | "remove the camera pan to every stall"; four lines of hers in a row would break [[Dialogue]]'s two a turn |
| The keepers' round lines | Each says what they give ("Pick one blade and one to shoot with. Both are my gift."); the Vault Keeper gains a line for the cloak | Each gift is said where it is given, within [[Dialogue]] |
| The notice | A toast for each gift as it comes (the Bay and the Sloop too), its words made by one function, `giftNotice` | The page's existing notice; one place for the later restyle |
| The framing code | The counters' and the Hall's shots removed, with their tests | Nothing frames a place now; less to keep |

## The riding and sailing lessons

| Call | Chosen | Why |
|---|---|---|

## The escort on horseback

| Call | Chosen | Why |
|---|---|---|
| How the step asks the player to mount | No goal of its own: the escort's figure waits while its player, near it, is on foot, and its step says "Get on your horse" under its words while it does | The step stays one goal the room already counts; a second goal would tick once and say nothing while the player gets down to fight the ambush |
| What the figure says while it waits for the player to mount | A line of its own (`mount`): Tobin "Get up on your horse. I'm not riding out there alone.", Wren "On your horse. We ride hard, or we don't ride." Said each time it begins to wait | The owner asked that it say so; a person asks, never names a key |
| When the figure counts as waiting to mount | Only with the player within its 30 m; farther, it waits as before and the waypoint leads them to it | It never speaks to a player who has not come yet |
| A player with no horse | The figure waits for them as for one on foot, and the step says "No horse worn: the Tack in Overlook gives one" | The Tack's Bay is free to every character; the escort is never ridden without a horse |
| Each figure's horse | Tobin a Dun ("bred on the downs", his road's Saltgrass Downs); Wren a Black (the Veiled's dark, against her grey) | A coat that fits each speaker |
| Tobin's size on his horse | Drawn at his 0.85, horse and all: a boy on a pony | He is a ship's boy, drawn small on foot |
| How the figure turns at 12 m/s | It turns to face its way at one full turn a second, in the room; the page glides its facing the short way round between the room's words | A corner is rounded over some 3 m, never in a tick, and its feet stay on the paths that are checked for walls and water |
| The figure's gait while held by the ambush, waiting or arrived | Standing on its horse (`horseidle`) | It reins in while the ambush stands, as the owner's halfway ambush stays |
| The tracker's words | "Ride with Tobin, and keep him close" and "Ride with Wren, and keep up"; the Elder's "Walk him there" now "Ride with him there" | The lines said that the figure walks |

## The house Arts' hordes

| Call | Chosen | Why |
|---|---|---|

## The wreck's teaching

| Call | Chosen | Why |
|---|---|---|
| What counts as a dodge for "Dodge a blow" | The room's word of a dodge (perfect or not), or the player seen dodging as the boarder's blow wound up at them with no word of it finding them 0.6 s after it lands | A hop out of the blow's reach gets the player clear, but the room says nothing of a blow that misses; 0.6 s outlasts the room's judging (24 ticks) and the word's way back |
| Where the dodge is read | On the page, from the room's views and words, as the parry and every other step are | The teaching's steps are all read on the page from what the room sends; changing what the room calls a dodge would change every Art and perk that reads one |
| A boarder that stops fighting in the duel | Once the player has fallen and risen, sent at them again, at most once a second, until it fights them | Once the player falls and rises the boarder has no one to fight and never came on its own |
| A player up on the quarterdeck in the duel | Left as it is: the boarder waits at the foot of the step | No foe climbs that lip; changing how foes climb is beyond the teaching |
| How long the Storm's lesson waits after each ability | 12 s of fighting with a hostile foe standing, or 6 s after it is cast a second time | Quicken's Haste lasts 6 s and Tempest's orbs 4 s: each has time to be seen and tried again |
| How it can be cast again | The room charges the Storm full again after each ability's first cast | Its recharges (91 s to 500 s) would leave nothing to try again |
| Which foes the Storm is taught on | The zones' own waves; a wave down before the lesson ends leaves the rest to the next zone's | The owner kept the wreck's Storm as it is; no foe is added |
| The heap closing the Brig's waist | The tool piles each heap on the middle height under its box; the page sets a heap floating 0.5 m or more down onto that floor until the wreck's workflow republishes the mesh, and the layout's block tops it there (5.335 m) | The tool took a spar 4 m over the deck for its floor; the mesh on R2 is published by a workflow this work may not run |

## The keepers' screen, the quest card and the notice

| Call | Chosen | Why |
|---|---|---|
