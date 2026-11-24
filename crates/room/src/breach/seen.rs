//! What each snapshot carries of a Breach, whole, to every player in the room: in a run, each encounter's phase, the
//! stage reached, the seals open, the revives left, the Lodestone, the marks, and the encounter under way; at its
//! gate in the patrol zone, the Waking, who the gate is open to, and the companies inside.

use super::lodestone::{GROUND_CHARGE, HOLD_MOST, LYING_MOST, Stone};
use super::{Breach, CHOIR, MENDING, Phase, SHORES, STEWARD, WAYS};
use crate::{PlayerId, Room};
use combat::fighter::FighterId;

/// A Breach as a snapshot carries it. Ticks are counted down to a moment, 0 for none coming.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BreachSeen {
    /// 0 a run, 1 a gate; the tier, 0 Normal and 1 Hard.
    pub gate: bool,
    pub tier: u8,
    /// Each encounter's phase, 0 waiting, 1 running, 2 won; the stage reached; each seal open, a bit each.
    pub phases: Vec<u8>,
    pub reached: u8,
    pub seals: u8,
    /// The revives left in this attempt, -1 where none are counted.
    pub revives: i8,
    /// The Lodestone: 0 away, 1 on a plinth, 2 borne, 3 lying; its bearer; where it stands; its charge per mille;
    /// whether Hold True is up and its share left per mille; the ticks before the company is unwritten while it lies.
    pub stone: u8,
    pub bearer: PlayerId,
    pub stone_at: [f32; 3],
    pub charge: u16,
    pub held: u16,
    pub lying_ticks: u32,
    /// The Rewritten, and the ticks each has before a Choir's mark unwrites them (0 at the next writing).
    pub marked: Vec<PlayerId>,
    pub mark_ticks: Vec<u32>,
    /// The hidden chests open to be taken, a bit each.
    pub chests: u8,
    /// The encounter under way (its number, 0 none in a run): its stage, the ticks left in it, its counts (a seam's
    /// fusions, the Seam's), its bells' places in order (in the Choir, those woken so far) and their foes, how many
    /// broken in order, the ticks to their ring, the font's rest, its great foe and whether warded, the desk it stands
    /// at, the desk marked (-1 none) and the ticks before it writes itself there, and the ticks to its writing or toll.
    pub encounter: u8,
    pub stage: u8,
    pub stage_ticks: u32,
    pub counts: Vec<u8>,
    pub bells: Vec<u8>,
    pub bell_foes: Vec<FighterId>,
    pub broken: u8,
    pub ring_ticks: u32,
    pub font_ticks: u32,
    pub boss: FighterId,
    pub warded: bool,
    pub desk: u8,
    pub marked_desk: i8,
    pub desk_ticks: u32,
    pub write_ticks: u32,
    /// The Ways: whether anyone was seen, and the ticks before the company is unwritten at Hard.
    pub seen: bool,
    pub wipe_ticks: u32,
    /// The rifts: each 0 shut, 1 opening, 2 open, and its opening per mille; the Keepers fallen, a bit each.
    pub rifts: Vec<u8>,
    pub rift_held: Vec<u16>,
    pub kept: u8,
    /// The Steward: its takings, the ticks to the next, the shore the taken are in (-1 none), the taken, whether their
    /// way back is open, and the ticks it lies bare.
    pub takings: u8,
    pub taking_ticks: u32,
    pub away_shore: i8,
    pub away: Vec<PlayerId>,
    pub way_back: bool,
    pub bare_ticks: u32,
    /// A gate: whether a company holds it, the Spire's fill per mille, whether it woke, each mooring claimed (a bit
    /// each), the players it is open to, the companies inside the run (each by its first player's name, its tier and
    /// encounter), and the players of the company holding it.
    pub held_by: bool,
    pub fill: u16,
    pub woken: bool,
    pub claims: u8,
    pub open_to: Vec<PlayerId>,
    pub inside: Vec<(String, u8, u8)>,
    pub holders: Vec<PlayerId>,
}

/// Ticks left until `at`, 0 once past.
fn left(clock: u64, at: u64) -> u32 {
    u32::try_from(at.saturating_sub(clock)).unwrap_or(u32::MAX)
}

