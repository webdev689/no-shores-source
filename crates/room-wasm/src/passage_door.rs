//! The passages' doors: an island's week's web, a zone of it laid whole, and a hollow's ground, all built by the
//! `passage` crate from the island and the week exactly as the zone's room builds them, so a page draws and predicts
//! on the same ground.

use crate::dungeon_door::layout_json;
use crate::hand_over;
use passage::{Door, Laid, Plan, Web, Zone};
use serde_json::{Value, json};
use std::cell::RefCell;

/// A zone by its island, week and number.
type PlanKey = (String, u64, u16);

thread_local! {
    /// The last web built: a page asks for its zones in turn.
    static WEB: RefCell<Option<Web>> = const { RefCell::new(None) };
    /// The last zone laid, by its island, week and number: a page asks for its plan, then its heights.
    static PLAN: RefCell<Option<(PlanKey, Plan)>> = const { RefCell::new(None) };
}

/// The web an island's passages lay in a week, built once for every ask of that week; none for an island with none.
fn with_web<T>(island: &str, week: u64, use_web: impl FnOnce(&Web) -> T) -> Option<T> {
    let passages = passage::island(island)?;
    WEB.with(|built| {
        let mut built = built.borrow_mut();
        if built.as_ref().is_none_or(|web| web.week != week || web.island.id != passages.id) {
            *built = Some(Web::of(passages, week));
        }
        built.as_ref().map(use_web)
    })
}

/// A zone of an island's week's web laid whole, laid once for every ask of it in turn; none where the web holds no
/// such zone.
pub(crate) fn with_plan<T>(island: &str, week: u64, number: u16, use_plan: impl FnOnce(&Plan) -> T) -> Option<T> {
    let key = (island.to_owned(), week, number);
    let laid = PLAN.with(|laid| laid.borrow().as_ref().is_some_and(|(kept, _)| *kept == key));
    if !laid {
        let plan = with_web(island, week, |web| Plan::of(web, number)).flatten()?;
        PLAN.with(|laid| *laid.borrow_mut() = Some((key, plan)));
    }
    PLAN.with(|laid| laid.borrow().as_ref().map(|(_, plan)| use_plan(plan)))
}

fn door_json(door: &Door) -> Value {
    json!({ "at": door.at, "facing": door.facing })
}

fn zone_json(zone: &Zone, island: &str) -> Value {
    let ground = match &zone.ground {
        passage::Ground::Under { style } => json!({ "kind": "under", "style": style }),
        passage::Ground::Open { form } => json!({ "kind": "open", "form": form.key() }),
    };
    let strength = passage::strength(zone.depth);
    let currents: Vec<Value> = zone
        .currents
        .iter()
        .map(|current| json!({ "key": current.key(), "name": current.name(), "words": current.words(strength), "boon": current.is_boon() }))
        .collect();
    json!({
        "number": zone.number,
        "depth": zone.depth,
        "lane": zone.lane,
        "at": zone.at,
        "ground": ground,
        "size": zone.size.key(),
        "deal": zone.deal.key(),
        "currents": currents,
        "name": zone.name,
        "onward": zone.onward,
        "public": zone.public,
        "lamp": passage::lamp_number(zone.depth),
        "levels": gear::world::island_levels(island).map(|band| passage::levels(band, zone.depth)),
    })
}

