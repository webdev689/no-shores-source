//! The outcrops a sculpt raises on its floor, each of a shape. Every shape but the mesa stands in bands whose faces
//! rise over at least `BAND_M`, so the close-up, which samples the ground every 4 m, draws its faces and never a
//! point; the mesa keeps the profile old sculpts were written with, so they raise the land as they did.

use crate::exact::{fbm, sin_cos, smooth};
use crate::sculpts::WANDER;
use serde::{Deserialize, Serialize};

/// How far across an outcrop's face rises at least, metres: two of the close-up's 4 m samples.
pub const BAND_M: f64 = 8.0;

/// An outcrop's form, after the land it stands in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Shape {
    /// Three steep bands in its rim's last three tenths, its top flat over the rest.
    Mesa,
    /// A rounded stack of up to three domes, leaning along its angle.
    Tor,
    /// A long, low, rounded ridge along its angle.
    Whaleback,
    /// A knot of up to four faces and ledges under a flat top.
    Crag,
    /// A steep-sided hill of up to three terraced faces, rounded on top.
    Knoll,
    /// One low band, its top flat over up to half its radius.
    Hummock,
}

/// An outcrop on a sculpt's floor: its middle, its radius and tall, metres, its shape, and its angle, radians clockwise
/// from north (the way a whaleback runs and a tor or crag leans). Written `[x, y, radius, tall, shape, angle]`, and
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

/// How a shape stands, each a share of its radius but `most`: its flat top (none for a dome), how many bands it
/// stands in at most, how much of each band its face rises over (the rest a ledge), how far it leans along its angle
/// up its stack, and its spine's half-length along its angle.
struct Form {
    top: f64,
    most: f64,
    face: f64,
    lean: f64,
    spine: f64,
}

impl Shape {
    fn form(self) -> Form {
        let (top, most, face, lean, spine) = match self {
            Self::Mesa => (0.7, 3.0, 0.4, 0.0, 0.0),
            Self::Tor => (0.0, 3.0, 1.0, 0.25, 0.0),
            Self::Whaleback => (0.0, 1.0, 1.0, 0.0, 2.5),
            Self::Crag => (0.25, 4.0, 0.75, 0.0, 0.0),
            Self::Knoll => (0.0, 3.0, 0.75, 0.0, 0.0),
            Self::Hummock => (0.5, 1.0, 1.0, 0.0, 0.0),
        };
        Form { top, most, face, lean, spine }
    }
}

impl Outcrop {
    /// How many bands it stands in and how far its flat top reaches from its middle, metres: as many bands as fit
    /// with each face `BAND_M` across, even on the side its lean crowds, the top giving way to them on a small
    /// outcrop; one too small for a single such band stands in one all the same.
    fn terraces(&self) -> (f64, f64) {
        let form = self.shape.form();
        if self.shape == Shape::Mesa {
            return (form.most, self.radius * form.top);
        }
        let band = BAND_M / form.face * (1.0 + form.lean);
        let top = (self.radius * form.top).min(self.radius - band).max(0.0);
        (((self.radius - top) / band).floor().clamp(1.0, form.most), top)
    }

    /// How many bands it stands in.
    #[must_use]
    pub fn bands(&self) -> u32 {
        self.terraces().0 as u32
    }

    /// Its bounds (west, north, east, south), past which it never raises the land: its spine's ends and its radius,
    /// wandered out.
    pub(crate) fn reach(&self) -> [f64; 4] {
        let (sine, cosine) = sin_cos(self.angle);
        let spine = self.radius * self.shape.form().spine;
        let (along_x, along_y) = ((sine * spine).abs(), (cosine * spine).abs());
        let out = self.radius * (1.0 + WANDER);
        [self.at[0] - along_x - out, self.at[1] - along_y - out, self.at[0] + along_x + out, self.at[1] + along_y + out]
    }

    /// How high it stands at a point, metres; `seed` wanders its edge, the sculpt's seed mixed with its place.
    pub(crate) fn stands(&self, seed: u32, x: f64, y: f64) -> f64 {
        let [middle_x, middle_y] = self.at;
        let (radius, tall) = (self.radius, self.tall);
        // The edge wanders over a span of its size, so a broad outcrop's faces are no steeper than a small one's;
        // the mesa's, as it was, over 9 m.
        let span = if self.shape == Shape::Mesa { 9.0 } else { 0.75 * radius };
        let wander = 1.0 + WANDER * (0.5 + 0.5 * fbm(seed, x / span, y / span, 2));
        if self.shape == Shape::Mesa {
            let out = ((x - middle_x) * (x - middle_x) + (y - middle_y) * (y - middle_y)).sqrt() / wander;
            let mesa = 1.0 - smooth(radius * 0.7, radius, out);
            let band = (mesa * 3.0).floor();
            return tall * (band + smooth(0.6, 1.0, mesa * 3.0 - band)) / 3.0;
        }
        let form = self.shape.form();
        let (sine, cosine) = sin_cos(self.angle);
        let along = (x - middle_x) * sine - (y - middle_y) * cosine;
        let spine = radius * form.spine;
        // Off its spine's ends, and across it, in the shape's own measure, where its edge is a circle of its radius.
        let (beyond, across) =
            ((along - along.clamp(-spine, spine)) / wander, ((x - middle_x) * cosine + (y - middle_y) * sine) / wander);
        let unleaned = (beyond * beyond + across * across).sqrt();
        // The higher up, the further along its angle its middle stands: its foot stays put, its stack leans.
        let leaned = beyond - form.lean * (radius - unleaned).max(0.0);
        let out = (leaned * leaned + across * across).sqrt();
        let (bands, top) = self.terraces();
        let climbed = ((radius - out) / (radius - top)).clamp(0.0, 1.0) * bands;
        let band = climbed.floor().min(bands - 1.0);
        // A band reaching the middle rises all across it, so a shape with no flat top is a dome, never a point.
        let face = if top <= 0.0 && climbed >= bands - 1.0 { 1.0 } else { form.face };
        tall * (band + smooth(0.0, face, climbed - band)) / bands
    }
}
