//! A Breach on the wire, as each snapshot carries it whole (`room::breach::seen::BreachSeen`): a few hundred bytes
//! at most, in its run or at its gate, so none is left out while it stands still.

use crate::wire::overlook::wire as messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use room::breach::seen::BreachSeen;

/// The Breach as the snapshot's `breach` table.
pub(crate) fn breach_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    seen: &BreachSeen,
) -> WIPOffset<messages::BreachSeen<'built>> {
    let inside: Vec<_> = seen
        .inside
        .iter()
        .map(|(name, tier, encounter)| {
            let name = Some(builder.create_string(name));
            messages::BreachInside::create(
                builder,
                &messages::BreachInsideArgs { name, tier: *tier, encounter: *encounter },
            )
        })
        .collect();
    let inside = Some(builder.create_vector(&inside));
    let phases = Some(builder.create_vector(&seen.phases));
    let stone_at = Some(builder.create_vector(&seen.stone_at));
    let marked = Some(builder.create_vector(&seen.marked));
    let mark_ticks = Some(builder.create_vector(&seen.mark_ticks));
    let raising = Some(builder.create_vector(&seen.raising));
    let raised = Some(builder.create_vector(&seen.raised));
    let counts = Some(builder.create_vector(&seen.counts));
    let bells = Some(builder.create_vector(&seen.bells));
    let bell_foes = Some(builder.create_vector(&seen.bell_foes));
    let rifts = Some(builder.create_vector(&seen.rifts));
    let rift_held = Some(builder.create_vector(&seen.rift_held));
    let away = Some(builder.create_vector(&seen.away));
    let open_to = Some(builder.create_vector(&seen.open_to));
    let holders = Some(builder.create_vector(&seen.holders));
    let args = messages::BreachSeenArgs {
        gate: seen.gate,
        tier: seen.tier,
        phases,
        reached: seen.reached,
        seals: seen.seals,
        revives: seen.revives,
        stone: seen.stone,
        bearer: seen.bearer,
        stone_at,
        charge: seen.charge,
        held: seen.held,
        lying_ticks: seen.lying_ticks,
        marked,
        mark_ticks,
        raising,
        raised,
        chests: seen.chests,
        encounter: seen.encounter,
        stage: seen.stage,
        stage_ticks: seen.stage_ticks,
        counts,
        bells,
        bell_foes,
        broken: seen.broken,
        ring_ticks: seen.ring_ticks,
        font_ticks: seen.font_ticks,
        boss: seen.boss,
        warded: seen.warded,
        desk: seen.desk,
        marked_desk: seen.marked_desk,
        desk_ticks: seen.desk_ticks,
        write_ticks: seen.write_ticks,
        seen: seen.seen,
        wipe_ticks: seen.wipe_ticks,
        rifts,
        rift_held,
        kept: seen.kept,
        takings: seen.takings,
        taking_ticks: seen.taking_ticks,
        away_shore: seen.away_shore,
        away,
        way_back: seen.way_back,
        bare_ticks: seen.bare_ticks,
        held_by: seen.held_by,
        fill: seen.fill,
        woken: seen.woken,
        claims: seen.claims,
        open_to,
        inside,
        holders,
    };
    messages::BreachSeen::create(builder, &args)
}

