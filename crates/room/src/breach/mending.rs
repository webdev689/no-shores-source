//! The Mending, the Drowned Vale's second encounter, after the Vault of Glass's confluxes: three seams in the drowned
//! green. The north opens first, then the west and the east, then all three, a minute each, a great wave between;
//! then the Mender, a Bulwark grown huge, stands among them and its fall wins it. All the while Husks come out of the
//! street mouths and walk to an open seam, and one that reaches it fuses into it: each fusion overtakes the ground
//! round its seam a little further, which harms whoever stands on it, and four fusions (three at Hard) close the vale
//! over the company.

use super::{Breach, MENDING};
use crate::{EventKind, Room};
use ::foes::Rank;
use ::foes::roster::{BULWARK, FLICKER, HUSK, RAVAGER};
use combat::fighter::FighterId;
use combat::sight::apart;

/// How long each of the first three stages runs, ticks.
pub const STAGE_TICKS: u64 = 60 * 60;
/// How often a walker comes, and a wave, ticks.
pub const WALK_EVERY: u64 = 5 * 60;
pub const WAVE_EVERY: u64 = 16 * 60;
/// How fast a walker goes, metres a second: a Husk's walk.
pub const WALK_PACE: f64 = 2.4;
/// The fusions that close the vale: Normal, Hard.
pub const FUSIONS_MOST: (u8, u8) = (4, 3);
/// The overtaken ground round a seam: its reach with one fusion, the reach each more adds, metres; and the share of a
/// player's health it takes each second.
pub const OVERTAKEN_M: (f64, f64) = (2.5, 1.5);
pub const OVERTAKEN_HARM: f64 = 0.1;
/// What the Mender's health is times past the company's match.
pub const MENDER_TIMES: f64 = 1.5;
/// The seams by their sockets, and which are open in each stage.
pub const SEAMS: [&str; 3] = ["seam-north", "seam-west", "seam-east"];
const OPEN: [[bool; 3]; 3] = [[true, false, false], [false, true, true], [true, true, true]];

/// The Mending as it stands: its stage (0 to 2 the seams' stages, 3 the Mender's), when it began, the fusions into
/// each seam, its walkers and the seam each walks to, when the next walker and wave come and how many have, and the
/// Mender.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Mending {
    pub stage: u8,
    pub stage_from: u64,
    pub fused: [u8; 3],
    pub walkers: Vec<(FighterId, usize)>,
    pub next_walker: u64,
    pub next_wave: u64,
    pub waves: usize,
    pub mender: Option<FighterId>,
}

impl Mending {
    /// The fusions into every seam.
    #[must_use]
    pub fn fusions(&self) -> u8 {
        self.fused.iter().sum()
    }

    /// Whether a seam is open now.
    #[must_use]
    pub fn open(&self, seam: usize) -> bool {
        self.stage < 3 && OPEN[usize::from(self.stage)][seam]
    }
}

impl Room {
    pub(crate) fn keep_mending(&mut self, breach: &mut Breach) {
        let clock = self.clock;
        let mut fight = std::mem::take(&mut breach.fights.mending);
        if fight.stage_from == 0 {
            fight = Mending {
                stage_from: clock,
                next_walker: clock + 2 * 60,
                next_wave: clock + 3 * 60,
                ..Mending::default()
            };
        }
        let mouths = breach.plan.numbered("mending", "mouth");
        let seams: Vec<[f64; 3]> =
            SEAMS.iter().filter_map(|seam| breach.plan.socket("mending", seam)).map(|(at, _)| at).collect();
        if fight.stage < 3 && clock >= fight.stage_from + STAGE_TICKS {
            fight.stage += 1;
            fight.stage_from = clock;
            let kinds = [(HUSK, Rank::Major), (FLICKER, Rank::Major), (RAVAGER, Rank::Elite)];
            let mouth_points: Vec<[f64; 3]> = mouths.iter().map(|(at, _)| *at).collect();
            self.breach_wave(breach, "mending", &kinds, &mouth_points, fight.waves + 7);
            self.tell_all(EventKind::BreachStage, f64::from(fight.stage));
            if fight.stage == 3 {
                self.stand_mender(breach, &mut fight);
            }
        }
        self.keep_walkers(breach, &mut fight, &mouths, &seams);
        if fight.stage < 3 && clock >= fight.next_wave {
            fight.next_wave = clock + WAVE_EVERY;
            let kinds = [(HUSK, Rank::Major), (FLICKER, Rank::Minor), (HUSK, Rank::Minor)];
            let mouth_points: Vec<[f64; 3]> = mouths.iter().map(|(at, _)| *at).collect();
            self.breach_wave(breach, "mending", &kinds, &mouth_points, fight.waves);
            fight.waves += 1;
        }
        if clock.is_multiple_of(60) {
            self.harm_overtaken(&fight, &seams);
        }
        let most = if breach.tier == gear::breach::Tier::Hard { FUSIONS_MOST.1 } else { FUSIONS_MOST.0 };
        let closed = fight.fusions() >= most;
        let won = fight.mender.is_some_and(|id| !self.standing_foe(id)) && fight.stage == 3;
        breach.fights.mending = fight;
        if closed {
            (breach.fights.mending.stage_from, breach.fights.mending.next_walker) = (u64::MAX / 2, u64::MAX);
            self.unwrite_all(breach);
        } else if won {
            self.win_encounter(breach, MENDING);
        }
    }

