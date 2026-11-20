//! The reach of a node's section for the browser, so a page with no room judges its edge by the room's own rules:
//! JavaScript hands over the section once, then ticks the body's place against it and asks to respawn.

use reach::{Place, Section, Standing, respawn_point};
use std::cell::RefCell;

thread_local! {
    static SECTION: RefCell<Option<Section>> = const { RefCell::new(None) };
    static STANDING: RefCell<Standing> = const { RefCell::new(Standing::Inside) };
    /// The height the body last stood at (`reach::stood`); none yet, so nothing counts as a fall, until it stands.
    static STOOD: RefCell<f64> = const { RefCell::new(f64::NEG_INFINITY) };
}

/// Keeps a section from its JSON (`{ "ring": [[x, y]…], "spawns": [[x, y]…], "falls_kill": b, "standing": n }`,
/// `falls_kill` false when left out) and stands the body
/// as `standing` packs it (`packed`), taking up where a room's word left it, or inside; text that is not one clears
/// it. Answers whether it was one.
pub fn set_section(text: &[u8]) -> bool {
    let read = |value: &serde_json::Value, key: &str| -> Option<Vec<[f64; 2]>> {
        value
            .get(key)?
            .as_array()?
            .iter()
            .map(|point| Some([point.get(0)?.as_f64()?, point.get(1)?.as_f64()?]))
            .collect()
    };
    let value = serde_json::from_slice::<serde_json::Value>(text).ok();
    let section = value
        .as_ref()
        .and_then(|value| {
            let falls_kill = value.get("falls_kill").and_then(serde_json::Value::as_bool).unwrap_or(false);
            Some(Section { ring: read(value, "ring")?, spawns: read(value, "spawns")?, falls_kill })
        })
        .filter(|section| section.ring.len() >= 3);
    let kept = section.is_some();
    let standing = value
        .as_ref()
        .and_then(|value| value.get("standing")?.as_u64())
        .and_then(|number| u32::try_from(number).ok())
        .filter(|_| kept)
        .map_or(Standing::Inside, unpacked);
    SECTION.with(|slot| *slot.borrow_mut() = section);
    STANDING.with(|slot| *slot.borrow_mut() = standing);
    STOOD.with(|slot| *slot.borrow_mut() = f64::NEG_INFINITY);
    kept
}

/// A standing from its one number (`packed`).
fn unpacked(number: u32) -> Standing {
    let ticks = number & ((1 << 30) - 1);
    match number >> 30 {
        1 => Standing::Warned { ticks_left: ticks },
        2 => Standing::Dead { ticks, fell: false },
        3 => Standing::Dead { ticks, fell: true },
        _ => Standing::Inside,
    }
}

/// The standing as one number: its kind in the top two bits (0 inside, 1 warned, 2 dead by straying, 3 dead by a fall)
/// and its ticks below.
#[must_use]
pub fn packed(standing: Standing) -> u32 {
    match standing {
        Standing::Inside => 0,
        Standing::Warned { ticks_left } => (1 << 30) | ticks_left.min((1 << 30) - 1),
        Standing::Dead { ticks, fell } => (if fell { 3 << 30 } else { 2 << 30 }) | ticks.min((1 << 30) - 1),
    }
}

/// One tick of the body at `at` against the kept section, judged from the height it last stood at, which it then
/// keeps; inside always with none kept.
pub fn tick(at: Place) -> u32 {
    let stood = STOOD.with(|stood| *stood.borrow());
    let next = SECTION.with(|slot| {
        let standing = STANDING.with(|standing| *standing.borrow());
        slot.borrow().as_ref().map_or(Standing::Inside, |section| standing.tick(section, at, stood))
    });
    STANDING.with(|standing| *standing.borrow_mut() = next);
    STOOD.with(|slot| *slot.borrow_mut() = reach::stood(stood, at));
    packed(next)
}

/// Respawns a body that died at (x, y), once allowed: the spawn it stands at, the standing inside again.
pub fn respawn(x: f64, y: f64) -> Option<[f64; 2]> {
    let allowed = STANDING.with(|standing| standing.borrow().may_respawn());
    let point = SECTION.with(|slot| slot.borrow().as_ref().and_then(|section| respawn_point(section, x, y)))?;
    allowed.then(|| {
        STANDING.with(|standing| *standing.borrow_mut() = Standing::Inside);
        point
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SQUARE: &str = r#"{"ring":[[0,0],[100,0],[100,100],[0,100]],"spawns":[[10,10],[90,90]]}"#;

    /// A body with its feet on the ground at (x, y), or in the air at `z`.
    fn on_foot(x: f64, y: f64) -> Place {
        Place { x, y, z: 0.0, aloft: false }
    }
    fn aloft(z: f64) -> Place {
        Place { x: 50.0, y: 50.0, z, aloft: true }
    }

    #[test]
    fn a_body_walking_out_is_warned_then_dies_and_respawns_once_allowed() {
        assert!(set_section(SQUARE.as_bytes()));
        assert_eq!(tick(on_foot(50.0, 50.0)), 0);
        let warned = tick(on_foot(120.0, 50.0));
        assert_eq!(warned >> 30, 1);
        assert_eq!(warned & ((1 << 30) - 1), reach::WARNING_TICKS - 1);
        assert_eq!(tick(on_foot(170.0, 50.0)) >> 30, 2, "60 m past the edge kills at once");
        assert_eq!(respawn(95.0, 95.0), None, "too soon");
        for _ in 0..reach::RESPAWN_TICKS {
            tick(on_foot(170.0, 50.0));
        }
        assert_eq!(respawn(95.0, 95.0), Some([90.0, 90.0]));
        assert_eq!(tick(on_foot(90.0, 90.0)), 0);
    }

    #[test]
    fn a_section_taken_up_after_a_room_keeps_the_body_dead_as_the_room_had_it() {
        let dead =
            SQUARE.replace('}', &format!(r#","standing":{}}}"#, packed(Standing::Dead { ticks: 5, fell: true })));
        assert!(set_section(dead.as_bytes()));
        assert_eq!(
            tick(on_foot(50.0, 50.0)),
            packed(Standing::Dead { ticks: 6, fell: true }),
            "still dead, as it died"
        );
        assert_eq!(respawn(95.0, 95.0), None, "too soon, as the room had it");
    }

    #[test]
    fn a_social_space_s_section_kills_a_fall_of_six_metres_as_the_room_does() {
        let social = SQUARE.replace('}', r#","falls_kill":true}"#);
        assert!(set_section(social.as_bytes()));
        assert_eq!(tick(aloft(80.0)), 0, "never stood yet, so no fall to measure");
        assert_eq!(tick(Place { aloft: false, ..aloft(87.0) }), 0);
        assert_eq!(tick(aloft(81.1)), 0, "5.9 m down");
        assert_eq!(tick(aloft(81.0)), packed(Standing::Dead { ticks: 0, fell: true }), "6 m down");
        assert!(set_section(SQUARE.as_bytes()));
        assert_eq!(tick(Place { aloft: false, ..aloft(87.0) }), 0);
        assert_eq!(tick(aloft(40.0)), 0, "away from a social space, a fall does no harm");
    }

    #[test]
    fn text_that_is_not_a_section_clears_it() {
        assert!(!set_section(b"null"));
        assert_eq!(tick(on_foot(1.0e6, 1.0e6)), 0);
    }
}
