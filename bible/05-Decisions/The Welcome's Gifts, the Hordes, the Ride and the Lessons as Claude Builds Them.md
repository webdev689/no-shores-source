---
type: claude-calls
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
| Her starter stock | Every Melee kind (13) and every Ranged kind (5), Normal at the buyer's level, 50 Aurem each to anyone, the Sword & Shield first; while her gift is owed every piece of an owed slot is shown "Free" and the first taken spends it | The owner's "a choice of melee weapon and ranged weapon", read as any kind of each; the stock stays the same for everyone, only the price is the player's |
| The Armorsmith's gift | Her four starter pieces (head, torso, arms, legs), Normal at the player's level, carried | "Put them on" then teaches wearing them |
| The Mage's gift | A sealed Magic Vestige for the head, at the player's level, carried | She opens Vestiges: the first one is hers to open. Magic is the first rarity sealed; the head, so it never replaces the weapon chosen |
| The Vault Keeper's gift | A Normal cloak at the player's level, laid in the vault | Teaches taking a piece out; the cloak is the one piece no keeper sells |
| The Tailor's gift | Harbour Blue, a Magic dye, kept | She sells dyes; Overlook's own harbour's colour |
| The Postmaster's gift | A letter, its source a keeper's gift (a new mail source, 6), holding a sealed Magic Vestige for the legs, at the player's level | Teaches taking a letter; the legs, so it differs from the Mage's and never replaces the weapons |
| The Tack's and the Harbourmaster's | The Bay and the Sloop, as before | As [[The Tack Gives the First Horse, the Prologue Ends in Plain Clothes, and Each Speaker Is Named in a Colour]] and [[The Harbourmaster Keeps Every Ship, Each With Its Own Numbers and Dress]] have them |
| How a gift is written | A goal's reward names it (`"gift": "armour"` and so on); a goal may give Aurem, the horse or a gift | One field for every keeper's, paid by the room as the goal is met |
| Once a character | Each gift kept given by name in the quest log, the Weaponsmith's slots still free beside it | A reload, a rejoin, a later round or a place read anew never gives one twice |
| A save partway round before the gifts | Given, as it is read, the gift of each keeper it has heard; the rest as it hears them | As fair as the Tack's Bay: what the round would have given it |
| One who pledges before the round is done | Given, as they pledge, every gift the opening's tasks still held; the Weaponsmith's choice stays free at her counter; the Bay and the Sloop at their counters as before | The Tack's Bay is free at her counter to one who pledged first; the rest have no counter that gives them otherwise |
| One past the round before the gifts | Owed nothing new (on "Take your ship" or later, pledged, or done) | The owner's word is for the tutorial's visits; they made theirs with the stranger's Aurem |
| "Arm yourself" | Gone; its id is "Put them on"'s old id, so a save there reads on "Put them on", its counts at nothing | The gifts arm the player; nothing is left to buy |
| "Put them on" | Asks the Melee weapon, the four armour pieces and the Ranged weapon, the Ranged last | The player chose a Ranged weapon too; last, so the goals before keep their places |
| An old save on "Put them on" or "Arm yourself" | Asked the Ranged weapon too, bought at 50 Aurem from what is left of the stranger's 400, as nothing is owed past the round | One rule for every save; the owner may rather have them given it |
| The stranger's words | Two lines: her history ("Grey sails take a tenth of every hold. Overlook gives the Tithe nothing.") and her farewell ("That's why your ship never made port. Every keeper has a gift. Go well."), both face to face; every scene naming a place gone with its flight | The owner's "Keep removed. Rework dialouge to be better": the Tithe's levy as [[The Grey Tithe Take a Tenth, and Overlook Does Not Pay]] has it, tied to the player's own wreck (a ship bound for Overlook gets no mercy; the prologue's crew "raise Overlook by first light"), and her wish; a third line of hers in a row would break [[Dialogue]]'s two a turn |
| The keepers' round lines | Each says what they give ("Pick one blade and one to shoot with. Both are my gift."); the Vault Keeper gains a line for the cloak | Each gift is said where it is given, within [[Dialogue]] |
| The notice | A notice for each gift as it comes (the Bay and the Sloop too), its words made by one function, `giftNotice` | One place for the gifts' words, shown as the keepers' screen's notice |
| The framing code | The counters' and the Hall's shots removed, with their tests | Nothing frames a place now; less to keep |

## The riding and sailing lessons

