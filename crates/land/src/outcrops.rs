//! The outcrops a sculpt raises on its floor, each of a shape. Every shape stands in bands whose faces rise over at
//! least `BAND_M`, so the close-up, which samples the ground every 4 m, draws its faces and never a point. A stepped
//! shape's faces are parted by ledges the close-up draws flat; a rounded shape's meet.

use crate::exact::{fbm, sin_cos, smooth};
use crate::sculpts::WANDER;
use serde::{Deserialize, Serialize};

/// How far across an outcrop's face rises at least, metres: two of the close-up's 4 m samples.
pub const BAND_M: f64 = 8.0;
/// How wide a stepped shape's ledge is between its faces, metres: wide enough that one of the close-up's 4 m steps
/// lies nearly all on it, wherever its samples fall.
const LEDGE_M: f64 = 6.0;

/// An outcrop's form, after the land it stands in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    /// Stepped: up to four faces and ledges under a flat top over a little more than half its width.
    Mesa,
    /// Rounded: a stack of up to three domes, leaning along its angle.
    Tor,
    /// Rounded: a long, low ridge along its angle.
    Whaleback,
    /// Stepped: a knot of up to four faces and ledges under a flat top.
    Crag,
    /// Rounded: a steep-sided hill of up to three faces, each easing onto a soft shoulder.
    Knoll,
    /// Rounded: one low face, its top flat over up to half its radius.
    Hummock,
}

/// An outcrop on a sculpt's floor: its middle, its radius and tall, metres, its shape, and its angle, radians clockwise
/// from north (the way a whaleback runs and a tor leans). Written `[x, y, radius, tall, shape, angle]`, and
/// read from that or from four numbers, `[x, y, radius, tall]`, as a mesa.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(from = "Written", into = "Written")]
pub struct Outcrop {
    pub at: [f64; 2],
    pub radius: f64,
    pub tall: f64,
    pub shape: Shape,
    pub angle: f64,
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum Written {
    Shaped(f64, f64, f64, f64, Shape, f64),
    Plain([f64; 4]),
}

impl From<Written> for Outcrop {
    fn from(written: Written) -> Self {
        let (at, radius, tall, shape, angle) = match written {
            Written::Shaped(x, y, radius, tall, shape, angle) => ([x, y], radius, tall, shape, angle),
            Written::Plain([x, y, radius, tall]) => ([x, y], radius, tall, Shape::Mesa, 0.0),
        };
        Self { at, radius, tall, shape, angle }
    }
}

impl From<Outcrop> for Written {
    fn from(outcrop: Outcrop) -> Self {
        let Outcrop { at: [x, y], radius, tall, shape, angle } = outcrop;
        Self::Shaped(x, y, radius, tall, shape, angle)
    }
}

/// How a shape stands: its flat top, a share of its radius (none for a dome); how many bands it stands in at most;
/// the ledge parting each face from the next, metres (a knoll's a soft shoulder, too narrow to draw flat); how far
/// it leans along its angle up its stack, a share of its climb; and its spine's half-length along its angle, a share
/// of its radius.
struct Form {
    top: f64,
    most: f64,
    ledge: f64,
    lean: f64,
    spine: f64,
}

impl Shape {
    fn form(self) -> Form {
        let (top, most, ledge, lean, spine) = match self {
            Self::Mesa => (0.55, 4.0, LEDGE_M, 0.0, 0.0),
            Self::Tor => (0.0, 3.0, 0.0, 0.25, 0.0),
            Self::Whaleback => (0.0, 1.0, 0.0, 0.0, 2.5),
            Self::Crag => (0.25, 4.0, LEDGE_M, 0.0, 0.0),
            Self::Knoll => (0.0, 3.0, BAND_M / 3.0, 0.0, 0.0),
            Self::Hummock => (0.5, 1.0, 0.0, 0.0, 0.0),
        };
        Form { top, most, ledge, lean, spine }
    }
}

impl Outcrop {
    /// How many bands it stands in, how far its flat top reaches from its middle, how wide each band is (its face
    /// and the ledge after it), metres, and its face's share of that. As many faces fit as each can rise over
    /// `BAND_M`, even on the side its lean crowds, with a ledge between each two; a flat top is the last face's ledge,
    /// and gives way to the face on a small outcrop. One too small for a single such face stands in one all the same.
    fn terraces(&self) -> (f64, f64, f64, f64) {
        let form = self.shape.form();
        let (face, ledge) = (BAND_M * (1.0 + form.lean), form.ledge * (1.0 + form.lean));
        let top = (self.radius * form.top).min(self.radius - face).max(0.0);
        let climb = self.radius - top + if top > 0.0 { ledge } else { 0.0 };
        let bands = (climb / (face + ledge)).floor().clamp(1.0, form.most);
        let width = climb / bands;
        (bands, top, width, 1.0 - ledge / width)
    }

