//! The reach of a node's section for the browser, so a page with no room judges its edge by the room's own rules:
//! JavaScript hands over the section once, then ticks the body's place against it and asks to respawn.

use reach::{Section, Standing, respawn_point};
use std::cell::RefCell;

thread_local! {
    static SECTION: RefCell<Option<Section>> = const { RefCell::new(None) };
    static STANDING: RefCell<Standing> = const { RefCell::new(Standing::Inside) };
}

/// Keeps a section from its JSON (`{ "ring": [[x, y]…], "spawns": [[x, y]…] }`) and stands the body inside it; text
/// that is not one clears it. Answers whether it was one.
pub fn set_section(text: &[u8]) -> bool {
    let read = |value: &serde_json::Value, key: &str| -> Option<Vec<[f64; 2]>> {
        value
            .get(key)?
            .as_array()?
            .iter()
            .map(|point| Some([point.get(0)?.as_f64()?, point.get(1)?.as_f64()?]))
            .collect()
    };
    let section = serde_json::from_slice::<serde_json::Value>(text)
        .ok()
        .and_then(|value| Some(Section { ring: read(&value, "ring")?, spawns: read(&value, "spawns")? }))
        .filter(|section| section.ring.len() >= 3);
    let kept = section.is_some();
    SECTION.with(|slot| *slot.borrow_mut() = section);
    STANDING.with(|standing| *standing.borrow_mut() = Standing::Inside);
    kept
}

/// The standing as one number: its kind in the top two bits (0 inside, 1 warned, 2 dead) and its ticks below.
#[must_use]
pub fn packed(standing: Standing) -> u32 {
    match standing {
        Standing::Inside => 0,
        Standing::Warned { ticks_left } => (1 << 30) | ticks_left.min((1 << 30) - 1),
        Standing::Dead { ticks } => (2 << 30) | ticks.min((1 << 30) - 1),
    }
}

/// One tick of the body at (x, y) against the kept section; inside always with none kept.
pub fn tick(x: f64, y: f64) -> u32 {
    let next = SECTION.with(|slot| {
        let standing = STANDING.with(|standing| *standing.borrow());
        slot.borrow().as_ref().map_or(Standing::Inside, |section| standing.tick(section, x, y))
    });
    STANDING.with(|standing| *standing.borrow_mut() = next);
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

    #[test]
    fn a_body_walking_out_is_warned_then_dies_and_respawns_once_allowed() {
        assert!(set_section(SQUARE.as_bytes()));
        assert_eq!(tick(50.0, 50.0), 0);
        let warned = tick(120.0, 50.0);
        assert_eq!(warned >> 30, 1);
        assert_eq!(warned & ((1 << 30) - 1), reach::WARNING_TICKS - 1);
        assert_eq!(tick(170.0, 50.0) >> 30, 2, "60 m past the edge kills at once");
        assert_eq!(respawn(95.0, 95.0), None, "too soon");
        for _ in 0..reach::RESPAWN_TICKS {
            tick(170.0, 50.0);
        }
        assert_eq!(respawn(95.0, 95.0), Some([90.0, 90.0]));
        assert_eq!(tick(90.0, 90.0), 0);
    }

    #[test]
    fn text_that_is_not_a_section_clears_it() {
        assert!(!set_section(b"null"));
        assert_eq!(tick(1.0e6, 1.0e6), 0);
    }
}
