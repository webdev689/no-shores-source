//! An Elite Dungeon's encounters on the wire, as each snapshot carries them whole (`room::EncounterSeen`): a few dozen
//! bytes, so none are left out while they stand still.

use crate::wire::overlook::wire as messages;
use flatbuffers::{FlatBufferBuilder, WIPOffset};
use room::encounters::EncounterSeen;

/// The encounters as the snapshot's `encounter` table.
pub(crate) fn encounter_offset<'built>(
    builder: &mut FlatBufferBuilder<'built>,
    seen: &EncounterSeen,
) -> WIPOffset<messages::EncounterSeen<'built>> {
    let seals: Vec<_> = seen
        .seals
        .iter()
        .map(|seal| {
            let marks = Some(builder.create_vector(&seal.marks));
            let args = messages::SealSeenArgs {
                kind: seal.kind,
                state: seal.state,
                progress: seal.progress,
                marks,
                relic: seal.relic,
            };
            messages::SealSeen::create(builder, &args)
        })
        .collect();
    let seals = Some(builder.create_vector(&seals));
    let anchors = Some(builder.create_vector(&seen.anchors));
    let args = messages::EncounterSeenArgs {
        seals,
        woken: seen.woken,
        boss: seen.boss,
        ward: seen.ward,
        wards_broken: seen.wards_broken,
        anchors,
        reckoning_ticks: seen.reckoning_ticks,
        reckoning_at: seen.reckoning_at,
        fury: seen.fury,
        fury_ticks: seen.fury_ticks,
        slam_ticks: seen.slam_ticks,
    };
    messages::EncounterSeen::create(builder, &args)
}

/// The encounters a snapshot carries, read back; none where it carries none.
#[must_use]
pub fn encounter_of(snapshot: &messages::Snapshot<'_>) -> Option<EncounterSeen> {
    let read = snapshot.encounter()?;
    let seals = read
        .seals()
        .map(|seals| {
            seals
                .iter()
                .map(|seal| room::encounters::SealSeen {
                    kind: seal.kind(),
                    state: seal.state(),
                    progress: seal.progress(),
                    marks: seal.marks().map(|marks| marks.bytes().to_vec()).unwrap_or_default(),
                    relic: seal.relic(),
                })
                .collect()
        })
        .unwrap_or_default();
    Some(EncounterSeen {
        seals,
        woken: read.woken(),
        boss: read.boss(),
        ward: read.ward(),
        wards_broken: read.wards_broken(),
        anchors: read.anchors().map(|anchors| anchors.iter().collect()).unwrap_or_default(),
        reckoning_ticks: read.reckoning_ticks(),
        reckoning_at: read.reckoning_at(),
        fury: read.fury(),
        fury_ticks: read.fury_ticks(),
        slam_ticks: read.slam_ticks(),
    })
}
