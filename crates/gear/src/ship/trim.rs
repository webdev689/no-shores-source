//! What a ship's fitted modules and her posted officers make of her numbers at sea, as one trim the sea's rules read:
//! each module's and officer's chosen perks by the words they are written with (`content/gear/traits.json`), and each
//! post's own work, by how well its officer holds it. A factor of 1 changes nothing.

use crate::character::Character;
use crate::crew::{Duty, Post};

/// Her trim: factors on her guns' reload and scatter, on what her balls do to a ship's hull, canvas and men (and to
/// one below a third of her hull), on her way and her turning, on what balls do to her own hull, canvas and men (and to
/// her hull below a third of it, and below her waterline), on her ram's harm, on her Carpenter's patches and on how
/// far she sights; how many more hands board with her; and each post's work, 0 when none holds it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ShipTrim {
    pub reload: f64,
    pub scatter: f64,
    pub harm_hull: f64,
    pub harm_sail: f64,
    pub harm_crew: f64,
    pub finisher: f64,
    pub way: f64,
    pub turn: f64,
    pub hull_taken: f64,
    pub sail_taken: f64,
    pub crew_taken: f64,
    pub cornered: f64,
    pub holed_taken: f64,
    pub rally: f64,
    pub ram: f64,
    pub patch: f64,
    pub sight: f64,
    pub boarders: u8,
    /// How well each post is held, by the posts' order, 0 for none (`Officer::strength`).
    pub posts: [f64; 5],
}

impl Default for ShipTrim {
    fn default() -> Self {
        Self {
            reload: 1.0,
            scatter: 1.0,
            harm_hull: 1.0,
            harm_sail: 1.0,
            harm_crew: 1.0,
            finisher: 1.0,
            way: 1.0,
            turn: 1.0,
            hull_taken: 1.0,
            sail_taken: 1.0,
            crew_taken: 1.0,
            cornered: 1.0,
            holed_taken: 1.0,
            rally: 1.0,
            ram: 1.0,
            patch: 1.0,
            sight: 1.0,
            boarders: 0,
            posts: [0.0; 5],
        }
    }
}

/// What the post's own work is at full strength: her Gunner's reload and scatter, her Bosun's way kept turning and
/// with torn canvas, the share of each ball's harm her Carpenter patches back, how much farther her Lookout sights,
/// and the hands her First Mate leads aboard and how much slower her men fall.
pub const GUNNER_RELOAD: f64 = 0.1;
pub const BOSUN_KEEPS: f64 = 0.5;
pub const CARPENTER_PATCHES: f64 = 0.25;
pub const LOOKOUT_SIGHT: f64 = 0.4;
pub const FIRST_MATE_BOARDERS: f64 = 4.0;
pub const FIRST_MATE_NERVE: f64 = 0.15;

