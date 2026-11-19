use super::*;
use crate::guns::SWIVEL;

#[test]
fn a_major_is_a_ship_as_she_was_before_ranks() {
    let major = Commission::default();
    assert_eq!((major.faction, major.rank), (PIRATES, Rank::Major));
    assert_eq!(major.build(), PIRATE_SLOOP);
    assert_eq!(major.armed(SWIVEL), SWIVEL);
    let scale = Rank::Major.scale();
    assert_eq!([scale.hull, scale.might, scale.reload, scale.aim_error], [1.0; 4]);
    assert_eq!((scale.always_bold, scale.runs_at, scale.strikes_at), (false, PIRATE_RUNS_AT, STRUCK_AT));
    assert_eq!(major.damage(), Damage::new(&PIRATE_SLOOP, false));
}

#[test]
fn each_rank_scales_her_hull_her_guns_her_reload_her_aim_and_her_boldness() {
    // Hull, might, reload, aim error, always bold, the shares of her hull she runs under and strikes at.
    let table = [
        (Rank::Minor, [0.6, 0.9, 1.2, 1.3], false, [0.3, 0.25]),
        (Rank::Major, [1.0, 1.0, 1.0, 1.0], false, [0.3, 0.25]),
        (Rank::Elite, [1.8, 1.1, 0.9, 0.8], true, [0.3, 0.2]),
        (Rank::Miniboss, [3.0, 1.2, 0.8, 0.7], true, [0.15, 0.1]),
        (Rank::Boss, [5.0, 1.3, 0.7, 0.6], true, [0.0, 0.05]),
    ];
    for (rank, [hull, might, reload, aim_error], bold, [runs_at, strikes_at]) in table {
        let scale = rank.scale();
        assert_eq!([scale.hull, scale.might, scale.reload, scale.aim_error], [hull, might, reload, aim_error]);
        assert_eq!((scale.always_bold, scale.runs_at, scale.strikes_at), (bold, runs_at, strikes_at), "{rank:?}");
        let commission = Commission { faction: GREY_TITHE, rank };
        let exposed = hull_exposure(rank.hull());
        assert_eq!(commission.build().hull, (264.0 * hull * exposed).round(), "whole points: {rank:?}");
        assert_eq!(commission.damage().struck_at, strikes_at, "{rank:?}");
        let gun = commission.armed(SWIVEL);
        assert_eq!([gun.hull, gun.sail, gun.crew], [5.0 * might, 2.0 * might, 2.0 * might]);
        assert_eq!([gun.yaw_spread_deg, gun.pitch_spread_deg], [1.3 * aim_error, 0.8 * aim_error]);
        assert_eq!((gun.speed, gun.reload_s, gun.radius_m), (SWIVEL.speed, SWIVEL.reload_s, SWIVEL.radius_m));
    }
}

#[test]
fn each_faction_sails_her_own_class_and_only_captains_factions_take_a_commission() {
    let minor = Commission { faction: PIRATES, rank: Rank::Minor }.build().hull;
    let elite = Commission { faction: PIRATES, rank: Rank::Elite }.build().hull;
    let schooner = hull_exposure(sailing::HullKind::Schooner);
    assert_eq!((minor, elite), (158.0, (475.2 * schooner).round()), "a Minor's and an Elite's hull in whole points");
    assert_eq!(Commission { faction: GREY_TITHE, rank: Rank::Major }.build().name, "Tithe Sloop");
    assert_eq!(Commission { faction: PIRATES, rank: Rank::Boss }.build().name, "Pirate Frigate");
    assert_eq!(Commission::of(GREY_TITHE, Rank::Elite), Some(Commission { faction: GREY_TITHE, rank: Rank::Elite }));
    assert_eq!(Commission::of(PLAYERS, Rank::Major), None, "the players' ships take no commission");
    assert_eq!(Commission::of(3, Rank::Major), None, "no third faction sails yet");
}

#[test]
fn a_rank_is_numbered_one_to_five() {
    assert_eq!(Rank::ALL.map(Rank::number), [1, 2, 3, 4, 5]);
    for rank in Rank::ALL {
        assert_eq!(Rank::numbered(rank.number()), Some(rank));
    }
    assert_eq!((Rank::numbered(0), Rank::numbered(6)), (None, None));
}

#[test]
fn each_rank_sails_her_own_hull() {
    use sailing::HullKind;
    let hulls = [HullKind::Sloop, HullKind::Sloop, HullKind::Schooner, HullKind::Brig, HullKind::Frigate];
    for (rank, hull) in Rank::ALL.into_iter().zip(hulls) {
        assert_eq!(rank.hull(), hull, "{rank:?}");
        for faction in CAPTAIN_FACTIONS {
            assert_eq!(Commission { faction, rank }.hull(), hull);
        }
    }
}

#[test]
fn a_captain_is_named_for_her_faction_and_her_hull() {
    let names = |faction: u8| Rank::ALL.map(|rank| Commission { faction, rank }.build().name);
    assert_eq!(names(PIRATES), ["Pirate Sloop", "Pirate Sloop", "Pirate Schooner", "Pirate Brig", "Pirate Frigate"]);
    assert_eq!(names(GREY_TITHE), ["Tithe Sloop", "Tithe Sloop", "Tithe Schooner", "Tithe Brig", "Tithe Frigate"]);
}