    /// The Mender, a Bulwark grown huge, stood at its post and made a match for the company.
    fn stand_mender(&mut self, breach: &mut Breach, fight: &mut Mending) {
        let Some((at, _)) = breach.plan.socket("mending", "mender") else { return };
        let mender = self.stand_breach_foe(breach, (BULWARK, Rank::Miniboss), at, Some("The Mender"));
        if let Some(id) = mender {
            self.match_company(id, self.company(), MENDER_TIMES);
        }
        fight.mender = mender;
    }

    /// A walker comes from a mouth to the nearest open seam, every WALK_EVERY while a seam is open; each walks on,
    /// and one that reaches its seam fuses into it, told to every player with how many have fused.
    fn keep_walkers(
        &mut self,
        breach: &mut Breach,
        fight: &mut Mending,
        mouths: &[([f64; 3], [f64; 2])],
        seams: &[[f64; 3]],
    ) {
        let clock = self.clock;
        if fight.stage < 3 && clock >= fight.next_walker && !mouths.is_empty() && seams.len() == SEAMS.len() {
            fight.next_walker = clock + WALK_EVERY;
            let (mouth, _) = mouths[(clock / WALK_EVERY) as usize % mouths.len()];
            let open = (0..SEAMS.len()).filter(|&seam| fight.open(seam));
            let seam = open.min_by(|&one, &two| {
                let far = |seam: usize| apart([mouth[0], mouth[1]], [seams[seam][0], seams[seam][1]]);
                far(one).total_cmp(&far(two))
            });
            if let Some(seam) = seam
                && self.room_for_lesser(breach)
                && let Some(id) = self.stand_breach_foe(breach, (HUSK, Rank::Minor), mouth, Some("Penitent"))
            {
                self.make_walker(id);
                fight.walkers.push((id, seam));
            }
        }
        for (id, seam) in std::mem::take(&mut fight.walkers) {
            if !self.standing_foe(id) {
                self.inert.remove(&id);
                continue;
            }
            if self.walk_inert(id, seams[seam], WALK_PACE) {
                self.inert.remove(&id);
                self.gone(id);
                fight.fused[seam] += 1;
                self.tell_all(EventKind::Fused, f64::from(fight.fusions()));
            } else {
                fight.walkers.push((id, seam));
            }
        }
    }

    /// Every living player standing on a seam's overtaken ground loses a share of their health.
    fn harm_overtaken(&mut self, fight: &Mending, seams: &[[f64; 3]]) {
        let harmed: Vec<crate::PlayerId> = self
            .players
            .iter()
            .filter(|(_, found)| found.living())
            .filter(|(_, found)| {
                let body = found.fighter.body;
                seams.iter().zip(fight.fused).any(|(seam, fused)| {
                    fused > 0
                        && apart([body.x, body.y], [seam[0], seam[1]])
                            <= OVERTAKEN_M.0 + OVERTAKEN_M.1 * f64::from(fused - 1)
                })
            })
            .map(|(id, _)| *id)
            .collect();
        for id in harmed {
            self.harm_share(id, OVERTAKEN_HARM, 0);
            self.tell(EventKind::Overtaken, None, 0, id, OVERTAKEN_HARM);
        }
    }
}
