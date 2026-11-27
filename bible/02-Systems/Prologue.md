---
type: system
status: live
code:
  - client/src/game/prologue/prologue.ts#Prologue
  - client/src/game/prologue/storyStart.ts#startStory
  - client/src/game/prologue/takeOrGiveBack.ts#takeOrGiveBack
  - client/src/game/prologue/stage.ts#Stage
  - client/src/game/prologue/beat.ts#BEATS
  - client/src/game/prologue/music.ts#sung
  - client/src/game/prologue/tap.ts#tapToStart
  - client/src/game/prologue/intro.ts#Intro
  - client/src/game/prologue/introShots.ts#islandFrame
  - client/src/game/prologue/storm.ts#StormDive
  - client/src/game/prologue/making.ts#Making
  - client/src/game/prologue/helm.ts#openingTurn
  - client/src/game/prologue/creation.ts#accountStep
  - client/src/game/prologue/creation.ts#lookStep
  - client/src/game/prologue/look.ts#armouredDress
  - client/src/game/prologue/sighted.ts#Sighted
  - client/src/game/prologue/battle.ts#Battle
  - client/src/game/prologue/calm.ts#Calm
  - client/src/game/prologue/ram.ts#Ram
  - client/src/game/prologue/wake.ts#Wake
  - client/src/game/prologue/wreckFight.ts#WreckFight
  - client/src/game/prologue/waking.ts#blurAt
  - client/src/game/prologue/tutorial.ts#Tutorial
  - client/src/game/prologue/tutorial.ts#Freeze
  - client/src/game/prologue/tutorial.ts#DodgeWatch
  - client/src/game/prologue/wreckTeaching.ts#LyingArms
  - client/src/game/prologue/storyArms.ts#StoryArms
  - client/src/game/prologue/wispCourse.ts#wispCourse
  - client/src/game/prologue/wisp.ts#wispLight
  - client/src/game/prologue/wreckDevStart.ts#devStart
  - client/src/game/prologue/wispScene.ts#WispScene
  - client/src/game/prologue/stormTeaching.ts#CastFreeze
  - crates/room/src/story.rs#story_take
  - crates/room/src/story.rs#story_storm
  - crates/gear/src/story.rs#story_item
  - crates/room/src/story.rs#story_hunt
  - client/src/game/prologue/nameplate.ts#Nameplate
  - client/src/game/prologue/overboard.ts#Overboard
  - client/src/game/prologue/deep.ts#Deep
  - client/src/game/prologue/shore.ts#Shore
  - client/src/game/prologue/beach.ts#findBeach
  - client/src/game/prologue/epilogue.ts#Epilogue
  - client/src/game/welcome/tour.ts#StrangerWelcome
  - client/src/game/welcome/tour.ts#TOUR
  - client/src/game/welcome/framing.ts#facesShot
  - client/src/game/welcome/afterStory.ts#AfterStory
  - content/story/welcome.json
  - client/src/game/prologue/brig.ts#Brig
  - client/src/game/prologue/places.ts#stormPlaces
  - client/src/game/flow.ts#next
  - content/story/prologue.json
  - content/prologue/wreck.json
  - client/src/game/prologue/fightSound.ts#STORY_FIGHT_GAIN
  - crates/room/src/story.rs#story_wreck
  - client/src/game/prologue/wreckLayout.ts#readWreck
  - client/src/game/prologue/wreckView.ts#WreckView
  - client/src/game/prologue/wreckLayout.ts#floorUnder
  - tools/wreck/build_wreck.py
  - tools/wreck/light_wreck.py
  - tools/wreck/export_wreck.py
  - tools/wreck/wreck_level.py
  - tools/wreck/wreck_dress.py
  - client/src/game/prologue/wreckProgress.ts#WreckProgress
  - client/src/game/prologue/wreckRun.ts#WreckRun
  - client/src/game/prologue/wreckCamera.ts#cameraCourse
  - client/src/game/prologue/wreckGround.ts#withoutDeadEnds
  - client/src/game/prologue/wreckDry.ts#dryFitted
  - client/src/game/prologue/wreckCrew.ts#WreckCrew
  - client/src/game/prologue/wreckCrew.ts#crewSpots
  - client/src/game/prologue/wreckScenery.ts#WreckScenery
---
# Prologue

The game's first story mission and the way into the game, as the owner set it
([[The Game Opens With a Story Mission at Sea]]): a tap to start, an intro over the islands, the title over
Saltmere, a storm at sea aboard a brig, character creation at its helm, a fight at sea, a ram, a wreck fought through
on foot to a boss who cannot be beaten, the deep, and waking on Saltmere's shore. Claude's calls are in
[[The Prologue as Claude Shapes It]] and, for its rework and the welcome to Overlook,
[[The Prologue, Horses and the Welcome to Overlook as Claude Builds Them]]; how it is drawn and heard is [[Cinema]] and [[Speech]];
how its lines are written, [[Every Line Reads as Spoken, and the Lore Is Detailed, Mysterious and Gripping]].

## How it works

**The way in.** The page shows black, the game's logo and "Click or press any key to start" ("Tap to start" on a
touch screen) at once, and loads the world behind it. The tap wakes the browser's sound. Once both are done the intro
begins. A pad's button held as the title appears taps nothing until pressed anew. With `?at=<node>` the page goes
straight to that node, and plays no story.