/// An island's passages for a week as JSON: its patrol zone, its mouths (each its run's name and the zone it leads
/// to), the week's two modifiers (each its key, name and words) and every zone: its number, depth, lane, place on the
/// island (x, y), ground (under ground its style, above ground its form), size, deal, currents (key, name, words at
/// its depth's strength, whether a boon), name, the zones its onward mouths lead to, whether it lies on the week's
/// public way, its lamp's number and its foes' levels, lowest and highest, as its room stands them. Empty for an
/// island with no passages.
#[must_use]
pub fn web_json(island: &str, week: u64) -> String {
    let json = |web: &Web| {
        let mouths: Vec<Value> =
            web.island.mouths.iter().zip(&web.mouths).map(|(run, zone)| json!({ "run": run, "zone": zone })).collect();
        let modifiers: Vec<Value> = gear::passages::week_modifiers(&web.island.id, week)
            .iter()
            .map(|modifier| json!({ "key": modifier.key(), "name": modifier.name(), "words": modifier.words() }))
            .collect();
        json!({
            "island": web.island.id,
            "patrol": web.island.patrol,
            "week": web.week,
            "mouths": mouths,
            "modifiers": modifiers,
            "zones": web.zones.iter().map(|zone| zone_json(zone, &web.island.id)).collect::<Vec<_>>(),
        })
        .to_string()
    };
    with_web(island, week, json).unwrap_or_default()
}

/// A zone laid whole as JSON: the zone (as `web_json` gives it), the climate its hollow is dressed in, its ground
/// (under ground the Forge's layout as a dungeon's is given, above ground every module set in it as [number, x, y, z,
/// turn, scale, lift], the blocks its modules stand as and its section's ring), its sites (where a body arrives and
/// faces, the way in, the onward mouths in the zone's order, the farthest of them by its place, the lamp, the foes'
/// posts and the spots) and its pieces (each its module's name, its kind, its number among its kind, where it stands
/// (x, y, z) and the way its front faces), with every piece's solids as [west, north, east, south, top]. Empty for a
/// zone the web does not hold.
#[must_use]
pub fn zone_plan_json(island: &str, week: u64, number: u16) -> String {
    let json = |plan: &Plan| {
        let climate = &passage::island(island)?.climate;
        let ground = match &plan.ground {
            Laid::Under(dungeon) => json!({ "kind": "under", "layout": layout_json(dungeon, &plan.zone.name) }),
            Laid::Open(hollow) => {
                let placements: Vec<[f64; 7]> = hollow
                    .placements
                    .iter()
                    .map(|each| {
                        [f64::from(each.module), each.at[0], each.at[1], each.at[2], each.turn, each.scale, each.lift]
                    })
                    .collect();
                let blocks: Vec<[f64; 5]> = hollow
                    .blocks
                    .iter()
                    .map(|block| [block.min_x, block.min_y, block.max_x, block.max_y, block.top])
                    .collect();
                json!({ "kind": "open", "placements": placements, "blocks": blocks, "ring": hollow.ring })
            }
        };
        let sites = &plan.sites;
        let pieces: Vec<Value> = plan
            .pieces
            .iter()
            .map(|piece| {
                let (kind, number) = piece_kind(piece.kind);
                json!({ "module": piece.kind.module(), "kind": kind, "number": number, "at": piece.at, "facing": piece.facing })
            })
            .collect();
        Some(
            json!({
                "zone": zone_json(&plan.zone, island),
                "climate": climate,
                "ground": ground,
                "sites": {
                    "arrive": sites.arrive,
                    "facing": sites.facing,
                    "wayIn": door_json(&sites.way_in),
                    "onward": sites.onward.iter().map(door_json).collect::<Vec<_>>(),
                    "far": sites.far_mouth(),
                    "lamp": sites.lamp,
                    "posts": sites.posts,
                    "spots": sites.spots,
                },
                "pieces": pieces,
                "solids": plan.piece_solids(),
            })
            .to_string(),
        )
    };
    with_plan(island, week, number, json).flatten().unwrap_or_default()
}

/// A piece's kind by name and its number among its kind's.
fn piece_kind(kind: passage::PieceKind) -> (&'static str, u8) {
    use passage::PieceKind::{Kindle, Lamp, Mouth, Node, Post, Reliquary, Ring, WayIn};
    match kind {
        WayIn => ("way-in", 0),
        Mouth(number) => ("mouth", number),
        Lamp => ("lamp", 0),
        Kindle(number) => ("kindle", number),
        Post(number) => ("post", number),
        Node(number) => ("node", number),
        Reliquary => ("reliquary", 0),
        Ring => ("ring", 0),
    }
}

