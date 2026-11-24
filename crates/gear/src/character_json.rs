//! A character as it is kept between sessions: written with what others see of it, and read back made whole.

use crate::catalogue::catalogue;
use crate::character::{AUREM_MOST, At, Character, SHIP_WHOLE, STOCK_MOST};

impl Character {
    /// The character as it is kept between sessions, with what others see of it (`shown.rs`) beside it, which reading
    /// it passes over.
    #[must_use]
    pub fn to_json(&self) -> String {
        let mut kept = serde_json::to_value(self).unwrap_or_default();
        if let (Some(object), Ok(shown)) = (kept.as_object_mut(), serde_json::to_value(self.shown())) {
            object.insert("shown".to_owned(), shown);
        }
        kept.to_string()
    }

    /// A character kept between sessions, or none when the text is not one. Read, it is made whole: it gains a stock
    /// of each island's resource added since it was kept, its stocks stay within their caps, each item is as an item
    /// should be (`Item::kept`), a node bought whose trait no longer fits its piece is given back
    /// (`old_hands::unfit`), one worn in a slot it does not fit or that another fills is carried, and its next
    /// number stays past every one it holds, and its activities hold only what the board has. So no keeping, old or
    /// broken, can make a room refuse or fail on it. One kept before the loadouts is read into them (`old_hands.rs`).
    #[must_use]
    pub fn from_json(text: &str) -> Option<Self> {
        let mut kept: serde_json::Value = serde_json::from_str(text).ok()?;
        let shields = crate::old_hands::read(&mut kept);
        // What others see is made again from the gear on each write (`to_json`), never kept as an unknown key.
        if let Some(object) = kept.as_object_mut() {
            object.remove("shown");
            // One kept before cosmetics was read wearing the Bay, which is its horse now.
            object.entry("cosmetics").or_insert_with(|| serde_json::json!({ "coat": crate::horses::FIRST_HORSE }));
        }
        let mut character: Self = serde_json::from_value(kept).ok()?;
        let resources = catalogue().resources.len();
        let materials = &mut character.materials;
        materials.resources.resize(resources.max(materials.resources.len()), 0);
        materials.aurem = materials.aurem.min(AUREM_MOST);
        for stock in [
            &mut materials.weapon_fragments,
            &mut materials.armor_fragments,
            &mut materials.weapon_essence,
            &mut materials.armor_essence,
            &mut materials.fruit,
        ]
        .into_iter()
        .chain(materials.resources.iter_mut())
        {
            *stock = (*stock).min(STOCK_MOST);
        }
        materials.crates = materials.crates.min(crate::ammo::CRATES_MOST);
        materials.ship = materials.ship.kept();
        character.ammo = character.ammo.min(crate::ammo::AMMO_FULL);
        character.ship = character.ship.map(|share| share.min(SHIP_WHOLE));
        let mut worn = Vec::new();
        for (id, (item, at)) in std::mem::take(&mut character.items) {
            let item = crate::old_hands::unfit(&mut character, item.kept(id, resources));
            let at = match at {
                At::Worn(slot) if !item.kind.fits(slot) || worn.contains(&slot) => At::Carried,
                At::Worn(slot) => {
                    worn.push(slot);
                    At::Worn(slot)
                }
                other => other,
            };
            character.items.insert(id, (item, at));
        }
        shields.settle(&mut character);
        for letter in &mut character.mail {
            letter.item = letter.item.take().map(|item| {
                let id = item.id;
                item.kept(id, resources)
            });
        }
        let letters = character.mail.iter().map(|letter| &letter.id);
        let held = character.items.keys().chain(character.vestiges.keys()).chain(character.crew.officers.keys());
        let held = held.chain(letters);
        let highest = held.max().copied().unwrap_or(0);
        character.next_id = character.next_id.max(highest.saturating_add(1)).max(1);
        character.arts = std::mem::take(&mut character.arts).kept();
        character.activity = std::mem::take(&mut character.activity).kept();
        character.crew = std::mem::take(&mut character.crew).kept();
        character.fleet.keep_whole();
        if character.has_ship() {
            character.fit_first_modules();
        }
        character.allegiance = std::mem::take(&mut character.allegiance).kept();
        character.dress_kept();
        character.quests = std::mem::take(&mut character.quests).kept();
        character.materials.shapes = character.materials.shapes.min(STOCK_MOST);
        let mut seen = std::collections::BTreeSet::new();
        character.lore.retain(|key| seen.insert(key.clone()));
        character.horses_from_coats();
        character.earn_due();
        character.settle_carried();
        Some(character)
    }
}
