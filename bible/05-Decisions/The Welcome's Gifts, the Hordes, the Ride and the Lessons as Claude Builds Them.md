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
| Where the horde sits | A task of its own right after the task that gives the Art, so the Art is worn: Break the Tithe on the High Downs, Burn the wreckers off the Barrow Field, Let the dark out at the Chalk Adit | The Art is given as its task ends, so only a later task can be fought with it; the next task still teaches each ability one at a time |
| What it is in the file | A `defend` goal with `horde: true` and no ward, not a new kind | It is a defence's waves with the player in the ward's place; one flag keeps every other goal's code and the client's kinds untouched |
| Where on its node | The Art task's own place on the Saltgrass Downs (the High Downs, the Barrow Field, the Chalk Adit), its mesh baked as a defence's is | The road's place, where the Art was just won |
| How many foes | Four waves, 6, 7, 8 and 8, 29 in all; the next wave stands once two or fewer are left | A crowd at once and never a lull, fought in two or three minutes with the Art unbounded; at most 8 a wave, so a wave fits the node's cap beside its garrison |
| Which foes | The Tithe's own roster the roads already field there: Runners, Collectors, Crossbowmen, and one or two Enforcers (Major) from the second wave, at the node's levels | The road's own enemies; no new type or rank |
| Where a wave stands | 18 m from the place's middle, nearer where a walk from the middle reaches no further | Close enough to be on the player at once; the Chalk Adit's floor lies under its rim, where a wave 18 m out stood on ground it could not come down from |
| Its foes keep coming | A horde foe that loses the player is set on them again | A horde always knows its player: none stands idle at its post out of sight |
| Unbounded | For that player alone, while the horde runs: the worn Art's Anima and both Tenets full every tick, and all three abilities cast, a Tenet the road has not yet given included | The owner's "abilities are infinite and fully powered": a Tenet locked would leave the power fantasy a third of the Art |
| How the page knows | The room sends the horde's foes left and all (`quest_horde`) and lends the worn Art every earned bit while it runs | The room decides; the bar's lit rings and the cast keys follow its word with no page judgement |
| A cast while unbounded | Spends its share for one tick, filled the next with the word sent at once | The page lets a press through again once the room's word shows it spent; a share never spent would hold the key for 2 s |
| How it ends | The last wave fallen meets the goal; the Art is bound again with its shares as they stand, full but for a cast in its last tick | The power ends where the player sees it, and the next task, which asks the Anima cast, finds it ready |
| A death | The waves leave, a failure counts, its line is said, and it starts again from the first wave whole 10 s on, once the player is back within reach; no longer each time | It is a power fantasy, not a trial: a fall is a short reset, never a growing wait |
| A leave | The waves leave with the player; back, it starts again from the first | As a defence's step ends with its task's node |
| When the power begins | With the horde's first wave standing, not as the player comes within reach; a wave waiting on the room's cap on foes lends nothing | No power without a foe to show it on, so none carries to a public event or a boss while the cap is full |
| A fall farmed | Left as it is: each kill pays its XP and Aurem again after a fall, as a defence tried again pays, and drops nothing | A kill pays what the node's own foes pay; the Art unbounded makes them quicker, not richer, and a fall costs the 10 s and the walk back |
| What it pays | Its foes drop nothing; their kills pay XP and Aurem as any kill, and the task pays its clear | 29 foes dropping as a defence's first try would be a fortune; this is what a defence's waves pay when tried again |
| What the page shows | The tracker counts the foes left of all; a toast "Storm unbounded: every ability ready" (the worn Art's name) while it runs, and "Storm bound again" for 4 s as it ends; the ability bar lit, unlocked and glowing unbounded from the room's word | The owner's "shows off the arts", told plainly, and its end seen |
| The lines | Each house's speaker calls the horde in (one line) and says the power is spent as it falls (one or two); the Art task's end scene gave its second line to the horde's end so no speaker says more than two lines across a seam | The dialogue check's two lines a turn across a quest's seams |
| The lore | A chapter for each horde task in its house's book: The Spilling, The First Night, The Dark Let Out | Every road task has its chapter, in order |
| Saves | New task ids; no `was` | A save on the Art task walks into the horde next; one past it never meets it, as with any task added behind a player |
| The tracker's count | The foes left of all of them, "17/29", the form a puzzle's points lit of all already take | It says how far the horde has come as well as what is left; the tracker's own form for a part of a whole, on the keys and a phone alike |
| The power on the bar | Each ability glows in the Art's colour, stronger than a ready one (0.85 against 0.45) and swelling from 2 to 4 px over 4 s, under an infinity mark standing above it; with less motion asked for, the glow holds at 3 px; while the player cannot cast, the hatch alone | The power stands where the player looks, set apart from a bar merely ready, and the mark says it costs nothing |
| Where the bar's power comes from | The room's word alone: the gear message's `quest_horde` on the player's own character (`hordeRunning`), so the glow goes the frame the horde's word does | Server-authoritative: the page never guesses at the power |

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
