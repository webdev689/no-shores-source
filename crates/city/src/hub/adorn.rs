//! What dresses the hub's walls and corners, the small things that make it lived in: Overlook's banners down the
//! ranges and the Beacon's face, the factions' in the Hall, sconces and wall braziers, lanterns at every passage,
//! bunting slung over the market lane, a sign at every stall, planters, potted trees and ivy, statues at the portico
//! and the Harbour Stair, a well and a cart (the pier's mooring posts are the harbour's). Each is a handcrafted module
//! (`tools/modules`), fixed by its `wall` socket or stood by its `front`.

use super::courts::{RANGE_ACROSS_M, RANGE_DEEP_M};
use super::hall::{RUG_FROM_DOOR_M, hall_span};
use super::placing::stand_by_socket;
use super::walks::{BASE_FACE_M, SEALED_EAST_M, SEALED_M};
use super::{Laid, stand_at};
use crate::courtyard::Frame;

/// Heights a thing is fixed at over the floor, metres: a banner's bracket on a range and on the Beacon's face, a
/// faction's banner in the Hall, a sconce, a lantern beside a passage, a wall brazier, bunting's ends.
const RANGE_BANNER_M: f64 = 9.5;
const BEACON_BANNER_M: f64 = 16.5;
const HALL_BANNER_M: f64 = 11.5;
const SCONCE_M: f64 = 4.2;
const PASSAGE_LANTERN_M: f64 = 4.4;
const WALL_BRAZIER_M: f64 = 2.8;
const BUNTING_M: f64 = 4.6;
/// Where along the ranges their banners hang, metres seaward of the plaza's middle; the east range's middle one
/// gives way to the Mage's study.
const RANGE_BANNERS_TOWARD_M: [f64; 3] = [36.0, 0.0, -36.0];
/// Where the ranges' passages are, metres seaward: a lantern hangs either side of each mouth.
const PASSAGES_TOWARD_M: [f64; 2] = [18.0, -18.0];
/// The market lane on the Beacon Walk: its line seaward of the plaza's middle and its lamp posts across, metres; bunting
/// is slung between each two.
const MARKET_TOWARD_M: f64 = -92.0;
const MARKET_POSTS_M: [[f64; 3]; 2] = [[-94.0, -70.0, -46.0], [46.0, 70.0, 94.0]];

fn scaled(direction: [f64; 2], by: f64) -> [f64; 2] {
    [direction[0] * by, direction[1] * by]
}

/// Fixes module `name` by its `wall` socket on a wall at `toward`, `across`, `high` over the floor, facing `out`.
fn hang(frame: &Frame, laid: &mut Laid, name: &str, (toward, across, high): (f64, f64, f64), out: [f64; 2]) {
    let [x, y] = frame.at(toward, across);
    laid.piece(stand_by_socket(name, "wall", [x, y, frame.level + high], out));
}

/// Stands module `name` by its `front` at `toward`, `across`, facing `facing`.
fn stand(frame: &Frame, laid: &mut Laid, name: &str, (toward, across): (f64, f64), facing: [f64; 2]) {
    laid.piece(stand_at(name, "front", frame.at(toward, across), frame.level, facing));
}

/// Everything that dresses the hub's platform.
pub fn adorn(frame: &Frame, laid: &mut Laid) {
    let east = [-frame.seaward[1], frame.seaward[0]];
    let west = scaled(east, -1.0);
    let north = frame.seaward;
    let south = scaled(north, -1.0);
    for side in [-1.0, 1.0] {
        let court_face = side * (RANGE_ACROSS_M - RANGE_DEEP_M / 2.0) - side * 0.05;
        let back_face = side * (RANGE_ACROSS_M + RANGE_DEEP_M / 2.0) + side * 0.05;
        let into_court = scaled(east, -side);
        let out_back = scaled(east, side);
        for toward in RANGE_BANNERS_TOWARD_M {
            if side > 0.0 && toward == 0.0 {
                continue;
            }
            hang(frame, laid, "banner-overlook", (toward, court_face, RANGE_BANNER_M), into_court);
            hang(frame, laid, "banner-overlook", (toward, back_face, RANGE_BANNER_M), out_back);
        }
        for passage in PASSAGES_TOWARD_M {
            for beside in [-4.6, 4.6] {
                hang(frame, laid, "lantern-hung", (passage + beside, court_face, PASSAGE_LANTERN_M), into_court);
                hang(frame, laid, "lantern-hung", (passage + beside, back_face, PASSAGE_LANTERN_M), out_back);
            }
            stand(frame, laid, "planter", (passage + 7.5, court_face - side * 1.0), into_court);
            stand(frame, laid, "planter", (passage - 7.5, court_face - side * 1.0), into_court);
        }
        hang(frame, laid, "ivy", (30.0, back_face, 0.0), out_back);
        hang(frame, laid, "ivy", (-30.0, back_face, 0.0), out_back);
        for across in [40.0, 60.0] {
            hang(frame, laid, "banner-overlook-long", (BASE_FACE_M + 0.05, side * across, BEACON_BANNER_M), north);
        }
        hang(frame, laid, "ivy", (BASE_FACE_M + 0.05, side * 48.0, 0.0), north);
        stand(frame, laid, "statue-keeper", (BASE_FACE_M + 19.0, side * 32.0), north);
        stand(frame, laid, "planter", (51.0, side * 50.0), north);
        stand(frame, laid, "planter", (51.0, side * 127.0), north);
        stand(frame, laid, "potted-tree", (44.0, side * 70.0), north);
        stand(frame, laid, "potted-tree", (-56.0, side * 70.0), north);
        stand(frame, laid, "statue-sentinel", (-56.0, side * 20.0), north);
        let sealed = if side > 0.0 { SEALED_EAST_M } else { SEALED_M[0] };
        for beside in [-10.0, 10.0] {
            let at = (sealed + SEALED_M[2] / 2.0 + 0.05, side * 115.0 + beside, WALL_BRAZIER_M);
            hang(frame, laid, "wall-brazier", at, north);
        }
    }
    hall(frame, laid, north, south);
    market(frame, laid, north);
    let forge_back = RANGE_ACROSS_M + RANGE_DEEP_M / 2.0 + 0.05;
    hang(frame, laid, "shield-wall", (30.0, forge_back, 2.6), east);
    hang(frame, laid, "weapon-rack-wall", (-30.0, forge_back, 1.2), east);
    stand(frame, laid, "well", (-46.0, -88.0), north);
    stand(frame, laid, "statue-sentinel", (-118.0, 140.0), west);
    stand(frame, laid, "statue-sentinel", (-144.0, 140.0), west);
    signs(laid);
}

