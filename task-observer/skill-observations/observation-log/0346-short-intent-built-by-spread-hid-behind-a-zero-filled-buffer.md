---
id: 346
title: "The page's lying-still intent was 17 numbers (a named STILL_FIGHT spread after the controls, the drink's slot missing); every test passed because the rules' call zero-fills the buffer and 0 is no drink"
status: open
type: internal
skill: []
proposes_skill: []
target_file: ["client/src/combat/fighting.ts", "client/src/rules/fighters.ts", "client/src/combat/fallPrediction.test.ts"]
siblings_checked: "checked: grep of Float64Array([ and floatsOfControls( in client/ and server/. Still hand-counted but 18 today: client/src/network/publicBots.ts decide(), server/roomDoor.test.ts walk and play(), client/src/rules/combatRules.test.ts's scripted intent. 0218's sibling check grepped only literal Float64Array intents, so it missed one spread from a named constant."
area: "intents the page builds; tests that compare page and room but not the numbers passed between them"
date: 2026-11-27
session_context: "Fighting.lying() built new Float64Array([...floatsOfControls(..), ...STILL_FIGHT]) with STILL_FIGHT 9 numbers: 17 where INTENT_FLOATS is 18. combatRules.ts predict sizes its buffer from the rules' sizes and zero-fills it, so the 18th number read 0 (no drink), as the room's lying_still asks: no wrong prediction, no out-of-range read, no panic, and the lying intent is never sent. fallPrediction.test.ts already matched page and room per tick while dead, and passed on the short intent. Fixed: intentOf(controls, asked) in rules/fighters.ts builds every intent the page predicts by, sized INTENT_FLOATS; the fall test wraps predict and asserts each intent's length alive and lying, watched failing on the old code ([17] vs [18])."
parked_until:
resolved:
resolution:
reference: "branch claude/elegant-hawking-ehrhla c8f19b03"
commands_verified: "node --test client/src/combat/fallPrediction.test.ts on old code (fails: lying [17]) and new (passes)"
---
