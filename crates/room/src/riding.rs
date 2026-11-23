//! Who rides: a player with a horse worn in the Mount slot, never on a ship's deck, whatever their page says; and a
//! player on foot shows others no horse, so a page cannot show one the character does not ride.

use crate::players::{Input, Player, Shown};

/// Takes a page's mounted input only from a player who may ride, and while they are on foot shows its horse move as
/// the body's own: walking while it moves, else standing.
pub(crate) fn ride(found: Option<&mut Player>, input: &mut Input, on_deck: bool) {
    let Some(found) = found else { return };
    input.intent.controls.mounted &= found.character.may_ride() && !on_deck;
    found.mounted = input.intent.controls.mounted;
    if !found.mounted && input.shown.anim.starts_with("horse") {
        let anim = if found.fighter.body.moving { "walk" } else { "idle" };
        input.shown = Shown { anim: anim.to_owned(), frame: 0, facing: input.shown.facing };
    }
}
