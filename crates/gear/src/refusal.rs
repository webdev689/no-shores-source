//! Why an ask is refused. A refusal's place in the list is its number on the wire, which the page reads in its own list
//! (`gear.ts` `REFUSALS`), so a new one goes last.

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
    /// The guild's asks: no such guild bounty this week, one the guild has not finished, one claimed already this
    /// week, a member who joined since the week turned, and a player in no guild (the room's).
    NoSuchGuildBounty = 150,
    GuildBountyNotDone = 151,
    GuildBountyClaimed = 152,
    JoinedThisWeek = 153,
    NotInGuild = 154,
    /// An outpost's asks (`room::outpost`): asked off its guild's outpost; the treasury is full; nothing being built
    /// needs that; the stores hold none for the player today; the horn sounded this week; the accounts did not
    /// answer; the guild boss stands; the last ask is unanswered; not the founder or an admin; no horn stands.
    NotAtOutpost = 155,
    TreasuryFull = 156,
    NothingNeeds = 157,
    StoresEmpty = 158,
    HornSounded = 159,
    OutpostTrouble = 160,
    HornFoeStands = 161,
    AskInFlight = 162,
    HornNotLeader = 163,
    NoHorn = 164,
    /// Past the account's limit on outpost asks, which the accounts answer so: never a refusal of the ask itself.
    TooManyAsks = 165,
}
