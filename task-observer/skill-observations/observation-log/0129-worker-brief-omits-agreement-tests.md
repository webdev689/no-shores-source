---
id: 129
title: "Rule-changing workers ran their crates' tests but not the door and server agreement tests, so fingerprint drift surfaced only at merge"
status: parked
type: internal
skill: []
proposes_skill: []
target_file: ["tools/claude-toolkit/workers/brief-common-template.md", "bible/03-Code/Toolkit.md"]
siblings_checked: "none: the worker brief only"
area: "worker briefs for changes to the Rust rules"
date: 2026-11-22
session_context: "Overlook third audit: the body worker (movement, combat) and the foes worker ran cargo test -p movement/-p combat/-p foes/-p room, all green; after merging, cargo test -p room-wasm failed three pinned fingerprints (garrison, garrison pair, climb), which the server's WebAssembly tests also pin. The controller bisected by reverting each change in the tree and repinned."
parked_until: "PR #242 merge"
resolved:
resolution:
reference:
commands_verified: "run: cargo test -p room-wasm -> 3 fingerprint FAILED; git checkout <before> -- crates/combat/src -> 2 pass; npm run -s wasm; node --test server/garrison.test.ts server/climb.test.ts -> 3 pass after repin"
---

**Issue:** The brief told each worker to run its own crates' tests. The room door's and the server's agreement tests
pin fingerprints of whole fights that any rule crate can move, and none of the workers ran them.

**Suggested improvement:** For a worker that changes any crate under the rules, the brief's test line names