**The director** (`Prologue`) plays the beats in the owner's order, each a module of its own, handing each what the
last left: the camera's shot, the ships sighted, where the two ships met. A cutscene's beat is skipped by holding
Space for a second, or a touch held as long anywhere on the view (the dialogue box too: while the story plays no drag
pans or reloads the page), its remaining moments run at once; "Hold Space to skip" ("Hold to skip" on a touch screen,
the jump's key or button as bound now in place of Space) shows faintly whenever there is something to skip, and brightens as the hold fills. A beat the director moves on
from, at its end or on a failure, lets go of what it holds (the helm its windows and keys). A
beat that fails is left for the next with what it said stopped and the view cleared before the next begins; a last
beat that fails ends the story with its screen kept, so the black lifts only once the game's veil is up under it.
The intro offers no skip once it has reached Saltmere. Each beat sets its own weather, sound and lightning at
its start, so under `npm run dev` `?prologue=<beat>` starts at that beat as the story would reach it. A player who
has played the story to its end (kept in the browser, `noshores.prologue`) sees the intro and the title, and Begin
takes them straight to Overlook's social space. Where the page has accounts, Begin opens the character screen first
([[Interface]], "The character screen"), which sets `noshores.prologue` and `noshores.look` from the character chosen. Every way onto foot comes after the story, played through or passed
over (Begin, `?at=`, a story that could not start or go on), so on foot the page tells each room on land whose word
on the gear says the prologue is not kept that it is done (`Ask::FinishPrologue`), and the room keeps it with the
character, the page's word while the prologue pays nothing ([[The Server Is the Authority Over Everything]]). At
that end the room takes back the story's items and dresses the player in plain clothes, a Plain Shirt and Plain
Breeches with no stats, worn where nothing of their own is ([[Gear]], "Plain clothes"; [[The Tack Gives the First Horse, the Prologue Ends in Plain Clothes, and Each Speaker Is Named in a Colour]]). While the
story plays the menu (I, O, or the pad's Start) opens only on the wreck, while the player plays it, and shuts as that
ends. At its end the
story lets go of what it alone drew with on the GPU (the Brig's and the Frigate's views, the birds, the fire and any
wreck still drawn); the Frigate's view is made only once a beat draws it, so a player who sees only the intro never
makes it.

**Between scenes** ([[The Prologue's Scenes Change Slower, Behind the Logo While They Load]]), the beats that begin
from black (`fromBlack`: the wake, the throw overboard, the deep and the shore) lay no fade in of their own. The beat
before ends in a fade out of 2 s (`SCENE`; the ram's crash cuts to black in 1 s, twice its half second before), and
the director holds the black at least 1 s more and until the next beat is `ready` (the wake, the throw and the deep
once the wreck is drawn, the shore once its beach is found); past that second the owner's logo stands over the black
with a breathing LOADING under it. The beat's first three frames are drawn under the black, so their first making is
unseen, and it fades in over 2.5 s; the wake and the shore take no fade (`fadeInS`), as their own darkening blinks
them awake. Each beat's moments: the throw overboard comes 1.3 s
later and its scene runs 8.5 s, the deep runs 21.5 s, and the walk up the shore 6.9 s. A beat that does not begin from
black, begun while the black still held (the one before skipped under it), fades in at once. The wake's heart, and
the deep's, begin to beat with their first frame, so the darkening pulses in time with the beat heard; the deep's
closing eyes pulse darker with it too, and with less motion asked for the view darkens without pulsing.

A story that cannot begin at all (its cast or scenes refused, a ship's model not loaded, a part failing as it is made)
gives back everything it took, the last first: the screen hands the page back its touches, the dialogue box, the
marks over heads and the nameplate leave the game's interface, the GPU lets go of what was made, and the
player wears the look the game gave them. The player then arrives at Overlook.

| Beat | What happens | Played or shown |
|---|---|---|
| `intro` | First light over the cloud; then down through it to Saltmere, ships under sail off its harbour and gulls over it, the title, "Press any key to begin" ("Tap to begin" on a touch screen, "Press A to begin" on the pad, A being the jump's button as bound; Space begins too) | shown |
| `storm` | The camera pulls up and away over the sea as the storm comes on; a strike's flash covers the leap far out; low over the swell to the Brig, then well out along its port side (16 m and more, past its yards and its spanker's swing), its crew at work across its deck, and in under the spanker's boom to the helm's own shot off its port side, outboard of its rail ([[The Prologue's Camera Flights Stand Clear and Go Slower]]), where it ends riding its deck as the helm's camera does (all its rise and fall at the helm, a quarter of its pitch and roll about it), so the cut never jumps; skipped, it leaves the full storm and its lightning without a sound or a flash | shown |
| `creation` | At the helm in the storm: the account, then the look, the whole figure in armour, sword sheathed and shield slung | played |
| `sighted` | From the shot the creation last drew (framed for the screen it was framed for), the camera turns from the player to look down its deck; the lookout and the bosun cry out and the mate and the gunner speak; the camera pulls out over its stern as three Grey Tithe Sloops come out of the dark, and comes down behind it through the fight's own lens | shown |
| `battle` | The sea's own fight against the three, every ship taken up under the sail and way it was sighted with and sailing in the story's storm wind, never the world's, the Brig drawn as its own, the crew crying out at hits and sinkings; the tracker's task "Defeat their crews", the ships fighting the player still afloat and "No need to sink them", until every one is beaten, sunk or struck; the fight's readout, its keys and DFO's messages as toasts | played |
| `calm` | The wind drops, the rain eases, the camera eases down from the fight's to its deck; the beaten ships lie where and as the fight left them, each in its own settle, trim and list, and its sails furling on from where the fight left them; struck ones lie still, sinking ones go on under as the rules sink them and are gone once under; the crew talk, the camera looking out over the lookout's shoulder to the nearest wreck as he asks about them (whichever shoulder leaves it the more room from the foremast and its shrouds), then pushing in on it until it reads however far off it lies, until he cuts the mate off | shown |
| `ram` | The lookout cries out on the deck the calm left, the wrecks still lying round it; the camera turns with him, then pulls sharply out as a larger ship comes out of the storm at its side at 6 m/s (about 12 knots), lightning striking past it at 2.3 s and 4.8 s so its masts and sails stand against it: Captain Brannoc Thule's Frigate at its own size, under sail, lighter than a captain's ship in the fight and darker than the Brig; the crash comes as the head of its stem first touches the Brig's side where its hull is broadest (each hull's box in the ships manifest); the crew brace; the impact; black | shown |
| `wake` | First person on the deck ([[The Prologue Wakes by Darkening and Pulsing, Not Eyelids]]): the view darkening and lightening as the eyes blink slowly open, pulsing darker with each beat of the heart until they are open, the view swimming and clearing a step with each beat of the heart, the ringing; up on the feet, looking round; the camera eases out of the eyes to over the player's shoulder, the shot the run's camera takes as the camera leaves the eyes (a run that opens later is eased to from wherever the camera then is), their hands empty and their figure drawn once the camera stands a metre out of the eyes, where play begins 15.5 s in ([[The Wreck Opens by Teaching the Player]]); skipped at any moment, or left however it is left, its eyes are open and the view neither dark nor blurred, the frame the director draws after its skip too | shown |
| `wreck` | Taught on the quiet deck: the sword and shield found and equipped, the feet found, the player readied, a boarder met one on one, its bow taken up and taught; a wisp out of the storm that engulfs the player and gives them the Storm; the next fight teaching each of its abilities; then fought on foot through the wreck, each heap across the way clearing as its wave falls; at its end the push in to Captain Brannoc Thule, his nameplate and his cry; the fight one on one that cannot be won; a fade out | played |
| `overboard` | In from black on the body thrown over the rail, Thule and his crew crying out and leaping on the drawn wreck, turned from the rail most of the way toward the camera; skipped, the screen is black at once, so the deep comes in from black | shown |
| `deep` | Sinking past the fallen crew beside the wreck, its hulls and fires above the surface, the sea taking the story's steel and arms: from here on the player is drawn in the plain clothes a player with nothing wears in Overlook, nothing in hand or at the hip (`seaTakenDress`); the view darkening as the eyes close; a flash; a voice; black | shown |
| `shore` | First person on Saltmere's shore; a stranger comes down the beach, kneels beside the player and speaks; the player takes her hand; up, and up the shore together | played |

**The shore.** The player wakes lying on the strand, looking up at the sky while the view darkens and lightens as the eyes blink open. The stranger
sets off 3 s in, 12 m up the beach, and walks down to a place 1.1 m up from the player and 0.6 m to their side, where
she kneels (about 11 s in); the head turns to her from 6 s. She wears a townswoman's peasant blouse, long skirt and
boots, which the forge draws in every move she makes (walk, kneel and idle; her test reads the forge's own tables), and
the eye looks at her face, 1.15 m over her feet kneeling and 1.63 m standing, the forge's own measures; her words and
feelings stand 0.25 m over the crown of her head. Once she is down she says her two lines, framed in the
view; then the screen asks the player to take her hand ("Click or press any key to take her hand", "Tap to take her
hand" on a touch screen, "Press A to take her hand" on the pad, A being the jump's button as bound). Only a press, a click or a tap raises them: the view rises to standing over 2.4 s while she
rises with it, drawn standing from the rise's middle, where the eye climbs fastest (the forge draws nothing between
kneeling and standing), she says one more line, and the camera goes behind the two as they walk up the shore from where they
stood, for 6.5 s, into black. If the coast has no strand, or the land's worker cannot answer the search, the player
wakes on Overlook's plaza by its first spawn instead, where her words, which name neither the sea nor the shore, hold as
well; if even that cannot be laid, the shore fails and the story ends
played.

**After the shore** the flow's `story-ended` takes the player through the veil to Overlook's social space, its
loading screen ([[One Loading Screen Covers Every Trip Until the Place Is Ready]]). The story's
black holds until the veil has risen under it (0.7 s), then goes. The stranger waits behind the veil; she stands before the
player, facing them: 2.2 m ahead and 1 m to their right, else to their left, else nearer and more to the side (1.2 m
ahead and 1.6 m out, then 0.3 m and 2 m), the first spot on the player's own floor (within 1 m of it) whose line to
them clears the place's solids, so never past a parapet or a wall; where none is, the first on dry ground. Over dry ground
she stands, and walks, on the floor a figure stands on there (a paved walk, a pier), never sunk to the ground under it. She begins her welcome
once the veil has fallen, the story's black has gone and she is in the player's view. Then she walks toward the town's
middle on dry ground only (she stands where the next step is water or unknown), and is let go once none of her, feet
to head, is on the player's view, or a minute after she set off if she still stands in sight, held at the water or at
the town's middle. Leaving Overlook's social space before then ends her part at once, her words with it. The game is
the player's from there.

**The stranger's welcome** ([[The Stranger Welcomes the Player, and a Quest Walks Them Round Overlook]],
[[Keepers Give Gifts, the House Arts Come With a Horde, Escorts Ride, and the Horse and Ship Are Taught]]). Her
words (`content/story/welcome.json`, said on the story's stage in the dialogue box, `welcome/tour.ts`) are two lines,
one a scene: a little of the world (grey sails taking a tenth of every hold, Overlook giving the Tithe nothing); then
her farewell, telling the player that is why their ship never made port, sending them to the keepers, each of whom has
a gift for them, and wishing them well ([[Quests]], "The opening"). She names no
place and the camera flies to none: the round of the keepers shows the way. Both are seen face to face
(`welcome/framing.ts`): from the side of the pair nearer the player's view unless a solid stands between, from 2.8, 3.4
then 2.4 m over their feet, as far off as puts their crowns 14% and their feet 36% down the view (some 8 to 10 m), both
figures whole above the dialogue box (whose top is 43% down at 960x540), through the player's own lens. The view comes
to the pair in 2.4 s, eased out of rest and into it; with no pair to see it stays the player's, her words said all the
same. From her first word to her farewell the view is hers and, as in the
story's cutscenes, Continue moves her words on a line ([[Speech]], "Moving on") and Escape and the pad's Start and
View open Settings, the character page or the sheet, her words and their time holding still under them; no other game
key acts (no move or look, no use, map, chat, respawn or leave). While she speaks every figure is drawn for the welcome's own eye (the one last shown), not the player's camera, so each is turned and stands as that eye sees it; no townsman is drawn within 4 m of that eye (one walking past the camera would fill the view), the player and she always are. While she speaks a soft warm lamp hangs 2.6 m over the middle of the pair, a lantern of the town's at seven tenths of its light, reaching 8 m: lit as the city's lamps are, only as the daylight fades, so the two of them are seen at any hour, and put out once the welcome ends. As her first line begins the player is turned to face her, as she faces them. As she walks off the player is turned toward a point 3 m along her way into the town and the
view eases back over their shoulder, so she is seen going; the keys are theirs once it has. It is a cutscene: the HUD's
bars, compass, tracker, marks and key strip, the use prompt, the toasts and a gate's offer are hidden while the keys are held, until the view is the player's again,
the dialogue box hers. Her words wait while a menu is open over the view. As she bids
farewell the room hears the opening quest's first task done ([[Quests]]); she gives nothing, neither Aurem nor a
horse: the keepers give the gifts, the Tack the Bay. It is heard once a character, so a second hearing, a rejoin or a
second tab is refused. Leaving the place mid-welcome ends it at once, its lamp put out, the
view and the keys the player's again, and asks nothing then: a character whose task with her still waits is heard on
its next frame in a social space with no welcome to hear (a reload, or a browser that played the story before). Either
way the room is asked once a page, and only once its word on the player's own character (not a room's starting one)
shows her task waiting. Under `npm run dev`, `?arrival=1` ends the story as the shore does, so the arrival and her welcome
play at once.

**Where it happens.** The storm lies 24 km out past Saltmere's harbour (`stormPlaces`), the Brig heading across the
swell. The sea is sounded every 150 m across the 3 km round it, where every ship of the story sails, and the place is
turned either way, and if need be laid farther out (30 km, then 38 km), until all of it is 40 m deep or more; were
none so, the place with the fewest shallows is taken.

**At sea** (sighted to ram), each beat sets its own weather, sound, lightning and the Brig's way as it begins, so a
page started there plays as it would in turn; `?prologue=battle` takes the ships where they would be sighted
(`inboundAt`) and `?prologue=calm` or `?prologue=ram` lays them there as struck wrecks. Every hand-off at sea is
whole: the sighting starts from the shot the creation last drew; each ship's rig (`Sailing.rigOf`) is handed to the
fight and back, so its sails go on as they were; the fight's beaten ships are carried to the calm and on to the ram
(`Wreck`, `settledOn`) in the pose the fight left them. Every cry is said with its speaker's head on the view: a
battle cry waits for its speaker to come on the view (the player aiming out over its side looks away from the crew)
for up to 2.5 s, and is let go unsaid after, with no gap spent on it, so the next of its kind is heard. Every scene a
beat waits on either ends it or, refused, is thrown from its next frame,
and each beat's moments run on its own clock: skipped, its moments left still change the world (the weather, the
impact, the black) but say and sound nothing. The fight begins on the story's clock; a fight that cannot begin, or a
step the rules refuse, is thrown from the beat's frame, so the director goes on past it. The calm's last line is a
scene of its own (`calmCutOff`): the calm ends 1.3 s into it and the ram's first cry cuts it off. The wreck is laid where the ships met. The shore is the
nearest gentle strand to the plaza, low by the water, clear of the city's pads and 260 m from its harbour
(`findBeach`), found on the exact ground behind the deep's black.

**Who is aboard the other ships** ([[Game]], "At sea"). The three Sloops that attack first, Majors of the Grey Tithe
(`tithe-1` to `tithe-3`), carry their people from the sighting on, as the sea's ships do: each one's Tithe-Mate at its
wheel, and its Bosun, Deckhand and Hookman about its deck; in the fight they follow its men left and its sides run out ([[Naval Combat]], "How it looks"). Each wreck in the
calm and the ram keeps the hands the fight left it, its captain stood off the wheel; one going down carries none, and a
story begun at the calm lays each struck with its crew whole. Thule's Frigate comes with Captain Brannoc Thule at its
wheel and six of his deck's hands about it. The stage draws them (`Stage.draw`); the Brig's own crew the story places
itself.

**The intro** ([[The Intro Goes Straight to Saltmere]]) rises at first light over the cloud above Saltmere, goes
down into the cloud with a rush of air, the white whole for a second, and lifts on Saltmere's glide in from the sea to
the title, each shot laid on the island's own town and harbour (`islandFrame`). Saltmere is the land the game opened,
so nothing loads on the way. A skip brings the black down over the view, and the title shows under it as it lifts.
The title asks to begin once; begun by a key or a tap between frames, the title drawn after does not ask again.

**The intro's length.** First light 6 s, the cloud 1.1 s, Saltmere's glide 15 s and the prompt 2.4 s after the
title: about 25 s.

**The story's day.** The story is told in one day and night, the game's sky drawing each beat's weather at its hour
(`skies.ts`, `storySky.ts`): first light over the cloud at 5:15 and Saltmere's early morning at 6:24; the
storm at evening (18:00), the stillness after the fight at sunset (18:36), the Frigate out of the dusk (19:06); the
wreck and the deep at night (21:00), under a full moon the storm hides; the shore at the next dawn (5:36). Saltmere's
sun rises about 5:05 and sets about 18:55. The day is world day 3, the same for every player, and the clouds drift
and the lightning strikes on the story's own clock. Every bolt the story throws is a strike in that sky: it lights
the clouds and the decks, and its thunder comes as late as its distance makes it.

**The music** is the game's own director playing the story's songs ([[Music]]), one theme told through them. Every
frame each beat asks for its moment (`music()`): the title, whole, over the intro; the storm's song without its peak
as the storm comes on, only its floor and tension at the helm, whole as the Grey Tithe come; the sea's own fight song once
the fight is on; the calm's flute; the ram's swell, which the crash cuts off with everything else. The wake is silent
over the ringing and the heart until the camera leaves the eyes. Then the Boarding's first phase plays, tense, and
grows with each fight; Thule's cry wakes his own score, and losing to him plays its end, which rings over the throw.
The deep's song follows, then the shore's, its layers coming in as she comes, as she speaks and as the two rise.

**The fights' sounds** are heard three times as loud as the open world's, about 10 dB (`STORY_FIGHT_GAIN`), so they
stand over the storm's wind, rain and thunder at sea and over the wreck's fires on foot: the sea fight's guns, hits,
splashes and ships breaking up through the fight's own gain, the wreck's blows through a gain of their own on the way
into the world's sounds ([[The Prologue's Fights Are Heard Louder]]).

**The helm** (`Making`). The account step comes first ([[Accounts]]): create an account, sign in, sign in with
Discord or play as a guest. A player already signed in is offered "Go on as" their username, or "Go on" for an account
Discord alone keeps; with the accounts out of reach, "Go on without an account", as the game played before. An ask
the accounts leave unanswered for 10 s is given up as out of reach, so the way on is offered. A Discord sign-in that
came back is said once, with that offer ("You are signed in with Discord.", or "Discord is linked." before "You are
signed in as" the username); one that did not go through is said under the form, as a refusal is. Offline (no
`?room=`) it says "Accounts are kept when you play online." and offers "Go on". A player who leaves for Discord comes
back to the helm at the account step, not the story's start: the tab marks it (`noshores.story.helm`), read once and
cleared at the next load, and never heeded once the story has been played through. The rooms read the session as each
connects, and the step's end tells the page the account changed, so the menu's mark and banner and the company HUD
follow the account signed in to at the helm.
The camera stands off the player's port side, abeam of them on a screen wider than tall and 60° round from before them
on one taller (`openingTurn`): from before them the wheel and its binnacle stand between it and the figure, and astern
the boom's crutches and the taffrail. "Turn left" and "Turn right" (A and D) turn the figure on the spot, an eighth of a
turn at a press, the camera standing still; Done turns them back to face the bow before the story goes on. The camera
stands far enough back that the whole figure fits the part of the screen the window leaves clear, its nearest corner
however it is turned, and turns so the figure stands in its middle: the left on a screen wider than tall, with the
window on the right; the top on one taller than wide, with the window along the bottom (`creationEye`). Its eye stands
half a metre up for each metre out, so it looks down over the bulwark to the feet with room for a heavy swell's roll,
and never higher than 2.5 m over the deck, under the spanker's boom; it rides the deck's rise and fall at the helm.

**The player** is dressed for the story in steel with no helm, a steel sword sheathed at the hip and a kite shield
slung on the back (`armouredDress`; [[The Player's Sword and Shield Are Holstered]]): they stand at the helm with
their hands free. The ram throws the sword and shield from them: they wake on the wreck without them (`unarmed`), in
the story's steel, which is real gear from then on: the story's own Normal torso, arms and legs of level 1, worn in
their slots and shown on the Character page and in the pack ("Steel Cuirass", "Steel Gauntlets", "Steel Greaves"),
drawn in steel from the gear as the game's gear is drawn (`gearOutfit`, `STORY_SET`). On the wreck the figure is
dressed from their gear as on foot (`dressInGear`): once they equip the story's sword and shield they hold the item as
their gear has it, a Normal Sword & Shield drawn in iron, and once they equip its bow it is their other loadout; the
Melee loadout put away is their dress for the rest of the story; a swing draws it and swings, as the game's does. Their look is kept in the browser (`noshores.look`) and dresses them in the game afterwards.

## The wreck

Where the ram leaves the player: the Brig broken in two by Thule's Frigate, fought through on foot to the boss. It is a
scene of its own, built in Blender ([[The Prologue Is Brought to Life With Music, Sound and a Wreck Built in Blender]]);
the cutscenes, the camera's moves, the nameplate, the fires and the lines are the story's.

- **The scene** (`tools/wreck/`), spread out at true size ([[The Wreck Is Spread Out Much Larger, True to Scale]]).
  The ships tool builds the Brig, the Frigate and the Sloop, each at its own size. The Frigate lies north to south,
  its bow driven into where the Brig's waist was. The Brig is broken in two, its halves thrown some 35 m apart, each
  turned about its far end and settled a little lower at its break. Its mainmast is down, its waist on the struck
  side fallen into its hold, its foremast standing with its canvas burnt to rags. The wreck's Frigate is the ships
  tool's with its quarterdeck run forward to just abaft its mainmast (`WRECK_HULLS`), the arena. Its bowsprit is torn
  away and its mizzen down, its side stove in amidships and abreast its quarterdeck to port, and its port bulwark
  broken forward. A Sloop sunk in the fight at sea floats on its beam ends east of the Frigate's bow, high
  enough that its side stays out of the swell.
- **The wreckage** (`wreck_fields.py`). Six wide rafts of torn decking, each laid within an ellipse a little over the
  sea, on lengths of mast and casks: the wreckage of the Brig's waist and its torn deck between its halves, one beside
  its fore deck, the wreckage the Sloop drifted into, and two off the Frigate's port bow and port quarter. Broken
  timbers ring each, under its planking.
- **The way through.** Ramps of fallen timber lead off the Brig's stern half onto the wreckage of its waist, from its
  torn deck up onto its bow half, from its fore deck onto the raft beside it and down from it onto the Sloop's side,
  off the Sloop onto the wreckage it drifted into and up from it into the Frigate's stove-in waist, out over its
  port bow, across from the wreckage there onto the wreckage off its port quarter, and up from that through its
  stove-in side onto its quarterdeck. Splintered timber stands along every break, but where a ramp meets a deck or a raft:
  each ramp's way, 1.3 m either side of its line and 1 m past its ends, is cleared of every piece no longer than 2 m
  (splinters, the stubs of beams, fittings) that a body would stand against (`clear_ways`). Wreckage is strewn on the
  decks and the rafts' edges, kept off the way through, and flotsam floats all round.
- **The ground** is measured from the model (`wreck_course.py`), as a ship's deck is. A face looking up is ground
  where it is hull or deck, or timber laid as a way. What is solid in the room a body takes over the ground stands as
  a wall 3.2 m over it: past a jump from the deck, a quarterdeck or a rail beside it. Splinters and the heaps that
  close a way for good are walls no body stands on. Sails and lines are neither. The ground is laid in squares 0.3 m
  across, runs of one height joined into blocks; ground not joined to where the player wakes (flotsam afloat) is
  left out. Over 2,000 m2 of it is walked, across some 75 m by 55 m.
- **Built in CI.** The wreck workflow builds and lights the wreck whenever its tools change, in a job that holds no
  secret, and publishes the mesh, the light and the model to R2 from a second job that only uploads them
  ([[Toolchain]]). It keeps the layout it wrote (artifact `wreck-level`), which a commit takes whole once the run has
  published: a build on another machine can lay the ground a hair differently, and the game walks the ground the mesh
  was built with. The layout holds the Brig's mainmast stump (`masts`, from `BRIG_MAINMAST_X` as her stern half lies)
  and each boarder's rank as `wreck_level.py`'s zones give it.
- **The layout** is `content/prologue/wreck.json`, written by the export: the mesh's and the light's keys on R2, the
  ground's blocks, each heap's block, the fires, where the sea is not drawn (`dry`), where the player wakes, the
  path, the zones with their waves and the Brig's crew, the arena and Thule's place. Figures stand at the middle of
  their square of ground, never on the edge between two blocks.
- **The path** runs from the Brig's quarterdeck, where the player wakes by its wheel, down through its thrown-down
  breast rail into its waist, along its port gangway past the fallen waist, off its broken end across the wreckage of
  its waist and its torn deck, up onto its fore deck, out onto the raft beside it, down onto the Sloop's side, along
  it and across the wreckage it drifted into, up into the Frigate's waist east of its boat, out over its port bow
  onto the wreckage there, across onto the wreckage off its port quarter and up onto its quarterdeck near its front.
  Every lane of it is a body wide, and every figure the level stands a body's radius clear of anything a step over or
  under its feet.
- **Zones.** Eight along the path: the Brig's stern, the wreckage of its waist, the torn deck over the gap, its fore
  deck and the raft beside it, the Sloop and the wreckage it drifted into, the Frigate's waist and the wreckage off
  its port bow, the wreckage off its port quarter, and its quarterdeck. Each is an area with a
  checkpoint; entered, its checkpoint is where the next respawn stands the player. The first, where the player
  wakes, is quiet: no wave, nothing across its way on, room for the teaching. Each between it and the arena
  holds a wave of the Grey Tithe's deck crew (Deckhands, Hookmen, Pistoleers, Bosuns and Tithe-Mates), Minors and
  Majors only, at their own rank's strength, the Tithe-Mates as Majors: no Elite but Thule, the boss
  ([[The Prologue Is Reworked With Real Armour, a Bow, the Storm and No Elites]]), all boarding against the player and
  the Brig's crew ([[The Wreck's Boarders Are One Side]], [[Pirates Are Replaced by the Grey Tithe]]),
  stood as the player enters the zone and standing well across it from where they come in, so no foe of a zone fights before the player
  reaches it; and three spots near the wave on open deck where the Brig's crew stand (`crew`). At most 6 of the
  wreck's foes are alive at once.
- **The Brig's crew** fight on in each zone with a wave, two or three of them
  ([[Allied Crew Fight on the Wreck and Can Fall]]), stood with the zone's first boarder as the player enters, so they
  are fighting from the first. Each stands at one of the zone's `crew` spots in the layout, facing the nearest boarder;
  for a zone that lays none, 1.6 m from one of its first boarders on the same deck within the zone, toward its
  checkpoint where that stands. They are the roster's crew, Minors at the boarders' level, a swordsman and a skirmisher
  in turn, dressed as the Brig's plain hands in the storm with their weapons drawn, named "Crew" over a green bar. The
  boarders fight them and they fight back; they can fall. Neither the music nor a foe's growl on noticing the player
  takes one of them for a foe. The wreck's room holds 24 foes alive, as a node's; no more than 18 of the crew live at
  once, so the boarders always have room. A zone is cleared once its boarders are down, whatever became of its crew.
  As the player reaches each zone after the first, but the arena, the crew still standing from the zones before it
  regroup there ([[The Crew Still Standing Regroup Ahead]]): each is posted round its checkpoint, 1.8 m out (then
  1.2 m, then 2.6 m, where 1.8 m has no room), a step apart on its deck with 0.45 m of the same deck all round it, so
  none stands at an edge against the sea's rim, facing
  its wave, walks there by the room's routes (`Room::story_post`) and joins its fight. None comes into the arena:
  Thule's fight is one on one.
- **Heaps across the way.** Each zone but the first and the arena has a heap of wreckage across the way on from it,
  piled 2.9 m over the deck or the ramp it stands on and out over the bulwarks, standing from the start. A heap in
  the wreck's own frame is piled on the floor most of its box stands on: the middle height of the faces looking up
  under it, sampled every 0.3 m (`floor_under`), so a spar or a rail across it is not taken for its deck; one on a ship's
  frame, on the deck or ramp under its box's middle. Its block in the layout tops it where it is drawn, so the room's
  wall and the drawn heap agree, 2.3 to 3.6 m over the ground under its box (`floorUnder`, the middle height of the
  ground there; held by `wreckLayout.test.ts`). It is cleared once its zone's wave has stood whole and fallen. The steps up to the Frigate's quarterdeck at its front's
  corners are closed for good by heaps on cores of stacked crates, higher than its rails, so the arena's only way in
  is up from the wreckage off its port quarter. A player found past a heap still standing is brought back to their
  last checkpoint.
- **The level's check.** The export refuses a level its own ground does not hold, measured twice, the second half a
  square across and along: every zone, checkpoint, foe and crewman reached in order, walked with a body's width (into
  a square only where nothing higher than it steps or climbs stands within 0.35 m of its middle, as a body's radius
  is), each with a body's room round it; no standing heap walked, or climbed as high as a jump reaches (1.05 m),
  round; a wave and three crew in every zone but the first and the arena; and at least 2,000 m2 of ground its feet
  could reach.
- **Nothing falls off.** The room over the sea holds a rim round the wreck's ground, a grid of 0.3 m cells, open
  where a block covers a cell and a wall everywhere else, as a ship's deck holds its crew ([[Movement]]): a body
  walks, jumps and vaults anywhere over the decks and the rafts and is held at their edge, its rails and open breaks
  alike, while what falls or flies over the sea meets it at 0 m. No body climbs there
  ([[Climbing Is Off in the Prologue]]): no wall is taken hold of, no lip hung from, and only a lip within a vault
  (1.2 m) of the floor is gone over; the foes' navmesh over the sea is baked by the same rule. The page's own steps, its walk and its fight's prediction alike, stand on the same rim,
  made by the rules from the blocks (`setRim`), to the bit. The ground the rim holds is the export's without its
  dead ends (`withoutDeadEnds`): every square from which no body can walk back to the path, a step (0.5 m) up at most
  from one square to the next and any drop down, and that a body coming from the path can step, jump, vault or drop
  into, is left out, so the rim holds bodies at its edge there too. A wall is no ground a body comes from: no body
  stands on one, so a wall stays, in a dead end too, and stops shots. They are 31 slips of ground at most 60 squares
  across: slots at the waterline beside the Sloop's side, ledges outboard of the Frigate's quarterdeck rails, and
  others. Foes never jump, so a ledge they
  cannot step out of would hold them in the sea. A foe found off it is stood again at its post. A player in the sea (lower than 1.5 m over it, with no block of the wreck under them) is brought
  back to their last checkpoint after 1.2 s, as they were, never killed; the wreck's own low ground, as the Sloop's
  side, is never the sea.
- **A death** before the end of the boss fight: the room raises the player at the last checkpoint after 4 s, by
  itself, where they arrive as a respawn on foot does ([[Game]]). The HUD shows no death panel and no Respawn; a toast says "You will rise at the last checkpoint."
- **The arena** ([[Thule Fights on a Quarterdeck Twice as Long]]) is the Frigate's quarterdeck, run forward to just
  abaft its mainmast: as the ground lays it, some
  9.3 m across between its rails and 17.5 m from its breast rail to its taffrail, twice the ships tool's, open but for
  its wheel (its binnacle, its skylight and the companionway before its front swept away), no wave in it. Its heap
  stands on the ramp up into it from the wreckage off its port quarter, outside its stove-in side, a body's room clear
  of its deck. The arena is reached once the player stands 1.6 m clear of its heap's place (`ARENA_CLEAR_M`), so the
  camera behind them has room once the heap stands again, which at the heap's foot would press it to the back of
  their head. Thule's coming pushes the camera in toward his head over 0.9 s, 2.6 m at most and never nearer him than
  4.2 m, so on the long deck it never passes the player it starts over. When the boss fight begins, its heap closes the
  way in behind the player, every other foe is sent away,
  and Captain Brannoc Thule stands before the wheel at its far end facing the player, three levels over them: their
  blows land at 0.94 of their worth (0.47 for the levels, doubled by the balance pass). A player back over the heap is
  brought back in; anywhere on its side of the heap, on its deck or up on its rails, is never brought back, and its
  rails hold them.
- **A fight the player cannot win.** It ends when the player falls ("felled"), or when Thule is brought under a third
  of his health or 150 s have passed ("overpowered"); never with Thule dead. Stood by the page, he calls no crew in
  his last phase, so it stays one on one. Once it ends, the fight holds still while the screen fades out over 2 s (`SCENE`).
  Felled there, the player is never told they will rise: that toast is for a death before the boss fight.
- **The cries.** In the fight the first Grey Tithe foe on the view cries "That one's still breathing!", once; after it, the
  first time a Grey Tithe foe and one of the Brig's crew stand on the view together, they cry "For the Tithe!" and
  "Drive them off her!", once. Thule cries when the player's blows land on him and when his land on them, at most once in 9 s each, and only
  with his head on the view, so a cry unheard spends no gap; he tells the player to kneel again only once they have
  struck him since. The throw overboard is framed so Thule and his crier stand on the view on any screen, a tall one
  from further back.
- **Played** by `WreckRun` as `Foot` plays a node: the walker and the fight in a room of the game's own, in the rooms'
  worker as alone a node's is ([[Game]], "The room for playing alone"), on the layout's blocks over open sea
  (`RoomThread.openOverSea`: its foes' navmesh is the wreck's ground alone, so every wave fights and Thule strikes),
  its navmesh baked and its ticks run off the game's frame; the fight's marks drawn by the view on foot. What the run
  asks of the room (a wave's foes, the boarder, Thule, the crew, the arms, a checkpoint, a heap) is answered a moment
  later: a foe asked for counts as alive in its zone until its number comes back, so no wave's heap clears early, and
  one asked for before the boss fight clears the deck is not counted once answered. It tells the story whether the arena is
  entered, Thule's health, how the fight ended, the points over every head for barks (by crew), and the
  shot its camera takes of the player standing, where the wake ends: the player stood on the deck's top under
  where they wake, as the room stands them, never on the rim's own ground, the sea below it. A cutscene holds it
  still; the teaching freezes it (below). Its third-person camera keeps clear of what is drawn, not of the course's
  walls (`cameraCourse`, [[The Prologue Is Passed Over, Its Camera and Footing Clear]]): the course stands anything in a body's room (a rail, the wheel, a gun, a stump) as a wall
  3.2 m over the deck, so once the mesh has come each such wall is lowered for the camera to the highest timber or
  iron the mesh stands there (canvas never counts), a mast or spar standing through it kept whole, and the heaps
  standing added; its boom eases in and out round them as on foot. Where the player wakes, facing as they wake, the
  boom stands 1.9 m back of its 2.1 m, the whole figure in view. Its room is
  let go as the wreck's fight ends. The key strip is foot's, without the leave's. The menu's gear pages open on the wreck alone
  in the story (I for Character, O for Inventory), on the player's gear in its room; over them the player's presses
  rest while the room runs on, so what they equip is worn at once.
- **The teaching** (`Tutorial`), in the tracker under the quest "Prologue"
  ([[Quests Get a Task Tracker, and the Placeholder Panel Goes]]; [[The Wreck Opens by Teaching the Player]]). Each
  task's steps are ticked off once the player does them, read from what their body and fight did, so any input
  serves. Each step's keys, and the frozen fight's words, name the controls as bound now on the keys or the pad played
  last; below are the defaults on the keys. A step done early stays done, and a task stays up 1.5 s once all of it is met, so its last tick is seen. In
  turn:
  - "Find your sword and shield": they lie out on the quiet deck 8 m along the path from where the player wakes,
    past the step down from it ([[The Wreck's Arms Lie Farther Out, as a Loot Drop]]), drawn as the item itself
    (`LyingArms`): the forge's picture of it, as the Character page shows it, upright and turned to the eye at its true
    size, moving as a drop of loot does: popped up from its planks the first time it is drawn, as play begins, bouncing
    to rest, then hovering and bobbing as a Vestige's crystal does, with no shade under it, its Normal drop's line of
    light rising over it once it rests.
    Walked over, the room puts them in the pack
    (`Room::story_take`). Should they leave the pack (dismantled), they lie on the deck again.
  - "Equip your sword and shield": Open your Character page (I; ticked by the menu open once the arms are taken),
    Equip them from the Melee slot, Close it (Esc).
  - "Find your feet": Move (W A S D, 2 m walked from where they woke or last rose), Look round (Mouse, a radian
    turned in all), Run (Shift, faster than 5.5 m/s across the deck, a dodge aside), Jump (Space, rising in the air,
    a dodge's hop aside).
  - "Ready yourself": Swing (Right button), Guard (Left button or F, a guard or a parry), Drink a healing charge (3,
    a drink's heal; the player wakes short of their health, so a drink can be taken).
  - "Face the Tithe boarder": a Grey Tithe Hookman, the lowest rank, stands at the far end of the quiet deck, or 4.5 m
    along the path should the player stand there, and comes for the player at once (`Room::story_hunt`). Its first
    blow at the player that a parry can meet freezes the fight at most 8 ticks before it lands, if a press then could
    answer it (the player alive, on their feet, at rest or guarding, and aimed at the blow within 60 degrees, as the
    rules judge a guard): the room, the bodies, the figures, the storm, the sea, the fires and the barks stand still
    (the beat's `still`), the world drains a little toward grey, and "Press F to parry" breathes on the screen until F
    or the left button is pressed with the pointer the game's, which lets the blow play on into the parry (`Freeze`).
    Once a parry is made, the next blow freezes at most 10 ticks before it lands (the player on their feet with stamina
    left, facing any way), "Press V to dodge", until V or the side button. A blow answered never freezes again, and one
    no press could answer passes; a lesson the answer did not meet (a parry spoiled by a press left unused) is asked
    again of the next. A dodge is made by any dodge that gets the player clear of the blow, perfect or not
    (`DodgeWatch`): the room's word that a blow passed through it, or the player seen dodging while the boarder's blow
    wound up at them and no word of it finding them (a hit, a block, a broken guard or a parry) 0.6 s after it landed,
    as when the hop carried them out of its reach, of which the room says nothing. Once both are made, whichever came
    last, "F parries a blow as it lands; V dodges it" shows for 6 s and the fight runs as any. A boarder brought down
    before both are made is followed by another. Once the player falls in the duel and rises at the checkpoint, a
    boarder still standing that is not fighting them is sent at them again (`Room::story_hunt`, the story's
    `hunt` ask), at most once a second. No foe climbs from the Brig's waist up onto its quarterdeck, so a boarder in
    the waist waits at the foot of the step for a player standing up there. Steps: Parry a blow (F), Dodge a blow (V),
    Bring the boarder down.
  - "Arm yourself with the bow": the boarder brought down once both lessons are made drops a bow where it fell, the
    story's own Normal Bow of level 1, lying as the sword and shield lay (`LyingArms`: popped up, bouncing, hovering,
    its line of light), drawn half again its true size so the thin bow reads where it fell until walked over, when the room puts it in the pack (`Room::story_take`); a boarder brought
    down before then drops nothing, and none comes after. Steps: Take up the bow, Equip it (I, the Character page's
    Ranged slot), Switch to the bow (2), Loose an arrow (Left button or F, an arrow gone from the bow), Back to your sword (1).
  - The wisp ([[The Game Shows the Mystery and Explains Almost None of It]]): once the bow is taught, one of the
    Stormcallers' hounds ("The Six Hounds") comes out of the storm, shown and never explained (`WispScene`), the
    fight held and the tracker hidden: an apple's size of white-blue light in Volt's colours, a white-hot core in
    steps, a soft halo laid as light (dithered far off, as six finer discs within 4 m), a trail of motes falling away (a mote near the eye laid no larger than it shows from 4 m) and small arcs crackling off it, its light a pool of Volt's white-blue on the wreck (`WreckLook.near`, part
    of it added whole so orange timber goes pale rather than green) and as a lamp of the night on the figures and the
    sea round it, reaching 2.5 to 3.5 m, falling softly to nothing, and brighter as its rings tighten; the flash lights
    all within 9 m near white for an instant (`wispLight`), a low hum
    trembling and a crackle now and then following it. Its course is laid on the layout for where the player
    stands (`wispCourse`): it drifts in (2.6 s) from 32 m out over the sea, of the bearings round the quiet deck's
    middle with nothing of the wreck within 3 m the one most nearly ahead of the player and to their left; wanders the
    quiet deck (4.8 s) round its mast (the layout's `masts`: the Brig's mainmast, snapped to a stump in the fallen
    waist), 2.4 m out and 3.2 to 4.6 m over its deck, then toward the player, the Lookout ("What is that? It's coming aboard!") and the
    Bosun ("Captain, don't touch it!") crying out; then circles them in rings tightening from 2.6 m to under half a metre,
    faster and brighter (3.4 s), coming down as they tighten from where the wander left it to the chest (1.15 m) by
    the end of the first ring, and swaying 0.08 m there to the engulfing. Every point of it is lifted 0.35 m clear of
    the wreck's solids beside or under it (in its rings 0.05 m; none counts within 0.4 m of the player's feet) and
    eased up and down at 7 m/s at most, so it goes over a rail or the wheel and never through one; its rings instead
    close in to the first solid out from the player at their height (by a post close beside them, under half a
    metre), so they keep round the chest wherever the player's body fits, and once joined they never widen. Down at the chest, its light's pool falls on the deck round the player. As it comes the camera cuts from the player's shot to stand
    back 2 to 3.2 m along its level heading over the last second and 1.1 to 2.6 m over it, the first such place that
    sees it clear, looking on past it toward the player so the wreck stands in the frame; for the rings it stands low
    and near, a cutscene's shot (`ringEye`): of the places round the player 2.6 to 5.4 m out and 1 to 2.9 m over their
    deck (nearest first to 4.2 m out to their right and 1.8 m up), the first from which the chest is seen clear, the
    wisp at 95% of its moments, the two in one frame (never more than 0.75 rad apart), looking a little down between
    them (`ringLook`); the player stands a third of the frame's height or more. The camera goes from one shot to the
    next eased (`moveTo`): its eye straight along, or rising 1.5 m over the wreck between, its look never more than 60
    degrees down; a cut where neither is clear. Every shot and move keeps out of the fires' smoke columns (`inSmoke`,
    the room each fire's puffs roll through in the wind they are drawn leaning in, and 0.6 m more) where a place or way out of them
    exists: following the wisp it takes the nearest of its places out of the smoke, and a move begun in smoke with no
    clear way out cuts at once. Where the wisp itself flies through a column, the smoke near the eye fades away. It and engulfs them (1.4 s): arcs wrap the figure from feet to head, a flash, a ring of Volt
    pushing out 7 m over the deck, a thunderclap; and the camera eases back over the shoulder (1.2 s). With the flash
    the room gives the player the Storm (`Room::story_storm`; [[Arts]]): worn, its Anima and both Tenets earned and
    charged full, the ability bar shown, for the rest of the prologue. Under `npm run dev`, `?prologue=wreck&wisp=1`
    begins the wreck at its coming, `&wisp=<n>` n - 1 seconds into it (past its flash, with the Storm given), `&bow=1` with the bow lying 2 to 3 m before the player on their own deck,
    `&armed=1` the same with the sword and shield and the bow taken up and worn (asked of the room as the player's
    own walking and the menu ask them), and `&lash=1` with the Storm given and the boarder stood 4 m before the player, in Arc Lash's cone and reach
    (`wreckDevStart.ts`); `&view=first` begins any of them with the camera in the player's head.
  - "Call the Storm": until the Storm is given, the waves wait; from then the next zone's wave comes, and its fight
    teaches each ability as the parry is (`CastFreeze`): the fight frozen with its prompt breathing until its key is
    pressed, and again at the next chance a second on should the press cast nothing, until it is cast: "Press G to cast Arc Lash" once a foe stands in its cone and reach (7 m), then "Press Q to cast
    Quicken" and "Press R to release Tempest" once a foe stands within 12 m, each with its charge full. Each step is
    ticked once cast, read from its charge spent: Cast Arc Lash (G), Cast Quicken (Q), Release Tempest (R); then the
    fight runs as any. Each ability's first cast, asked or not, is paced so it can be felt: the room charges the Storm
    full again (`Room::story_storm` once more), so it can be cast again, and the next is not asked until the fight has
    run 12 s more (`STORM_PAUSE_S`, Quicken's Haste twice over), or 6 s after it is cast again (`AGAIN_PAUSE_S`, its
    moment played out), the seconds counted only while a hostile foe stands. The foes are the zones' own waves: a wave
    down before the lesson ends leaves the rest to the next zone's.
  - "Fight your way through the wreck", counting the hostile foes standing while any do. Until the Storm is given,
    the zones' waves wait: a zone reached keeps its wave waiting and its way on shut (`WreckProgress.held`).
  - The boss fight's task is "Face Captain Brannoc Thule", whatever stands before. The tracker hides while a cutscene
    holds the fight, and so do the fight's display (its bars and compass) and the key strip, the dialogue box
    staying; all come back as play does. While a cutscene with its own eye holds the camera (the wisp, Thule's
    coming) every figure, the player's own too, is drawn for that eye whatever the player's own view, and in first
    person no hands show over it; the ending, which keeps the player's own camera, shows neither in first person.
  - With the menu open the lesson goes on: the task over its next step (its keys and count beside) stand in the middle
    of the menu's foot, over the menu and clear of its tiles and labels (`TaskTracker.inMenu`). The rest of the
    display stays under the menu, as on foot.
- **The story's room.** Its room is told to play the story (`Room::story_wreck`): the player has no Art until the
  wisp gives them the Storm (`Room::story_storm`), so until then no ability bar shows and no cast is taken; every
  player wakes there, or joins, with no Melee weapon or armour carried or worn (the vault's kept), wearing the story's
  steel (torso, arms and legs, no helm), and at 55% of their health at most, the ram's harm (`WOKE_HEALTH`), once,
  however often the story is told; the story's sword and shield, a Normal Sword & Shield of level 1, and its bow, a
  Normal Bow of level 1, are each put in a player's pack when they take it up, while none of its kind is carried or
  worn, and worn by the gear's own ask; a boarder is sent at a player (`Room::story_hunt`) only alive, on the
  boarders' side, at a player alive; and every boarder the page stands fights on the Grey Tithe's side at its own
  rank's strength. The Brig's crew stay on the players' side. Everything the story lends is its own
  (`gear::story::story_item`, marked so on the item and on the wire): when a room is told the prologue is done
  (`Ask::FinishPrologue`) it takes every story item back, worn, carried or in the vault, and the Storm, unearned and
  unworn, from a character that had not finished it, so the player arrives in Overlook with nothing of the
  prologue's; one that finished it before keeps what it has.
- **Drawn** by `WreckScenery` with `WreckView`, shown by the wake, the fight, the throw overboard and, from below,
  the deep: the one mesh built in Blender, each face in its part's picture as a ship's. Its fires' light is baked into
  it there (`light_wreck.py`), with its shadows and what the timber throws back, flickering through space and time as
  the fires burn, the brightest rolled off softly toward gold. The game's sky lights it as it lights a ship, at the
  story's hour, under its cloud and lightning, darkened in every hollow and overhang the bake found. The light is laid
  in blocks, as the game's pixels are, and kept as its square root, so its dim falloff keeps its steps. Its ships'
  stern windows burn as a lit ship's do at sea ([[The Wreck's Stern Windows Glow]], [[Hulls]]). Each fire is
  also a lamp of the night, lighting the figures, the ships and the sea round it. The wreck does not ride the swell,
  which rises past its decks: every beat that draws it hands the water its ships' waterlines and its rafts as
  footprints (`dry`, the water's hull masks), so no sea is drawn inside a hull or over any of its ground, its dead ends'
  too. The export lays one a ship or raft, a hull's shape pointed at its bow; each is fitted to the ground nearest
  it (`dryFitted`) and laid again in pieces no longer than 6 m along it, each piece's middle, length and outline
  station by station following its own ground: 44 footprints, of the water's 48. The sea under a fire burning on it
  is still drawn. Each heap is its own run of the mesh, drawn while it stands. The mesh and the
  light (about 12 MB) are fetched once the story is past its intro; the director holds the black before the wake, and
  before the throw overboard and the deep, until they have come (`ready`, "Between scenes"), so each opens on the wreck
  drawn. The run's camera works out its course (`cameraCourse`) on the wake's first frames, while the player still
  lies on the deck. The
  fires burn in all four beats. Every figure they stand makes a move the forge draws its clothes in: the deep's
  fallen crew lie in `fallen`, Thule's crew leap and cry out. It lets go of its GPU buffers once the deep ends.
- **Each beat sets its world** at its start (the wreck's storm, fires and sounds, no lightning; the deep's water), so
  under `npm run dev`, `?prologue=wake`, `?prologue=wreck`, `?prologue=overboard` or `?prologue=deep` plays as the
  story does. Leaving the fight hands the HUD back clean (no death, key strip, task, nameplate or fight's display) and
  frees the pointer.

## Limits

- Every ship is a Sloop by the naval rules, whatever is drawn: the Brig's guns and hull are the Sloop's in the fight.
- Thule's ship is drawn as the Frigate, without the Tithe Ram's iron ram bow ([[Hulls]]): the Tithe Ram is not built.
- The look is kept in the browser; whether the story was played is kept in the browser, and with the account once a
  room is told.
- The story's songs are written to its beats' lengths, not timed to their moments: a song begins on the director's
  bar line, so a moment can fall up to a bar from its music.
- The decks are boxes half a metre across: a deck's camber and the slope of its sheer are steps of 5 cm, a mast or a
  gun inside its deck is walked through, and its hatches are walked over.
- The heaps are not in the foes' navmesh: a foe that runs at one stops against it until it clears.
- The sea fight has no touch controls.
- No figures swim or float in the forge, so no men are drawn in the water by the wrecks; the calm's talk asks only
  about the wrecks the camera shows.