/// A share of `part` in `whole`, per mille.
fn per_mille(part: u64, whole: u64) -> u16 {
    u16::try_from((part.min(whole) * 1000) / whole.max(1)).unwrap_or(1000)
}

impl Room {
    /// The Breach this room keeps, as its snapshot carries it: none in any other room.
    #[must_use]
    pub fn breach_seen(&self) -> Option<BreachSeen> {
        if let Some(gate) = self.breach_gate.as_ref() {
            let open_to = gate
                .companies
                .iter()
                .filter(|(run, _)| gate.opened.contains_key(*run))
                .flat_map(|(_, company)| company.players.iter().copied())
                .collect();
            let holding = gate.held_by.as_ref().and_then(|run| gate.companies.get(run));
            let tier = holding.and_then(|company| company.tier);
            let holders = holding.map(|company| company.players.clone()).unwrap_or_default();
            return Some(BreachSeen {
                gate: true,
                tier: u8::from(tier == Some(gear::breach::Tier::Hard)),
                revives: gate.revives.map_or(-1, |left| i8::try_from(left).unwrap_or(i8::MAX)),
                held_by: gate.held_by.is_some(),
                fill: per_mille(gate.fill, super::gate::SPIRE_TICKS),
                woken: gate.woken.is_some(),
                claims: gate
                    .claims
                    .iter()
                    .enumerate()
                    .fold(0, |bits, (nth, claim)| bits | (u8::from(claim.is_some()) << nth)),
                open_to,
                holders,
                inside: gate
                    .inside
                    .values()
                    .map(|inside| (inside.name.clone(), inside.tier as u8, inside.encounter))
                    .collect(),
                marked_desk: -1,
                away_shore: -1,
                ..BreachSeen::default()
            });
        }
        let breach = self.breach.as_ref()?;
        let mut seen = self.run_seen(breach);
        self.breach_fight_seen(breach, &mut seen);
        Some(seen)
    }

    fn run_seen(&self, breach: &Breach) -> BreachSeen {
        let clock = self.clock;
        let phases = breach
            .phases
            .iter()
            .map(|phase| match phase {
                Phase::Waiting => 0,
                Phase::Running(_) => 1,
                Phase::Won => 2,
            })
            .collect();
        let stone = &breach.lodestone;
        let (kind, bearer, at) = match stone.stone {
            Stone::Away => (0, 0, [0.0; 3]),
            Stone::Plinth(at) => (1, 0, at),
            Stone::Borne(id) => {
                let at = self.players.get(&id).map_or([0.0; 3], |found| {
                    let body = found.fighter.body;
                    [body.x, body.y, body.z]
                });
                (2, id, at)
            }
            Stone::Lying(at, _) => (3, 0, at),
        };
        let most = if breach.tier == gear::breach::Tier::Hard { LYING_MOST.1 } else { LYING_MOST.0 };
        let lying_ticks = match stone.stone {
            Stone::Lying(_, since) if stone.needed => left(clock, since + most),
            _ => 0,
        };
        let choir_marks = matches!(breach.phases[CHOIR], Phase::Running(_)) && breach.fights.choir.phase == 1;
        BreachSeen {
            tier: u8::from(breach.tier == gear::breach::Tier::Hard),
            phases,
            reached: u8::try_from(breach.reached).unwrap_or(u8::MAX),
            seals: breach.open_seals.iter().fold(0, |bits, seal| bits | (1 << seal)),
            revives: breach.revives.map_or(-1, |left| i8::try_from(left).unwrap_or(i8::MAX)),
            stone: kind,
            bearer,
            stone_at: at.map(|axis| axis as f32),
            charge: stone.grounded_at.map_or(1000, |at| per_mille(clock.saturating_sub(at), GROUND_CHARGE)),
            held: stone.held_from.map_or(0, |from| 1000 - per_mille(clock.saturating_sub(from), HOLD_MOST)),
            lying_ticks,
            marked: breach.marked.keys().copied().collect(),
            mark_ticks: breach
                .marked
                .values()
                .map(|at| if choir_marks { left(clock, at + super::choir::MARK_LASTS) } else { 0 })
                .collect(),
            chests: breach.chests.iter().fold(0, |bits, chest| bits | (1 << chest)),
            marked_desk: -1,
            away_shore: -1,
            ..BreachSeen::default()
        }
    }