/// The Hall's dress: each faction's banners either side of its chapel, sconces down its walls, braziers on corbels
/// by the door inside, and a long rug from the door to the war table.
fn hall(frame: &Frame, laid: &mut Laid, north: [f64; 2], south: [f64; 2]) {
    let (near, far, half) = hall_span();
    let east = [-frame.seaward[1], frame.seaward[0]];
    let west = scaled(east, -1.0);
    for (name, across, out) in [("banner-stormcallers", -half, east), ("banner-veiled", half, west)] {
        for toward in [-124.0, -156.0] {
            hang(frame, laid, name, (toward, across + out[0].signum() * 0.05, HALL_BANNER_M), out);
        }
    }
    for across in [-14.0, 14.0] {
        hang(frame, laid, "banner-lamplighters", (far + 0.05, across, HALL_BANNER_M), north);
    }
    for toward in [near - 6.0, near - 16.0, far + 16.0, far + 6.0] {
        hang(frame, laid, "sconce", (toward, -half + 0.05, SCONCE_M), east);
        hang(frame, laid, "sconce", (toward, half - 0.05, SCONCE_M), west);
    }
    for across in [-20.0, 20.0] {
        hang(frame, laid, "wall-brazier", (near - 0.05, across, WALL_BRAZIER_M), south);
    }
    stand(frame, laid, "rug-long", (near - RUG_FROM_DOOR_M, 0.0), north);
}

/// The market lane on the Beacon Walk: lamp posts with bunting slung between each two, a cart and sacks by the
/// fruit stall.
fn market(frame: &Frame, laid: &mut Laid, north: [f64; 2]) {
    let east = [-frame.seaward[1], frame.seaward[0]];
    for posts in MARKET_POSTS_M {
        for across in posts {
            stand(frame, laid, "lamp-post", (MARKET_TOWARD_M, across), north);
        }
        for pair in posts.windows(2) {
            let [x, y] = frame.at(MARKET_TOWARD_M, pair[0]);
            laid.piece(stand_by_socket("bunting-24", "end-1", [x, y, frame.level + BUNTING_M], east));
        }
    }
    stand(frame, laid, "cart", (-99.0, 66.0), north);
    stand(frame, laid, "sacks-grain", (-100.0, 50.0), north);
    stand(frame, laid, "amphorae", (-100.0, -46.0), north);
}

/// A sign at every stall, fixed at the stall's `sign` socket (on the post at its counter's end, standing out across
/// its front so it reads from along the court), its device the keeper's (`shop-sign-<keeper>`).
pub(super) fn signs(laid: &mut Laid) {
    let stalls = [
        ("stall-mage", "shop-sign-mage"),
        ("stall-vault", "shop-sign-vault"),
        ("stall-weaponsmith", "shop-sign-weaponsmith"),
        ("stall-armorsmith", "shop-sign-armorsmith"),
        ("stall-tailor", "shop-sign-tailor"),
        ("stall-tack", "shop-sign-tack"),
        ("stall-harbourmaster", "shop-sign-harbourmaster"),
        ("stall-chandler", "shop-sign-chandler"),
    ];
    for (stall, sign) in stalls {
        for (at, facing) in laid.sockets_of(stall, "sign") {
            let stood = stand_by_socket(sign, "wall", at, facing);
            debug_assert!(stood.is_some(), "{sign} is not in the manifest, or has no wall socket");
            if let Some(stood) = stood {
                laid.solids.extend(stood.solids);
            }
        }
    }
}
