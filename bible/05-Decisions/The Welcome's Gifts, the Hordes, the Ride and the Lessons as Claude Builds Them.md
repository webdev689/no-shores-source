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
| Where the riding task stands | "Ride the Bay", the task after the round, in Overlook's social space, where the room lets a rider ride | The Tack gives the Bay mid-round; the round's goals are met in any order, so the lesson waits for the round to end and the next keeper is the Harbourmaster |
| The marked point | The Harbourmaster's stall, ridden up to in the saddle (within 8 m of her counter), pointed at by the compass and the screen's mark as a keeper's counter is | The next task is hers: riding there takes the player where they go next |
| How the riding steps are judged | By the room each tick from the body it stepped: up on a horse; 10 m at a walk; 30 m faster than 10.5 m/s (past a boosted walk's 9, short of a gallop's 12); a boost running; down after riding; at the counter mounted | The room already steps the rider and the boost's clocks; any input that moves the body serves |
| The sailing tasks | "Learn the helm" (board, set sail, steer, trim, raise the chart, fire at the hulk) after "Take your ship", then "Bring it home" (dock at Overlook) | The steps met in any order; docking first would end the voyage before the gunnery, so the return is a task of its own after the rest |
| "Trim" | The pace dial moved while under way (`[` and `]`) | Its sails trim themselves to the wind (`gaffTrim`); the pace dial is the canvas the player sets |
| "Steer" | 30 degrees turned in all while under way; turning onto a course's first leg as it puts to sea does not count | A tap of A or D turns the ship by its helm; a course set from rest is not steering |
| "Board" | Aboard the Sloop at sea (in the sea room with their character); ashore the step reads "Hold M to return to your ship" | Holding M is the way to the ship from any land |
| The held map | Asked of the sea as ask 4 of the course message each time the map is raised at the helm; the sea takes it only for a captain whose task asks it | Only the page sees the map raised; the course message already carries the sea's asks |
| The target | A Grey Tithe Sloop of the lowest rank, colours struck, moored on the first bearing from north whose water is clear 1,200 m off Overlook's roadstead (else 1,000, each past the 900 m that calls it, so a ship is not called before it has sailed); within 900 m the sea puts it into a fight of the captain's own: hove to, firing nothing, never scuttled or boarded, leaving the fight 1,500 m off, laying and paying nothing as it goes down | The rules' own guns fire only in a fight; a struck ship already lies hove to and draws its flag down; its own fight keeps other players and the Tithe's ships out of it in Overlook's home waters |
| A ball in it | Any ball of the captain's that strikes it; in the hulk's fight alone (the sea's word says which, `lesson`) the tracker shows the quest, not the fight's task: the step, then the way home | The step is to hit it; sinking it is the captain's choice; a Tithe ship met during the lesson is a real fight and shows its own task |
| Leaving the hulk | It leaves the captain's fight 1,500 m off while the step waits, 900 m once the ball is in | Its mooring lies 1,000 m or more from the roadstead: once the ball is in the fight is over before they reach Overlook and may dock |
| Where the hulk is marked | The sea's gear carries its mooring as the task's place (`quest_at`), so the compass points at it | The page draws nothing the sea did not say |
| The lines | The Harbourmaster calls the player down to her stall as the ride begins; her round's lines send them to the hulk ("There's a Tithe hulk moored offshore. Put a ball in it, then come home."); one line as they dock ("Back afloat, and that hulk the worse for it. You'll do.") | The Tack's round lines are said just before: her saying more would be four lines in a row ([[Dialogue]]) |
| Announcing each step | A toast for each step as the room ticks it, "Riding: Gallop", through the quest's news (`lessonsBetween`) | The quest's news is where the notices are made; the keeper screen's restyle picks it up |
| Their keys | Each step's keys as bound now on the keys or the pad played last, beside it in the tracker, as the wreck's teaching names them | The owner's "taught as the wreck teaches" |
| Pay | Each lesson's task pays a mission's clear, as every task that sends the player out does | The rule already stands for every goal but talk, pledge, buy and wear |
| A task begun by an event | Counts the pieces held as it begins (`tell_held`), so "Put them on", which now follows a docking, counts the pieces worn at once | It followed an ask before; a docking is not one |
| Saves | Kept by task id: on the round, the ride follows; on "Take your ship" or later, kept where it is; a pledge midway through a lesson is taken | The owner's word for these lessons is for new players; no save is sent back |

## The escort on horseback

| Call | Chosen | Why |
|---|---|---|

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