impl ShipTrim {
    /// Takes in one perk by its id; whether the sea's rules know it.
    pub fn take(&mut self, id: &str) -> bool {
        let less = |factor: &mut f64, share: f64| *factor *= 1.0 - share;
        let more = |factor: &mut f64, share: f64| *factor *= 1.0 + share;
        match id {
            "quick_tackle" => less(&mut self.reload, 0.08),
            "steady_lay" => less(&mut self.scatter, 0.15),
            "heavy_charge" => {
                more(&mut self.harm_hull, 0.12);
                more(&mut self.reload, 0.05);
            }
            "swivel_crews" | "grapeshot_drill" => more(&mut self.harm_crew, 0.15),
            "bored_true" => less(&mut self.scatter, 0.08),
            "chain_locker" => more(&mut self.harm_sail, 0.2),
            "grape_locker" => more(&mut self.harm_crew, 0.2),
            "raking_fire" => more(&mut self.finisher, 0.2),
            "gunlayers_eye" | "layer" => less(&mut self.scatter, 0.1),
            "double_shotted" => more(&mut self.harm_hull, 0.08),
            "powder_monkeys" | "gun_captain" => less(&mut self.reload, 0.06),
            "oak_ribs" => less(&mut self.hull_taken, 0.08),
            "copper_sheathing" | "topgallants" | "sail_trimmer" => more(&mut self.way, 0.04),
            "sealed_magazine" | "iron_discipline" => less(&mut self.crew_taken, 0.1),
            "iron_ram" => more(&mut self.ram, 0.25),
            "last_timbers" => less(&mut self.cornered, 0.15),
            "carpenters_stores" | "quick_patch" => more(&mut self.patch, 0.25),
            "storm_canvas" => less(&mut self.sail_taken, 0.12),
            "flying_jib" => more(&mut self.way, 0.05),
            "trim_crew" | "helm_hand" => more(&mut self.turn, 0.08),
            "patched_sails" => more(&mut self.patch, 0.15),
            "lookout_yard" => more(&mut self.sight, 0.2),
            "doubled_shrouds" | "sailmaker" => less(&mut self.sail_taken, 0.1),
            "quick_braces" => more(&mut self.turn, 0.1),
            "boarding_nets" => less(&mut self.crew_taken, 0.12),
            "grapnels" | "boarding_master" => self.boarders += 2,
            "running_blocks" | "fair_winds" => more(&mut self.way, 0.03),
            "fighting_tops" => more(&mut self.harm_crew, 0.1),
            "seasoned_timbers" => less(&mut self.hull_taken, 0.05),
            "kraken_roar" => {
                more(&mut self.harm_hull, 0.12);
                less(&mut self.reload, 0.1);
            }
            "leviathan_rib" => less(&mut self.hull_taken, 0.2),
            "stormcaller" => {
                more(&mut self.way, 0.12);
                less(&mut self.sail_taken, 0.1);
            }
            "spiders_web" => {
                self.boarders += 4;
                more(&mut self.turn, 0.1);
            }
            "rally" => less(&mut self.rally, 0.15),
            "powder_master" => more(&mut self.harm_hull, 0.06),
            "pumps" => less(&mut self.hull_taken, 0.06),
            "plug_master" => less(&mut self.holed_taken, 0.2),
            "eagle_eye" => more(&mut self.sight, 0.25),
            "spotter" => less(&mut self.scatter, 0.05),
            "weather_eye" => more(&mut self.way, 0.02),
            _ => return false,
        }
        true
    }

    /// Every number, in the struct's order, as the gear message carries them.
    #[must_use]
    pub fn to_floats(&self) -> Vec<f64> {
        let factors = [
            self.reload,
            self.scatter,
            self.harm_hull,
            self.harm_sail,
            self.harm_crew,
            self.finisher,
            self.way,
            self.turn,
            self.hull_taken,
            self.sail_taken,
            self.crew_taken,
            self.cornered,
            self.holed_taken,
            self.rally,
            self.ram,
            self.patch,
            self.sight,
            f64::from(self.boarders),
        ];
        factors.into_iter().chain(self.posts).collect()
    }

    /// How well a post is held, 0 when none holds it.
    #[must_use]
    pub fn post(&self, post: Post) -> f64 {
        self.posts[post as usize]
    }
}

impl Character {
    /// Her trim at sea: her fitted modules' perks, and her posted officers' posts and perks.
    #[must_use]
    pub fn ship_trim(&self) -> ShipTrim {
        let mut trim = ShipTrim::default();
        for id in self.ship_traits() {
            trim.take(id);
        }
        for officer in self.crew.officers.values().filter(|officer| officer.duty == Duty::Posted) {
            let strength = officer.strength();
            trim.posts[officer.post as usize] = strength;
            for id in officer.active_traits() {
                trim.take(id);
            }
            match officer.post {
                Post::Gunner => trim.reload *= 1.0 - GUNNER_RELOAD * strength,
                Post::Lookout => trim.sight *= 1.0 + LOOKOUT_SIGHT * strength,
                Post::FirstMate => {
                    trim.boarders += (FIRST_MATE_BOARDERS * strength).round() as u8;
                    trim.crew_taken *= 1.0 - FIRST_MATE_NERVE * strength;
                }
                Post::Bosun | Post::Carpenter => {}
            }
        }
        trim
    }
}