    /// What the encounter under way shows.
    fn breach_fight_seen(&self, breach: &Breach, seen: &mut BreachSeen) {
        let clock = self.clock;
        let Some(encounter) = (MENDING..=STEWARD).find(|at| matches!(breach.phases[*at], Phase::Running(_))) else {
            return;
        };
        seen.encounter = u8::try_from(encounter).unwrap_or(0);
        let fights = &breach.fights;
        match encounter {
            MENDING => {
                let fight = &fights.mending;
                seen.stage = fight.stage;
                let counting = fight.stage < 3 && breach.lost.is_none();
                seen.stage_ticks =
                    if counting { left(clock, fight.stage_from + super::mending::STAGE_TICKS) } else { 0 };
                seen.counts = fight.fused.to_vec();
                seen.boss = fight.mender.unwrap_or(0);
            }
            CHOIR => {
                let fight = &fights.choir;
                (seen.stage, seen.broken) = (fight.phase, u8::try_from(fight.broken).unwrap_or(0));
                seen.counts = vec![u8::try_from(fight.round).unwrap_or(0)];
                // Only the bells woken so far: the order is learnt by watching them wake.
                let woken = fight.order.iter().zip(&fight.woke).filter(|(_, woke)| woke.is_some());
                seen.bells = woken.map(|(place, _)| u8::try_from(*place).unwrap_or(0)).collect();
                seen.bell_foes = fight.bells.iter().map(|(_, id)| *id).collect();
                seen.ring_ticks = fight.ring_at.map_or(0, |at| left(clock, at));
                seen.font_ticks = left(clock, fight.font_rests_until);
                (seen.boss, seen.warded) = (fight.scrivener.unwrap_or(0), fight.warded.is_some());
                seen.desk = u8::try_from(fight.desk).unwrap_or(0);
                if let Some((desk, from)) = fight.marked_desk {
                    seen.marked_desk = i8::try_from(desk).unwrap_or(-1);
                    seen.desk_ticks = left(clock, from + super::choir::MARK_SHOWS);
                }
                seen.write_ticks = if fight.phase == 2 { left(clock, fight.next_write) } else { 0 };
                seen.stage_ticks = left(clock, fight.round_from);
            }
            WAYS => {
                let fight = &fights.ways;
                (seen.seen, seen.wipe_ticks) = (fight.seen, fight.wipe_at.map_or(0, |at| left(clock, at)));
            }
            SHORES => {
                let fight = &fights.shores;
                seen.stage = u8::from(fight.warden.is_some_and(|id| !self.standing_foe(id)));
                seen.rifts =
                    fight.rifts.iter().map(|rift| if rift.open { 2 } else { u8::from(rift.held > 0) }).collect();
                seen.rift_held =
                    fight.rifts.iter().map(|rift| per_mille(rift.held, super::shores::OPENS_TICKS)).collect();
                seen.kept = u8::from(fight.kept[0]) | (u8::from(fight.kept[1]) << 1);
                seen.counts = vec![fight.fused];
                seen.boss = fight.warden.unwrap_or(0);
                seen.write_ticks = left(clock, fight.next_toll);
            }
            _ => {
                let fight = &fights.steward;
                seen.boss = fight.boss.unwrap_or(0);
                (seen.takings, seen.taking_ticks) = (fight.takings, left(clock, fight.next_taking));
                seen.write_ticks = left(clock, fight.next_toll);
                seen.bare_ticks = left(clock, fight.bare_until);
                if let Some(away) = fight.away.as_ref() {
                    seen.away_shore = i8::try_from(away.shore).unwrap_or(-1);
                    seen.away.clone_from(&away.taken);
                    seen.way_back = away.done;
                    seen.bells = away.order.iter().map(|place| u8::try_from(*place).unwrap_or(0)).collect();
                    seen.bell_foes = away.bells.iter().map(|(_, id)| *id).collect();
                    seen.broken = u8::try_from(away.broken).unwrap_or(0);
                }
            }
        }
    }
}
