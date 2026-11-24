//! Each player's guild in a room: what a member gives, measured from the room's mark; what they do toward the week's
//! guild bounties, together or alone; and a claim.

use super::{GuildSeen, Guilds};
use gear::Character;
use gear::asks::Refusal;
use gear::dice::Dice;
use gear::guild::{Boons, SLOTS, Standing, bounties_of, numbers};
use gear::objectives::{Feat, Objective};
use gear::world::Difficulty;

const WEEK: u64 = 2_916;
const DICE: Dice = Dice { seed: 7, tick: 1, player: 1 };

fn seen(id: &str) -> Option<GuildSeen> {
    Some(GuildSeen {
        id: id.to_owned(),
        standing: Standing { done: [true; SLOTS], before_the_week: true, week: Some(WEEK) },
        boons: Boons::default(),
    })
}

/// Gives once for one player, their character kept as theirs.
fn give(guilds: &mut Guilds, character: &mut Character) -> Vec<u32> {
    guilds.give(WEEK, std::iter::once((1, character, true)))
}

#[test]
fn a_member_gives_a_tenth_of_what_they_gain_and_nothing_of_what_came_before_they_joined() {
    let (mut guilds, mut character) = (Guilds::default(), Character::starting());
    character.xp = 80_000;
    guilds.set(1, None, character.xp);
    give(&mut guilds, &mut character);
    character.xp += 4_000;
    give(&mut guilds, &mut character);
    assert_eq!(character.guild.given, 0, "in no guild, nothing is given");
    guilds.set(1, seen("salt"), character.xp);
    character.xp += 4_000;
    give(&mut guilds, &mut character);
    assert_eq!(character.guild.given, 400, "a tenth of what came after joining alone");
}

#[test]
fn a_character_given_back_in_place_of_the_starting_one_is_measured_afresh_not_counted() {
    let (mut guilds, mut character) = (Guilds::default(), Character::starting());
    guilds.set(1, seen("salt"), 0);
    guilds.give(WEEK, std::iter::once((1, &mut character, false)));
    character.xp = 900_000;
    guilds.give(WEEK, std::iter::once((1, &mut character, true)));
    assert_eq!(character.guild.given, 0, "the kept character's XP is no gain");
    character.xp += 2_000;
    give(&mut guilds, &mut character);
    assert_eq!(character.guild.given, 200);
}

#[test]
fn a_jump_past_any_one_tick_s_pay_is_measured_afresh() {
    let (mut guilds, mut character) = (Guilds::default(), Character::starting());
    guilds.set(1, seen("salt"), 0);
    give(&mut guilds, &mut character);
    character.xp += 400_000;
    give(&mut guilds, &mut character);
    assert_eq!(character.guild.given, 0);
}

#[test]
fn a_member_of_the_same_guild_in_the_room_makes_a_feat_together_and_one_of_another_does_not() {
    let (week, slot) = (0..500)
        .find_map(|week| {
            let slot = bounties_of(week).into_iter().position(|place| {
                let bounty = &numbers().bounties[place];
                bounty.together && matches!(bounty.objective, Objective::Clear { tier: Some(Difficulty::Abyss), .. })
            })?;
            Some((week, slot))
        })
        .expect("some week draws one");
    let mut guilds = Guilds::default();
    let cleared = Feat::Cleared { island: Some("continent-1"), tier: Difficulty::Abyss };
    let [mut ada, mut ben] = [Character::starting(), Character::starting()];
    guilds.set(1, seen("salt"), 0);
    guilds.set(2, seen("brine"), 0);
    guilds.saw(1, &mut ada, week, &cleared, &[1, 2]);
    assert_eq!(ada.guild.counts[slot], 0, "the other is of another guild");
    guilds.set(2, seen("salt"), 0);
    guilds.saw(1, &mut ada, week, &cleared, &[1, 2]);
    assert_eq!(ada.guild.counts[slot], 1, "two of the guild together");
    guilds.saw(2, &mut ben, week, &cleared, &[2]);
    assert_eq!(ben.guild.counts[slot], 0, "alone, it does not count");
}

#[test]
fn a_claim_needs_a_guild_and_pays_by_what_the_accounts_said() {
    let (mut guilds, mut character) = (Guilds::default(), Character::starting());
    assert_eq!(guilds.claim(1, &mut character, WEEK, 0, &DICE), Err(Refusal::NotInGuild));
    guilds.set(1, seen("salt"), 0);
    assert_eq!(guilds.claim(1, &mut character, WEEK, 0, &DICE), Ok(()));
    assert_eq!(character.vestiges.len(), 1);
}

#[test]
fn a_player_gone_from_the_room_is_let_go() {
    let (mut guilds, mut character) = (Guilds::default(), Character::starting());
    guilds.set(1, seen("salt"), 0);
    guilds.set(2, seen("salt"), 0);
    give(&mut guilds, &mut character);
    assert!(guilds.of(1).is_some());
    assert!(guilds.of(2).is_none(), "not among those given");
}

#[test]
fn each_member_holds_their_guilds_boons_and_loses_them_on_leaving_it() {
    let mut guilds = Guilds::default();
    let mut character = Character::starting();
    let boons = Boons { xp: 10, aurem: 5, reputation: 15 };
    let seen = GuildSeen { id: "salt".to_owned(), standing: Standing::default(), boons };
    guilds.set(1, Some(seen), character.xp);
    guilds.give(0, std::iter::once((1, &mut character, true)));
    assert_eq!(character.boons, boons);
    guilds.set(1, None, character.xp);
    guilds.give(0, std::iter::once((1, &mut character, true)));
    assert_eq!(character.boons, Boons::default());
}