#[test]
fn a_bigger_hull_is_as_much_tougher_as_she_is_easier_to_hit() {
    use crate::arms::{FRIGATE_ARMS, SLOOP_ARMS};
    use crate::captain::odds::hit_share;
    use sailing::HullKind;
    assert_eq!((exposure(HullKind::Sloop), hull_exposure(HullKind::Sloop)), (1.0, 1.0), "the Sloop's, to the bit");
    let frigate = hit_share(&SLOOP_ARMS, &FRIGATE_ARMS, 0.45) / hit_share(&SLOOP_ARMS, &SLOOP_ARMS, 0.45);
    assert!((exposure(HullKind::Frigate) - frigate).abs() < 1e-12 && (frigate - 0.778 / 0.413).abs() < 0.01);
    // Her hull's, each hit holed by the waterline band's share of her height.
    let holed = |top: f64| 1.0 + 0.4 * (1.1 / top);
    let hulled = frigate * holed(FRIGATE_ARMS.hull[1][2]) / holed(SLOOP_ARMS.hull[1][2]);
    assert!((hull_exposure(HullKind::Frigate) - hulled).abs() < 1e-12 && (hulled - 1.79).abs() < 0.01, "{hulled}");
    for kind in HullKind::ALL {
        assert!(exposure(kind) >= 1.0 && hull_exposure(kind) >= 1.0, "{kind:?}: a bigger box, struck more often");
    }
    let boss = |faction| Commission { faction, rank: Rank::Boss }.build();
    let exposed = exposure(HullKind::Frigate);
    assert_eq!(boss(PIRATES).hull, (264.0 * 5.0 * hulled).round(), "her hull, her rank's and her size's");
    assert_eq!((boss(PIRATES).sail, boss(PIRATES).crew), ((96.0 * exposed).round(), (10.0 * 5.0 * exposed).round()));
}

/// Balls fired at a ship of `hull` sound as `damage` (each striking by the fight's hit share on her hull, a round
/// ball's harm into her hull, holed as often as the waterline band is of her height) until she strikes, over many
/// seeds: the mean count.
fn balls_to_strike(hull: sailing::HullKind, sound: &Damage) -> f64 {
    use crate::arms::{SLOOP_ARMS, arms_of};
    use crate::captain::odds::hit_share;
    use crate::damage::{SHIP_TOUGHNESS, State, Zone, shot_harm};
    let strikes = hit_share(&SLOOP_ARMS, arms_of(hull), PIRATE_SLOOP.skill);
    let holed = (crate::damage::WATERLINE_BAND_M / arms_of(hull).hull[1][2]).min(1.0);
    let mut draws = crate::random::Mulberry32::new(5);
    let (mut fired, seeds) = (0.0, 2000);
    for _ in 0..seeds {
        let mut damage = sound.clone();
        while damage.state == State::Afloat {
            fired += 1.0;
            let (hits, roll, low) = (draws.draw() < strikes, draws.draw(), draws.draw() < holed);
            let zone = if low { Zone::Holed } else { Zone::Hull };
            if hits {
                damage.apply(shot_harm(&SWIVEL, zone, false, roll, SHIP_TOUGHNESS), 0.0, 0.0);
            }
        }
    }
    fired / f64::from(seeds)
}

#[test]
fn the_same_fire_makes_any_hull_of_one_rank_strike_as_soon_as_the_sloop() {
    for rank in [Rank::Elite, Rank::Miniboss, Rank::Boss] {
        let commission = Commission { faction: PIRATES, rank };
        let own = balls_to_strike(rank.hull(), &commission.damage());
        // The same rank in the Sloop: her class's hull and men by her rank's alone, striking where her rank strikes.
        let (hull, crew) = ((264.0 * rank.scale().hull).round(), (10.0 * rank.scale().hull).round());
        let in_sloop = Build { hull, crew, ..PIRATE_SLOOP };
        let mut in_sloop = Damage::new(&in_sloop, false);
        in_sloop.struck_at = rank.scale().strikes_at;
        let sloop = balls_to_strike(sailing::HullKind::Sloop, &in_sloop);
        assert!((own - sloop).abs() <= 0.03 * sloop, "{rank:?} in her {:?}: {own} balls against {sloop}", rank.hull());
    }
    // Her strike time as a captain reckons it, under a Major's fire from a Sloop: her hull's, to a hair of the Sloop's.
    use crate::arms::{SLOOP_ARMS, arms_of};
    use crate::captain::odds::{Power, strike_time};
    let major = Power::captain(&PIRATE_SLOOP, 1.0, 1.0);
    let time = |commission: Commission| {
        let power = Power::captain(&commission.build(), 1.0, 1.0);
        strike_time(&major, &power, [&SLOOP_ARMS, arms_of(commission.hull())])
    };
    let sloop = time(Commission { faction: PIRATES, rank: Rank::Major });
    for rank in [Rank::Elite, Rank::Miniboss, Rank::Boss] {
        let own = time(Commission { faction: PIRATES, rank }) / rank.scale().hull;
        // Within her whole men and points' rounding.
        assert!((own - sloop).abs() <= 0.02 * sloop, "{rank:?}: {own} against {sloop}");
    }
}
