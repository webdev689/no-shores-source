//! Why an ask of a player's gear was refused, each by its number on the wire less one (`answer_code`): the room
//! answers a refusal as its number plus one, so a refusal's number never moves once given.

/// Why an ask was refused.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refusal {
    NoSuchItem,
    NoSuchVestige,
    /// The item does not go in that slot.
    DoesNotFit,
    /// The player's level is below the item's.
    TooLow,
    /// An Atheric is already worn in a loadout, or in the armour.
    OneAtheric,
    /// The slot it would be carried in already holds nine.
    CarriedFull,
    VaultFull,
    VestigesFull,
    /// Only in a social space.
    NotHere,
    /// Where the item is does not allow it: worn, or in the vault.
    WrongPlace,
    /// The item's XP has not reached the column.
    Locked,
    NoSuchNode,
    AlreadyBought,
    NotBought,
    /// Not enough of what it costs.
    Short,
    NoFruit,
    FullOfXp,
    NoSuchEmblem,
    /// The player does not keep that emblem or cosmetic.
    NotKept,
    /// The player keeps that emblem, cosmetic or cape already.
    Kept,
    /// The Tailor or the Tack does not sell it that day.
    NotSold,
    NoCrate,
    /// The Ranged loadout's ammunition is full already.
    AmmoFull,
    /// Five Ammo crates are carried already.
    CratesFull,
    NoSuchFaction,
    /// The player is not pledged to the faction.
    NotPledged,
    /// The player is pledged to the faction already.
    Pledged,
    /// The player's rank with the faction is too low.
    RankTooLow,
    /// The faction holds no package for the player.
    NoPackage,
    /// The Art's bar is not full.
    NotReady,
    /// The Art is at its highest level.
    LevelMost,
    /// The player owns the fragment already.
    Owned,
    NoSuchCosmetic,
    /// An Art has no fragment at that place.
    NoSuchFragment,
    /// The bounty board opens after the prologue. The board's refusals are numbered apart, answered 81 to 85, so a list
    /// growing above them never moves them.
    BoardShut = 80,
    /// No such place, a board of another day than the room's, or a room whose day is behind the character's record.
    NoSuchBounty,
    BountyHeld,
    /// Not held, or its count short of its target.
    BountyNotDone,
    BountyPaid,
    /// No Ranged weapon is worn for an Ammo crate to fill: answered as 120, one past its number as every refusal is.
    NoRanged = 119,
    NoSuchOfficer = 130,
    /// The player is pledged to no faction, whose counter signs officers on.
    NoPledge = 131,
    /// Eight officers are kept already.
    CrewFull = 132,
    /// Two officers are ashore already.
    AshoreFull = 133,
    /// The officer offered is in the crew already.
    OfficerKept = 134,
    /// No keeper has that number.
    NoSuchKeeper = 135,
    /// No goal of the player's task asks a word with that keeper.
    NothingToSay = 136,
    /// No fragment choice waits for that Art.
    NoChoice = 137,
    /// No letter of that number waits in the mail, or none at all: answered as 141.
    NoSuchLetter = 140,
    /// The shipyard has no hull of that number: answered as 151.
    NoSuchShip = 150,
    /// The player keeps no ship of that hull, or none at all: the Harbourmaster hands over the first.
    NoShip = 151,
    NoSuchDress = 152,
    /// No word of the shipyard's lists has that place.
    NoSuchName = 153,
    /// The ship asked to be sailed is the one sailed.
    Sailed = 154,
    /// The ship asked to be named bears that name already.
    Called = 155,
    /// A free name was asked for a ship named already: a new name is the shipyard's renaming, asked as one.
    Named = 156,
}