/// The Breach a snapshot carries, read back; none where it carries none.
#[must_use]
pub fn breach_of(snapshot: &messages::Snapshot<'_>) -> Option<BreachSeen> {
    let read = snapshot.breach()?;
    let bytes =
        |vector: Option<flatbuffers::Vector<'_, u8>>| vector.map(|vector| vector.bytes().to_vec()).unwrap_or_default();
    let numbers =
        |vector: Option<flatbuffers::Vector<'_, u32>>| vector.map(|vector| vector.iter().collect()).unwrap_or_default();
    let shorts =
        |vector: Option<flatbuffers::Vector<'_, u16>>| vector.map(|vector| vector.iter().collect()).unwrap_or_default();
    let at: Vec<f32> = read.stone_at().map(|vector| vector.iter().collect()).unwrap_or_default();
    let inside = read
        .inside()
        .map(|inside| {
            inside
                .iter()
                .map(|each| (each.name().unwrap_or_default().to_owned(), each.tier(), each.encounter()))
                .collect()
        })
        .unwrap_or_default();
    Some(BreachSeen {
        gate: read.gate(),
        tier: read.tier(),
        phases: bytes(read.phases()),
        reached: read.reached(),
        seals: read.seals(),
        revives: read.revives(),
        stone: read.stone(),
        bearer: read.bearer(),
        stone_at: [
            at.first().copied().unwrap_or(0.0),
            at.get(1).copied().unwrap_or(0.0),
            at.get(2).copied().unwrap_or(0.0),
        ],
        charge: read.charge(),
        held: read.held(),
        lying_ticks: read.lying_ticks(),
        marked: numbers(read.marked()),
        mark_ticks: numbers(read.mark_ticks()),
        raising: numbers(read.raising()),
        raised: shorts(read.raised()),
        chests: read.chests(),
        encounter: read.encounter(),
        stage: read.stage(),
        stage_ticks: read.stage_ticks(),
        counts: bytes(read.counts()),
        bells: bytes(read.bells()),
        bell_foes: numbers(read.bell_foes()),
        broken: read.broken(),
        ring_ticks: read.ring_ticks(),
        font_ticks: read.font_ticks(),
        boss: read.boss(),
        warded: read.warded(),
        desk: read.desk(),
        marked_desk: read.marked_desk(),
        desk_ticks: read.desk_ticks(),
        write_ticks: read.write_ticks(),
        seen: read.seen(),
        wipe_ticks: read.wipe_ticks(),
        rifts: bytes(read.rifts()),
        rift_held: shorts(read.rift_held()),
        kept: read.kept(),
        takings: read.takings(),
        taking_ticks: read.taking_ticks(),
        away_shore: read.away_shore(),
        away: numbers(read.away()),
        way_back: read.way_back(),
        bare_ticks: read.bare_ticks(),
        held_by: read.held_by(),
        fill: read.fill(),
        woken: read.woken(),
        claims: read.claims(),
        open_to: numbers(read.open_to()),
        holders: numbers(read.holders()),
        inside,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_breach_crosses_the_wire_and_reads_back_whole() {
        let seen = BreachSeen {
            tier: 1,
            phases: vec![2, 2, 1, 0, 0, 0],
            reached: 3,
            seals: 0b11,
            revives: 3,
            stone: 2,
            bearer: 7,
            stone_at: [1.5, -2.25, 60.0],
            charge: 500,
            held: 250,
            marked: vec![7, 9],
            mark_ticks: vec![600, 0],
            raising: vec![4, 9],
            raised: vec![333],
            chests: 0b101,
            encounter: 2,
            bells: vec![3, 0, 6],
            bell_foes: vec![41, 42],
            marked_desk: 2,
            rifts: vec![2, 0],
            rift_held: vec![1000, 120],
            away_shore: 1,
            away: vec![1, 2, 3, 4],
            inside: vec![("Wenna".to_owned(), 1, 4)],
            open_to: vec![11, 12],
            holders: vec![11, 13],
            ..BreachSeen::default()
        };
        let room = room::Room::breach_run(gear::breach::Tier::Hard, 0).expect("a run");
        let mut builder = FlatBufferBuilder::new();
        let breach = Some(breach_offset(&mut builder, &seen));
        let snapshot =
            messages::Snapshot::create(&mut builder, &messages::SnapshotArgs { breach, ..Default::default() });
        builder.finish(snapshot, None);
        let read = flatbuffers::root::<messages::Snapshot<'_>>(builder.finished_data()).expect("it reads");
        assert_eq!(breach_of(&read), Some(seen));
        assert!(room.breach_seen().is_some(), "a run carries its Breach");
    }
}