| Call | Chosen | Why |
|---|---|---|
| Where the riding task stands | "Ride the Bay", the task after the round, in Overlook's social space, where the room lets a rider ride | The Tack gives the Bay mid-round; the round's goals are met in any order, so the lesson waits for the round to end and the next keeper is the Harbourmaster |
| The marked point | The Harbourmaster's stall, ridden up to in the saddle (within 8 m of his counter), pointed at by the compass and the screen's mark as a keeper's counter is | The next task is his: riding there takes the player where they go next |
| How the riding steps are judged | By the room each tick from the body it stepped: up on a horse; 10 m at a walk; 30 m faster than 10.5 m/s (past a boosted walk's 9, short of a gallop's 12); a boost running; down after riding; at the counter mounted | The room already steps the rider and the boost's clocks; any input that moves the body serves |
| The sailing tasks | "Learn the helm" (board, set sail, steer, trim, raise the chart, fire at the hulk) after "Take your ship", then "Bring it home" (dock at Overlook) | The steps met in any order; docking first would end the voyage before the gunnery, so the return is a task of its own after the rest |
| "Trim" | The pace changed while under way, between the ladder's paces: sailing on at a click's ×60 (W) and a voyage planned on the map at ×200 (N) (changed in part: the pace dial and its `[` and `]` are gone, [[The Sea Has Two Views, Docking Asks First, and an Island's Nodes Stand in a Panel]]) | Its sails trim themselves to the wind (`gaffTrim`); the pace is the canvas the player sets |
| "Steer" | 30 degrees turned in all while under way; turning onto a course's first leg as it puts to sea does not count | A tap of A or D turns the ship by its helm; a course set from rest is not steering |
| "Board" | Aboard the Sloop at sea (in the sea room with their character); ashore the step reads "Hold M to return to your ship" | Holding M is the way to the ship from any land |
| The held map | Asked of the sea as ask 4 of the course message each time the map is raised at the helm; the sea takes it only for a captain whose task asks it | Only the page sees the map raised; the course message already carries the sea's asks |
| The target | A Grey Tithe Sloop of the lowest rank, colours struck, moored on the first bearing from north whose water is clear 1,200 m off Overlook's roadstead (else 1,000, each past the 900 m that calls it, so a ship is not called before it has sailed); within 900 m the sea puts it into a fight of the captain's own: hove to, firing nothing, never scuttled or boarded, leaving the fight 1,500 m off, laying and paying nothing as it goes down | The rules' own guns fire only in a fight; a struck ship already lies hove to and draws its flag down; its own fight keeps other players and the Tithe's ships out of it in Overlook's home waters |
| A ball in it | Any ball of the captain's that strikes it; in the hulk's fight alone (the sea's word says which, `lesson`) the tracker shows the quest, not the fight's task: the step, then the way home | The step is to hit it; sinking it is the captain's choice; a Tithe ship met during the lesson is a real fight and shows its own task |
| Leaving the hulk | It leaves the captain's fight 1,500 m off while the step waits, 900 m once the ball is in | Its mooring lies 1,000 m or more from the roadstead: once the ball is in the fight is over before they reach Overlook and may dock |
| Where the hulk is marked | The sea's gear carries its mooring as the task's place (`quest_at`), so the compass points at it | The page draws nothing the sea did not say |
| The lines | The Harbourmaster calls the player down to his stall as the ride begins; his round's lines send them to the hulk ("There's a Tithe hulk moored offshore. Put a ball in it, then come home."); one line as they dock ("Back afloat, and that hulk the worse for it. You'll do.") | The Tack's round lines are said just before: her saying more would be four lines in a row ([[Dialogue]]) |
| Announcing each step | A notice for each step as the room ticks it ("Riding", "Gallop"), under the Tack's or the Harbourmaster's mark, through the quest's news (`lessonsBetween`) | The quest's news is where the notices are made; the lesson's keeper is who taught it |
| Their keys | Each step's keys as bound now on the keys or the pad played last, beside it in the tracker, as the wreck's teaching names them | The owner's "taught as the wreck teaches" |
| Pay | Each lesson's task pays a mission's clear, as every task that sends the player out does | The rule already stands for every goal but talk, pledge, buy and wear |
| A task begun by an event | Counts the pieces held as it begins (`tell_held`), so "Put them on", which now follows a docking, counts the pieces worn at once | It followed an ask before; a docking is not one |
| Saves | Kept by task id: on the round, the ride follows; on "Take your ship" or later, kept where it is; a pledge midway through a lesson is taken | Claude's reading: the lessons are for new players; no save is sent back |

## The escort on horseback

| Call | Chosen | Why |
|---|---|---|
| How the step asks the player to mount | No goal of its own: the escort's figure waits while its player, near it, is on foot, and its step says "Get on your horse" under its words while it does | The step stays one goal the room already counts; a second goal would tick once and say nothing while the player gets down to fight the ambush |
| What the figure says while it waits for the player to mount | A line of its own (`mount`): Tobin "Get up on your horse. I'm not riding out there alone.", Wren "On your horse. We ride hard, or we don't ride." Said each time it begins to wait | The owner's "The step asks the player to mount"; a person asks, never names a key |
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
| How a wave arrives | Standing at once round the place, not brought by an airship as a defence's waves are | A horde is on the player at once and never lulls; a foe still arriving is one no Art finds |
| Its foes keep coming | A horde foe that loses the player is set on them again | A horde always knows its player: none stands idle at its post out of sight |
| Unbounded | For that player alone, while the horde runs: the worn Art's Anima and both Tenets full every tick, and all three abilities cast, a Tenet the road has not yet given included | The owner's "abilities are infinite and fully powered": a Tenet locked would leave the power fantasy a third of the Art |
| How the page knows | The room sends the horde's foes left and all (`quest_horde`); while that runs the page lends the worn Art whole to its bar and keys, the earned bits on the wire staying what is earned | The room decides; the bar's lit rings and the cast keys follow its word, and the road's news never mistakes the loan for Tenets earned |
| A cast while unbounded | Spends its share for one tick, filled the next with the word sent at once | The page lets a press through again once the room's word shows it spent; a share never spent would hold the key for 2 s |
| How it ends | The last wave fallen meets the goal; the Art is bound again with its shares as they stand, full but for a cast in its last tick | The power ends where the player sees it, and the next task, which asks the Anima cast, finds it ready |
| A death | The waves leave, a failure counts, its line is said, and it starts again from the first wave whole 10 s on, once the player is back within reach; no longer each time | It is a power fantasy, not a trial: a fall is a short reset, never a growing wait |
| A leave | The waves leave with the player; back, it starts again from the first | As a defence's step ends with its task's node |
| When the power begins | With the horde's first wave standing, not as the player comes within reach; a wave waiting on the room's cap on foes lends nothing | No power without a foe to show it on, so none carries to a public event or a boss while the cap is full |
| Straying from its ground | More than 36 m past its place's edge (twice as far as its waves stand) is a fall: its waves leave and it starts again 10 s on; and only the road's house's Art, worn, is lent | So the power is carried to no garrison, event or boss of the node, nor lent to an Art from another road |
| A fall farmed | Left as it is: each kill pays its XP and Aurem again after a fall, as a defence tried again pays, and drops nothing | A kill pays what the node's own foes pay; the Art unbounded makes them quicker, not richer, and a fall costs the 10 s and the walk back |
| What it pays | Its foes drop nothing; their kills pay XP and Aurem as any kill, and the task pays its clear | 29 foes dropping as a defence's first try would be a fortune; this is what a defence's waves pay when tried again |
| What the page shows | The tracker counts the foes left of all; a notice under the Art's emblem as it begins ("Storm unbounded", "Every ability ready") and as it ends ("Storm bound again"); the ability bar lit, unlocked and glowing unbounded from the room's word while it runs | The owner's "shows off the arts", told plainly, and its end seen; the bar holds the power in view between |
| The lines | Each house's speaker calls the horde in (one line) and says the power is spent as it falls (one or two); the Art task's end scene gave its second line to the horde's end so no speaker says more than two lines across a seam | The dialogue check's two lines a turn across a quest's seams |
| The lore | A chapter for each horde task in its house's book: The Spilling, The First Night, The Dark Let Out. They name the unbounded Art the Spilling, which comes to a caller once and never again | Every road task has its chapter, in order; the horde is fought once a road, so the lore says it never returns |
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
| Which keeper offers which quest | The opening by the Weaponsmith, from its round of the counters (its first task, the stranger's, is hers before any keeper is met); each house's road by its leader at their chapel, from its first task | The opening's begin is the Weaponsmith calling the player to her; a road begins at the pledge, made at the leader's counter |
| What Acquire does | Asks the room (ask 85) at the offering keeper's counter; until it is acquired nothing of the quest counts, and acquiring is a word with the keeper, so a talk goal for them is met by it | "A quest is an item acquired from a keeper", decided by the room as every ask is; the Weaponsmith's goal and her gift come with it |
| A save from before offers | A place past the offered task, or a count at it, reads as acquired | No one already walking a road is stopped to acquire it |
| The card's words | Each offer in quests.json: a kind ("A welcome to Overlook", "The Stormcallers' road"), a rarity (Rare for the opening, Atheric for the roads, which give an Art), the quest's words, the keeper's quote signed "A note from", and the keeper's longer words as a scene (the roads' own begins; a new two-line scene for the Weaponsmith) | The reference's card holds each; Rare is the game's gold, the nearest to the reference's band; the roads give the game's finest |
| The keeper's role over their name | A short plain line (Smith of arms, Reader of Vestiges, Leader of the Lamplighters) | The reference's "GUNSMITH"; no new lore |
| The crest of a keeper with no faction | Their own mark in the diamond and a plain rule with no name over it | The room keeps no standing with them; a bar would claim one |
| How large the keeper stands | Their whole figure 1.4 times the room's height, its top 62% drawn, so the room's foot cuts them below the waist; on a phone 2.9 times a third of the room, head and shoulders | The reference's framing; never laid past an atlas layer, so a dense screen draws them at the largest whole step that fits |
| What stands behind the keeper | A dark ground lit in the keeper's colour behind them, darker toward every edge, with a lighter slab at the right where the body stands; not their own stall or the world | The reference's light and edges, painted; shown it, the owner's "Yeah I love this" ([[Keepers, Quests and Items Obtained Follow Destiny 2's Vendor Screen]]) |
| Where the keeper's line stands | Over their name, as a film's words are; on a phone at the head of the body, clear of the face | The reference has no box; the dialogue box would cover the screen |
| A scene in the screen | A scene the open screen's keeper says alone is said in it, a line at a time, each held 1.6 s once typed (the dialogue box's cutscene pace); a scene with another speaker (or the stranger's) waits for the screen to close and is said in the dialogue box; closing the screen ends a scene there | The face-to-face shot and several speakers need the box; nothing waits on a screen left open |
| The Harbourmaster and the bounty board | Both stand in the keepers' frame: the Harbourmaster with a fixed dress (the one his counter's figure wears), the board where a keeper stands | Every keeper's counter keeps working in the new frame |
| The menu's banner on a keeper's screen | Left out, its body to the window's edges | The crest holds the currencies the banner would repeat |
| The Journal and the tracker | The Journal's quest card shows the keeper's card in its hover card, its objectives ticked; the tracker's steps wear the card's square box | The owner's Journal keeps its banners; Destiny shows a quest's card where it is pointed at |
| What is noticed | A keeper's gift, a road's reward (Art, Tenet, fragment to choose or its Aurem), a quest acquired, a step done, a quest done, a Legendary or Atheric piece or Vestige found; tips ride on them (the armour: the character key; the horse: the mount key; an Art: the character key) | Claude's list, from the owner's "quest item/item obtained"; lesser finds stay in the Acquired feed so the band never floods |
| How notices queue and stand | One at a time in the order they came, a repeat merged, at most 12 waiting; 4.5 s each, 6.5 s with a key to press; 0.25 s in, 0.35 s out, still with less motion; none while a named speaker's words are up, its while held | Long enough to read twice; a key to act on needs longer |
| Where the offered card leaves the wares | The card at the left of the column; the story, its tile and then the wares stacked at its right, so her TO START pieces show beside it at 1920x1080 | The reference keeps the vendor's wares in sight beside a quest's card; under it they fell out of sight below the fold |
| Where an acquired quest stands | Its small gold-framed tile with its name and "Acquired", left of the crest (under it on a phone), the wares leading; its card floats beside the tile on the pointer or the keys, and a tap or a press opens it in the rows | Destiny keeps a quest given as a tile among the vendor's; the menu's cards show by the pointer or keys alone, so a tap opens it for a phone |
| How see-through the notice band is | A grey rgba(24,28,34,0.72) under the cyan line | The reference's band shows the screen through it; at 0.72 its dimmer line still reads at 4.5:1 over white, checked by a test |
| The key and what it opens at the band's right | The line's ink, not dimmed as the reference's | Through the translucent band over a white scene a dimmer ink reads under 4.5:1; the bold title still leads |
| A long notice line on a phone | One text the column's width, wrapping inside the view | It ran off the right edge as one unbroken line at 412 px |
| Where notices stand | Across the foot over every layer (the menu's too, under the pad's cursor), the pointer passing through; DFO's messages stay toasts over the dialogue box | The reference's band; nothing under it is lost to a click |

## The pledged house's gift and the steps that teach the gifts

| Call | Chosen | Why |
|---|---|---|
| "Uncommon" | Magic, the game's second rarity | Normal, Magic, Rare, Legendary and Atheric stand for Destiny's Common, Uncommon, Rare, Legendary and Exotic |
| The pledged house's gift | The house's own torso piece (the Stormcaller Hauberk, the Lamplighter Hauberk, the Veiled Hauberk), its look and name, made at Magic at the player's level and rolled as any Magic torso is, given by the room as the pledge is taken | The owner's "Give a piece of uncommon faction gear"; the torso shows the house's colours most |
| How it is made | A rolled Magic torso (`vestige::make`) carrying the house's torso entry's name (`named`), its content the factions'; no new catalogue entry | The smallest way: the page and the room already draw and name a piece by its entry, and the catalogue, the wares (`factions::wares`), `sold_by_faction` and the Legendary pieces stay as they were. As a faction's piece it dismantles as a Normal one, as every faction's piece does |
| How often | Once a character for each house, kept given by the entry's name in the quest log beside the keepers' gifts; a switch to another house gives that house's once, a switch back none | One rule with the keepers' gifts: a reload or a switch never gives it twice |
| Where it goes | Carried, else laid in the vault, else posted as itself | A found Magic piece with no room becomes a sealed Vestige, which would lose the house's look; posted as itself it is never lost |
| The leader's line | One line each (`giftStorm`, `giftLamp`, `giftVeil`), said as the piece is given; when the house's road begins in the same moment, its begin is said as it stands and the gift's notice alone tells of the piece | The begin is two lines of the same leader: a line before it would be three in a row ([[Dialogue]]); the begins' words, from the owner's writing pass, are kept |
| The notice | The leader's gift ("Arlo Kestrel's gift"), the piece's name and the Character key, under the house's Art's emblem | The houses keep no keeper's mark; the Art is the house's sign on the page |
| How the page sees it | A Magic piece of the house's torso entry, of the house pledged to, held now (carried, in the vault, or in a letter when the bag and the vault are full) and not before, as the pledge changes | The room's word carries the items and the letters; no new field on the wire |
| The steps' task | "Use your gifts", right after "Put them on": Have the Mage open a Vestige, Take your cloak from the vault, Wear a dye, Take your letter from the mail; no start or end line | The owner's "Add steps"; after the armour and weapons are worn, before the houses; the houses' task begins with Arlo's line, so a line of the task's own would add a seam for nothing |
| The goal kind | `use`, its `act` (`identify`, `withdraw`, `dye`, `letter`) and the counter it is done at (`to`), checked against the act as the file is read; ticked from the ask the room answered (`Event::Used`) | No event heard these asks; one small kind as `ride` and `sail` are |
| What counts | Any Vestige opened, any piece taken from the vault, any dye worn, any letter taken | The step teaches the act; the gift is the first thing to do it with |
| A step done before the task | Counted only when done again, but a Vestige opened with none left sealed and a letter taken with the mail empty are met as the task begins | Taking a piece out and wearing a dye can always be done again; opening and taking cannot once nothing is left, so no save is stuck |
| Pay | None: it is done at the keepers' counters, as "Put them on" is | The rule pays a mission's clear only for a task that sends the player out |
| The tracker | The Mage's, the Vault Keeper's and the Postmaster's counters pointed at; the dye "Anywhere", its key the Character key | As the lessons name their places and keys |

## The house's pieces in the world's loot

| Call | Chosen | Why |
|---|---|---|
| "The world" | A Vestige of the world's content (`Source::World`: a kill's or a chest's in the patrols and the world's places, a sea fight's, a public event's, a mission's, a faction's or a guild's package, the keepers' Vestiges) as it is opened; not a dungeon's, an Elite or Abyss Dungeon's, a sea dungeon's or a Breach's, which keep their own sets | The owner's "the world loot pool": each of those contents' drops wears its own set ([[Every Drop Wears Its Content's Set, With Random Perks]]); the world's alone is the pool |
| Where it is rolled | As the Vestige is opened at the Mage's (`identify`), on the opened rarity, Magic or Rare | Magic and finer drop sealed: the piece is made when it is opened, so the share is of what opens Magic or Rare. A smith's ware and a ship's module are made elsewhere and never become one |
| The dice | A purpose of its own (`HouseDrop`, 3,000), one roll for whether and one for which | No roll any other purpose makes moves, so every other drop, and native and WebAssembly, stay as they were |
| Which piece | Evenly among the house's four armour pieces and its two weapons, whatever slot the Vestige held | The owner's "its four armour pieces and its weapons"; each its own kind, so the slot follows the piece |
| One way for both | `vestige::house_piece`: the entry's kind, look and name on a piece rolled at the rarity given, its content the factions' | The leader's Magic gift and the drops at Magic and Rare are the same piece; the catalogue, the wares and the Legendary pieces stay as they were |
