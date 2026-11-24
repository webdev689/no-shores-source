//! A zone's public events on the wire, as each snapshot carries them (`room::public::PublicSeen`).

use crate::wire::overlook::wire as messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use room::public::PublicSeen;

/// The events as the snapshot's `public` table.
pub(crate) fn public_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    seen: &PublicSeen,
) -> WIPOffset<messages::PublicEvent<'built>> {
    // An f32 steps by 0.25 m east where Saltmere's zones lie (2.1 to 3 million metres), finer north and far finer up:
    // a mark's place to within a quarter metre, which a prop's place can bear.
    let marks: Vec<_> = seen
        .marks
        .iter()
        .map(|mark| {
            let [x, y, z] = mark.at.map(|axis| axis as f32);
            messages::PublicMark::new(x, y, z, mark.health, mark.id, mark.kind, mark.state)
        })
        .collect();
    let marks = Some(builder.create_vector(&marks));
    let ground = Some(builder.create_vector(&seen.ground));
    let next_ground = Some(builder.create_vector(&seen.next_ground));
    let args = messages::PublicEventArgs {
        kind: seen.kind,
        phase: seen.phase,
        ground,
        radius: seen.radius,
        ticks_left: seen.ticks_left,
        next_kind: seen.next_kind,
        next_ground,
        next_ticks: seen.next_ticks,
        stage: seen.stage,
        stages: seen.stages,
        progress: seen.progress,
        needed: seen.needed,
        heroic: seen.heroic,
        heroic_ticks: seen.heroic_ticks,
        bonus: seen.bonus,
        marks,
        next_wave_ticks: seen.next_wave_ticks,
    };
    messages::PublicEvent::create(builder, &args)
}