    /// How many bands it stands in.
    #[must_use]
    pub fn bands(&self) -> u32 {
        self.terraces().0 as u32
    }

    /// Its spine's two ends along its angle (one point but for a whaleback), and how far from that spine it raises
    /// the land at most, metres: its radius, wandered out.
    #[must_use]
    pub fn footprint(&self) -> ([[f64; 2]; 2], f64) {
        let (sine, cosine) = sin_cos(self.angle);
        let spine = self.radius * self.shape.form().spine;
        let (along_x, along_y) = (sine * spine, -cosine * spine);
        let [x, y] = self.at;
        ([[x - along_x, y - along_y], [x + along_x, y + along_y]], self.radius * (1.0 + WANDER))
    }

    /// Its bounds (west, north, east, south), past which it never raises the land: its footprint's.
    #[must_use]
    pub fn reach(&self) -> [f64; 4] {
        let ([first, last], out) = self.footprint();
        [
            first[0].min(last[0]) - out,
            first[1].min(last[1]) - out,
            first[0].max(last[0]) + out,
            first[1].max(last[1]) + out,
        ]
    }

    /// How high it stands at a point, metres; `seed` wanders its edge, the sculpt's seed mixed with its place.
    pub(crate) fn stands(&self, seed: u32, x: f64, y: f64) -> f64 {
        let [middle_x, middle_y] = self.at;
        let (radius, tall) = (self.radius, self.tall);
        let form = self.shape.form();
        let (sine, cosine) = sin_cos(self.angle);
        let along = (x - middle_x) * sine - (y - middle_y) * cosine;
        let spine = radius * form.spine;
        let (beyond, across) = (along - along.clamp(-spine, spine), (x - middle_x) * cosine + (y - middle_y) * sine);
        // Past its footprint it stands nowhere however its edge wanders, so its noise is never asked there.
        let footprint = radius * (1.0 + WANDER) * (1.0 + 1e-9);
        if beyond * beyond + across * across > footprint * footprint {
            return 0.0;
        }
        // The edge wanders over a span of its size, so a broad outcrop's faces are no steeper than a small one's.
        let span = 0.75 * radius;
        let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(seed, x / span, y / span, 2));
        // Off its spine's ends, and across it, in the shape's own measure, where its edge is a circle of its radius.
        let (beyond, across) = (beyond / wander, across / wander);
        let unleaned = (beyond * beyond + across * across).sqrt();
        // The higher up, the further along its angle its middle stands: its foot stays put, its stack leans.
        let leaned = beyond - form.lean * (radius - unleaned).max(0.0);
        let out = (leaned * leaned + across * across).sqrt();
        let (bands, top, width, face) = self.terraces();
        let climbed = ((radius - out) / width).clamp(0.0, bands);
        let band = climbed.floor().min(bands - 1.0);
        // A band reaching the middle rises all across it, so a shape with no flat top is a dome, never a point.
        let face = if top <= 0.0 && climbed >= bands - 1.0 { 1.0 } else { face };
        tall * (band + smooth(0.0, face, climbed - band)) / bands
    }
}
