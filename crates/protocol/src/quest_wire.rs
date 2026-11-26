//! What the gear message carries of the houses' roads: the quest walked, its task and that task's counts, each quest
//! done, each Art's earned bits and fragment choices, where the task's first unmet goal with a place stands in the
//! player's room, and their step there: its clock, each goal's failures, its points, its figure, its ward and its
//! horde.

use flatbuffers::{FlatBufferBuilder, Vector, WIPOffset};
use gear::Character;
use room::{PlayerId, Room};

/// The quest fields of the gear message, built.
pub(crate) struct Quests<'built> {
    pub quest: u8,
    pub task: u8,
    pub counts: WIPOffset<Vector<'built, u16>>,
    pub done: WIPOffset<Vector<'built, u8>>,
    pub earned: WIPOffset<Vector<'built, u8>>,
    pub choices: WIPOffset<Vector<'built, u8>>,
    pub at: WIPOffset<Vector<'built, f64>>,
    pub clock: f64,
    pub fails: WIPOffset<Vector<'built, u16>>,
    pub points: WIPOffset<Vector<'built, f64>>,
    pub figures: WIPOffset<Vector<'built, f64>>,
    pub ward: WIPOffset<Vector<'built, f64>>,
    pub horde: WIPOffset<Vector<'built, u16>>,
}

/// Builds the quest fields for a player of `room`: the quest by its place in the file counted from 1 (0 for none).
pub(crate) fn quests_of<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    room: &Room,
    player: PlayerId,
    character: &Character,
) -> Quests<'built> {
    let now = character.quest_now();
    let number = |at: usize| u8::try_from(at).unwrap_or(u8::MAX);
    let arts = &gear::arts::arts().arts;
    let done: Vec<u8> = character.quests_done().into_iter().map(u8::from).collect();
    // A horde lends its player the worn Art whole while it runs, so the page shows and casts every ability of it.
    let lent = |art: u8| if room.unbounded(player) && character.arts.worn == art { gear::arts::ALL_EARNED } else { 0 };
    let earned: Vec<u8> = arts.iter().map(|art| character.earned(art.id) | lent(art.id)).collect();
    let choices: Vec<u8> = arts.iter().map(|art| character.fragment_choices(art.id)).collect();
    let at = room.quest_at(player).map_or_else(Vec::new, |at| at.to_vec());
    let step = room.step_seen(player);
    Quests {
        quest: now.map_or(0, |(quest, _)| number(quest).saturating_add(1)),
        task: now.map_or(0, |(_, task)| number(task)),
        counts: builder.create_vector(&character.quest_counts()),
        done: builder.create_vector(&done),
        earned: builder.create_vector(&earned),
        choices: builder.create_vector(&choices),
        at: builder.create_vector(&at),
        clock: step.clock,
        fails: builder.create_vector(&step.fails),
        points: builder.create_vector(&step.points),
        figures: builder.create_vector(&step.figures),
        ward: builder.create_vector(&step.ward),
        horde: builder.create_vector(&step.horde),
    }
}
