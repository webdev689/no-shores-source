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
        assert_eq!(commission.build().hull, (264.0 * hull).round(), "whole points: {rank:?}");
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
    assert_eq!((minor, elite), (158.0, 475.0), "a Minor's and an Elite's hull in whole points");
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
