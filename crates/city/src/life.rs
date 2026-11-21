//! The life of a social space, as the page shows it: the ways its townsfolk walk (points with their names, joined by
//! links) and the posts where someone works, plays or stays a while, each with its task and facing. The page finds
//! its people's routes over the ways and walks them on the world clock, so every browser shows the same people in the
//! same places; the plan only lays them out. `check` (in tests) walks every way with the movement rules.

use serde::Serialize;

#[cfg(test)]
pub(crate) mod check;

/// How far a way keeps from every box either side of its line, metres: room for a body (0.6 m) and the 0.7 m a walker
/// keeps right of the way's middle.
pub(crate) const CLEAR_M: f64 = 1.3;

/// A point of the ways: where it stands, and what it is: "counter:mage", "view:seaward-2", or "" for a plain turn.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct WayPoint {
    pub at: [f64; 2],
    pub name: String,
}

/// The ways a social space's townsfolk walk: its points, and the links between them by their place in `points`, each
/// walked either way.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Ways {
    pub points: Vec<WayPoint>,
    pub links: Vec<[u32; 2]>,
}

/// What someone does at a post: a move the forge draws for every townsfolk garment, by its name there. An
/// instrument's task names its instrument, which the forge draws in hand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Task {
    /// Standing at ease: looking at the view, waiting at a counter.
    Idle,
    Sweep,
    Carry,
    Smith,
    Gesture,
    Drink,
    Dance,
    Juggle,
    Charm,
    Hold,
    Pray,
    Beg,
    LeanCane,
    PlayLute,
    PlayFlute,
    PlayRecorder,
    PlayTambourine,
}

/// Who keeps a post: one person always there; one person walking the posts of round `n` in order, working at each;
/// or the walkers, who come by and stay a while.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Keep {
    Kept,
    Round(u32),
    Visited,
}

/// A place where someone works, plays or stays: what they do, where they stand and face (radians clockwise from
/// north), who keeps it, and the way point it is reached from, by its place in the ways' points.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Post {
    pub task: Task,
    pub at: [f64; 2],
    pub facing: f64,
    pub keep: Keep,
    pub reached_from: u32,
}

impl Ways {
    /// Adds a point, answering its place among the points.
    pub fn point(&mut self, at: [f64; 2], name: &str) -> u32 {
        self.points.push(WayPoint { at, name: name.to_owned() });
        u32::try_from(self.points.len() - 1).expect("fewer than 2^32 way points")
    }

    /// Lays a straight way through `points` in turn, each linked to the next.
    pub fn line(&mut self, points: &[u32]) {
        self.links.extend(points.windows(2).map(|pair| [pair[0], pair[1]]));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_post_reads_to_the_page_as_its_move_and_keeper() {
        let post = Post { task: Task::PlayLute, at: [1.0, 2.0], facing: 0.5, keep: Keep::Round(2), reached_from: 3 };
        let read = serde_json::to_value(post).expect("a post writes");
        assert_eq!(read["task"], "play_lute");
        assert_eq!(read["keep"], serde_json::json!({ "round": 2 }));
        assert_eq!(serde_json::to_value(Keep::Visited).expect("writes"), "visited");
        assert_eq!(serde_json::to_value(Task::LeanCane).expect("writes"), "lean_cane");
    }

    #[test]
    fn a_line_links_its_points_in_turn() {
        let mut ways = Ways::default();
        let points: Vec<u32> = (0..3).map(|nth| ways.point([f64::from(nth), 0.0], "")).collect();
        ways.line(&points);
        assert_eq!(ways.links, vec![[0, 1], [1, 2]]);
    }
}
