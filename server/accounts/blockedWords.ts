/** Each letter moved 13 places along the alphabet, and back. */
const rot13 = (text: string) =>
  text.replace(/[a-z]/g, (letter) => String.fromCharCode(((letter.charCodeAt(0) - 97 + 13) % 26) + 97));

// Kept in ROT13 so the repo and its searches never show the words; decoded once, here.
const ENCODED = `
  avttre avttn avtyrg snttbg snt genaal ergneq fcnm xvxr puvax tbbx jrgonpx ornare gbjryurnq enturnq mvccreurnq wnc
  erqfxva qnexvr wvtnobb cbepuzbaxrl jbt jbc lvq furznyr cbbsgre zbatbybvq shpx shx fuvg phag cvff jnaxre obyybpxf
  oryyraq nefrubyr nffubyr nff ovgpu fyhg juber fxnax qbhpuront wnpxnff qhzonff pbpxfhpxre qvpxurnq xabournq fzrtzn
  dhrrs qvyqb cravf intvan pyvg chffl phz phzfubg wvmm betnfz oybjwbo unaqwbo uragnv obbof gvgf gvggl cbea ohxxnxr
  tnatonat crqbcuvyr cnrqbcuvyr zbyrfg znfgheong snc sryyngvb ohggcyht ohggubyr wrexbss frk vaprfg`;

/** The roots no name or motto may hold: slurs, obscenities and sexual terms in English, written for the game. */
export const BLOCKED: readonly string[] = ENCODED.trim().split(/\s+/).map(rot13);
