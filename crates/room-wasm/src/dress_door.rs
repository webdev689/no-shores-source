//! A dress through the door as the room lets others see it (`gear::cosmetics::dressed`), for a character wearing the
//! pieces named: the page's tests hold the dress it builds for every piece the game can hold to the room's word.

use crate::hand_over;
use gear::character::At;
use gear::kinds::Kind;
use gear::rarity::Rarity;
use gear::source::Source;
use serde::Deserialize;

/// A worn piece as the page's tests name it.
#[derive(Deserialize)]
struct Worn {
    kind: Kind,
    rarity: Rarity,
    #[serde(default)]
    source: Source,
    level: u8,
    name: u8,
    named: Option<String>,
    #[serde(default)]
    story: bool,
}

#[derive(Deserialize)]
struct Asked {
    dress: String,
    worn: Vec<Worn>,
}

/// The dress in `bytes` (JSON: `{"dress": <dress text>, "worn": [piece, ...]}`) as others see it on a character
/// wearing only those pieces; empty when it does not read.
#[must_use]
pub fn dressed(bytes: &[u8]) -> String {
    let Ok(asked) = serde_json::from_slice::<Asked>(bytes) else { return String::new() };
    let mut character = gear::Character::starting();
    character.items.clear();
    for (id, worn) in (1..).zip(asked.worn) {
        let mut item = gear::item::Item::new(id, worn.kind, worn.rarity, worn.level, worn.kind.slot());
        (item.source, item.name, item.named, item.story) = (worn.source, worn.name, worn.named, worn.story);
        character.items.insert(id, (item, At::Worn(worn.kind.slot())));
    }
    gear::cosmetics::dressed(&asked.dress, &character).unwrap_or_default()
}

/// `dressed` of the bytes written at `address`, packed as `hand_over` packs.
///
/// # Safety
/// `address` must point at `length` readable bytes, as `reserve` gives.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn room_dressed(address: *const u8, length: usize) -> u64 {
    // SAFETY: the caller wrote `length` bytes at `address`, in memory `reserve` handed out.
    hand_over(dressed(unsafe { std::slice::from_raw_parts(address, length) }).into_bytes())
}