/// A zone above ground's ground as `movement::Heights::to_floats` gives it, little-endian, in the zone's own frame:
/// what a page predicts its body on, to the bit. Empty for a zone under ground or one the web does not hold.
#[must_use]
pub fn zone_heights(island: &str, week: u64, number: u16) -> Vec<u8> {
    let floats = with_plan(island, week, number, |plan| match &plan.ground {
        Laid::Open(hollow) => hollow.ground.to_floats(),
        Laid::Under(_) => Vec::new(),
    });
    floats.unwrap_or_default().iter().flat_map(|number| number.to_le_bytes()).collect()
}

/// The text written at `address`.
///
/// # Safety
/// `address` must point at `length` readable bytes.
unsafe fn text_at(address: *const u8, length: usize) -> String {
    // SAFETY: the caller promises `length` readable bytes at `address`.
    String::from_utf8_lossy(unsafe { std::slice::from_raw_parts(address, length) }).into_owned()
}

/// An island's week's web as JSON (`web_json`), its island's id written at `address`.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_passage_web(week: u32, address: *const u8, length: usize) -> u64 {
    // SAFETY: as this function's own.
    let island = unsafe { text_at(address, length) };
    hand_over(web_json(&island, u64::from(week)).into_bytes())
}

/// A zone of an island's week's web laid whole as JSON (`zone_plan_json`).
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_passage_zone(week: u32, zone: u32, address: *const u8, length: usize) -> u64 {
    // SAFETY: as this function's own.
    let island = unsafe { text_at(address, length) };
    let number = u16::try_from(zone).unwrap_or(u16::MAX);
    hand_over(zone_plan_json(&island, u64::from(week), number).into_bytes())
}

/// A zone above ground's ground's numbers (`zone_heights`).
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_passage_heights(week: u32, zone: u32, address: *const u8, length: usize) -> u64 {
    // SAFETY: as this function's own.
    let island = unsafe { text_at(address, length) };
    let number = u16::try_from(zone).unwrap_or(u16::MAX);
    hand_over(zone_heights(&island, u64::from(week), number))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_page_reads_the_web_and_every_zone_of_it() {
        let web: Value = serde_json::from_str(&web_json("continent-1", 2_900)).unwrap();
        assert_eq!(web["patrol"], "saltgrass-downs");
        assert_eq!(web["mouths"].as_array().unwrap().len(), 3);
        assert_eq!(web["modifiers"].as_array().unwrap().len(), 2);
        let zones = web["zones"].as_array().unwrap();
        assert_eq!(zones.last().unwrap()["depth"], 20);
        // Each zone's foes' levels as its room stands them: the island's band raised by depth.
        assert_eq!(zones[0]["levels"], json!([1, 4]));
        assert_eq!(zones.last().unwrap()["levels"], json!([27, 30]));
        for zone in zones {
            let number = zone["number"].as_u64().unwrap() as u16;
            let text = zone_plan_json("continent-1", 2_900, number);
            let known = zone["ground"]["kind"] == "open"
                || dungeon::style_of(zone["ground"]["style"].as_str().unwrap()).is_some();
            if !known {
                continue;
            }
            let plan: Value = serde_json::from_str(&text).unwrap_or_else(|_| panic!("zone {number}'s plan reads"));
            assert_eq!(plan["climate"], "woodland", "zone {number} is drawn in the climate it is dressed in");
            assert_eq!(plan["sites"]["onward"].as_array().unwrap().len(), zone["onward"].as_array().unwrap().len());
            let heights = zone_heights("continent-1", 2_900, number);
            assert_eq!(
                heights.is_empty(),
                zone["ground"]["kind"] == "under",
                "zone {number}: heights above ground only"
            );
        }
        assert!(web_json("continent-9", 2_900).is_empty(), "no passages there yet");
    }
}
