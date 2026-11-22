//! The vault's asks at a social space: a carried item or Vestige put in the vault, or one in it taken out, while there
//! is room for it where it goes.

use crate::asks::{Done, Here, Refusal};
use crate::character::{At, Character, VAULT_MOST, VESTIGES_MOST};

impl Character {
    pub(crate) fn move_item(&mut self, id: u32, here: Here, from: At, to: At) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (item, at) = self.items.get(&id).ok_or(Refusal::NoSuchItem)?;
        if *at != from {
            return Err(Refusal::WrongPlace);
        }
        if to == At::Vault && self.vaulted(item.kind.stock()) >= VAULT_MOST {
            return Err(Refusal::VaultFull);
        }
        self.settle_moves(&[(id, to)])?;
        Ok(None)
    }

    pub(crate) fn move_vestige(&mut self, id: u32, here: Here, into_vault: bool) -> Result<Option<Done>, Refusal> {
        if !here.social {
            return Err(Refusal::NotHere);
        }
        let (_, vaulted) = *self.vestiges.get(&id).ok_or(Refusal::NoSuchVestige)?;
        if vaulted == into_vault {
            return Err(Refusal::WrongPlace);
        }
        let room = if into_vault { VAULT_MOST } else { VESTIGES_MOST };
        if self.vestiges_held(into_vault) >= room {
            return Err(if into_vault { Refusal::VaultFull } else { Refusal::VestigesFull });
        }
        if let Some(entry) = self.vestiges.get_mut(&id) {
            entry.1 = into_vault;
        }
        Ok(None)
    }
}