running 67 tests
test deck_door::tests::a_deck_whose_rows_do_not_hold_its_cells_does_not_read ... ok
test course_door_tests::the_course_s_asks_do_nothing_at_sea ... ok
test deck_door::tests::the_sloops_build_is_the_naval_rules_own ... ok
test deck_door::tests::the_built_in_sloops_deck_reads_and_its_helm_stands_on_it ... ok
test door_tests::a_browser_predicts_a_fighter_on_a_node_s_ground_as_its_room_steps_it ... ok
test door_tests::a_browser_predicts_a_fighter_on_a_nodes_ground_as_its_room_steps_it ... ok
test door_tests::a_browser_predicts_a_fighter_exactly_as_the_room_steps_it_and_reads_its_arms ... ok
test door_tests::a_course_that_is_not_whole_blocks_does_not_open ... ok
test door_tests::a_leaving_players_vestige_still_lying_is_in_their_character_before_the_room_lets_them_go ... ok
test climb_door_tests::a_foe_climbs_after_a_player_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly ... ok
test course_door_tests::a_course_s_player_joins_on_the_deck_and_the_page_stands_foes_and_puts_them_there ... ok
test door_tests::a_node_opens_on_its_ground_and_welcomes_with_its_id_and_rect ... ok
test door_tests::a_node_with_no_spawn_or_text_that_is_no_node_does_not_open ... ok
test door_tests::a_patrol_on_overlooks_island_stands_its_foes_at_the_voyages_seas_and_sends_its_nodes ... ok
test door_tests::a_locked_nodes_room_takes_no_player_and_says_why_and_any_other_takes_them ... ok
test door_tests::a_node_says_why_its_gate_shuts_to_a_kept_character_or_a_new_one ... ok
test door_tests::a_sea_that_keeps_characters_holds_a_players_course_until_the_keeper_says_none_is_kept ... ok
test door_tests::a_patrols_dungeon_opens_from_its_node_file_with_its_cache_shut_and_a_player_at_its_way_in ... ok
test door_tests::a_social_space_shows_the_days_wares_and_sells_them_for_aurem_at_the_vendors_counter ... ok
test door_tests::a_social_space_with_the_bounty_board_serves_its_asks_at_its_counter_and_one_without_has_none ... ok
test door_tests::a_patrols_room_is_joined_before_an_entrance_and_sends_its_entrances ... ok
test door_tests::an_open_sea_holds_the_unix_minute_it_is_set_to ... ok
test door_tests::an_elite_dungeon_is_laid_for_a_browser_by_its_place_and_its_node_sends_its_one_entrance ... ok
test door_tests::at_sea_each_sailors_gear_carries_their_own_characters_story_alone ... ok
test door_tests::each_player_at_sea_is_sent_only_those_walking_the_decks_of_the_ships_they_are_sent ... ok
test door_tests::each_player_at_sea_is_sent_the_hostile_ships_within_their_keeping_sight_and_the_players_within_60_km ... ok
test door_tests::at_sea_a_players_gear_is_sent_from_the_character_the_sea_keeps_once_it_changes ... ok
test door_tests::players_join_send_inputs_and_are_seen_as_the_movement_rules_step_them ... ok
test door_tests::a_course_is_furnished_and_each_players_gear_is_theirs_alone ... ok
test door_tests::the_sea_says_why_its_tier_shuts_to_a_kept_character_or_a_new_one ... ok
test door_tests::the_sea_takes_a_boarding_and_the_boarder_fights_on_its_deck ... ok
test door_tests::the_sea_takes_a_course_refuses_one_across_land_and_shows_each_ship ... ok
test door_tests::what_the_sea_tells_a_player_goes_to_them_alone ... ok
test dungeon_door::tests::a_dungeon_answers_every_field_of_the_pages_layout_each_consistent_with_the_rest ... ok
test dungeon_door::tests::a_dungeon_asked_by_its_seed_and_style_is_the_one_a_patrol_lays_by_them ... ok
test dungeon_door::tests::a_dungeon_reads_as_its_layout_named_for_its_patrol ... ok
test dungeon_door::tests::an_ask_that_does_not_read_or_names_no_dungeon_is_null ... ok
test dungeon_door::tests::the_agreed_dungeons_read_as_the_bytes_the_browser_checks ... ok
test fleet_door_tests::a_browser_predicting_its_ship_by_the_door_agrees_with_the_room_to_the_bit ... ok
test fleet_door_tests::a_fleet_room_puts_ships_to_sea_by_their_orders_and_shows_them ... ok
test fleet_door_tests::a_look_lays_through_the_door_as_the_fight_lays_it ... ok
test door_tests::every_open_node_file_the_bake_writes_opens_a_room_on_its_window_and_boxes ... ok
test door_tests::a_sea_where_rivals_clash_and_a_player_joins_them_snapshots_to_its_pinned_fingerprint ... ok
test garrison_door_tests::a_node_s_garrison_fights_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly ... ok
test garrison_door_tests::two_players_against_a_node_s_garrison_fight_to_the_same_fingerprint_natively_as_in_the_browser_s_webassembly ... ok
test isle_door::isle_door_tests::an_islands_room_checks_landings_and_only_a_sea_answers_one ... ok
test isle_door::isle_door_tests::the_plans_bits_are_the_ones_the_page_pins ... ok
test isle_door::isle_door_tests::the_sea_gives_its_word_on_an_island_by_its_dungeons_room_alone ... ok
test isle_door::isle_door_tests::the_page_is_given_the_islands_plan_and_the_ground_its_room_stands_on ... ok
test load_tests::load_at_sea_among_hostile_ships ... ignored, a measurement, run by hand in release
test load_tests::load_in_one_fight ... ignored, a measurement, run by hand in release
test load_tests::load_of_a_roads_groups_standing ... ignored, a measurement, run by hand in release, after `npm run bake`
test load_tests::load_of_a_roads_steps ... ignored, a measurement, run by hand in release, after `npm run bake`
test load_tests::load_on_decks ... ignored, a measurement, run by hand in release
test roster_door::tests::the_roster_reads_as_every_type_with_its_faction_ranks_and_hands ... ok
test isle_door::isle_door_tests::with_no_sea_open_there_is_no_word_on_an_island ... ok
test isle_door::isle_door_tests::an_islands_room_opens_on_the_seas_word_with_its_guards ... ok
test run_door::tests::the_gates_say_why_each_place_is_shut_to_a_level_and_its_story ... ok
test run_door::tests::what_is_on_reads_as_the_rules_draw_it ... ok
test run_door::tests::what_is_on_says_each_islands_levels_at_each_tier_the_weeks_levels_the_revives_and_each_modifiers_words ... ok
test waters_door::tests::a_request_that_does_not_read_answers_its_error ... ok
test run_door::tests::a_patrols_dungeons_run_opens_only_with_its_patrols_file_and_takes_no_player_while_the_patrol_is_locked ... ok
test run_door::tests::a_run_opens_from_its_ask_at_its_tier_with_its_revives_and_refuses_what_no_rule_lays ... ok
test waters_door::tests::the_door_answers_waters_grid_and_ships ... ok
test waters_door::tests::the_sea_by_weather_is_calm_in_a_roadstead_and_holds_to_its_fingerprint ... ok
test waters_door::tests::the_table_names_each_water_its_holder_and_its_levels ... ok
test door_tests::the_sea_opens_on_a_layout_with_its_ports_whose_lanes_the_tithe_patrols ... ok

test result: ok. 62 passed; 0 failed; 5 ignored; 0 measured; 0 filtered out; finished in 6.15s


running 0 tests

test result: ok. 0 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s and, after , the server's tests, and says how to show a repin is intended.

**Principle:** A change is tested where its effects are pinned, not only where its code lives.
