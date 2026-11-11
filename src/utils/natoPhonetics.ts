export interface IcaoPhoneticEntry {
  letter: string;
  icao: string;
  spoken: string;
}

export const ICAO_PHONETIC_TABLE: IcaoPhoneticEntry[] = [
  { letter: "A", icao: "Alfa", spoken: "Alpha" },
  { letter: "B", icao: "Bravo", spoken: "Bravo" },
  { letter: "C", icao: "Charlie", spoken: "Charlie" },
  { letter: "D", icao: "Delta", spoken: "Delta" },
  { letter: "E", icao: "Echo", spoken: "Echo" },
  { letter: "F", icao: "Foxtrot", spoken: "Foxtrot" },
  { letter: "G", icao: "Golf", spoken: "Golf" },
  { letter: "H", icao: "Hotel", spoken: "Hotel" },
  { letter: "I", icao: "India", spoken: "India" },
  { letter: "J", icao: "Juliett", spoken: "Juliett" },
  { letter: "K", icao: "Kilo", spoken: "Kilo" },
  { letter: "L", icao: "Lima", spoken: "Lima" },
  { letter: "M", icao: "Mike", spoken: "Mike" },
  { letter: "N", icao: "November", spoken: "November" },
  { letter: "O", icao: "Oscar", spoken: "Oscar" },
  { letter: "P", icao: "Papa", spoken: "Papa" },
  { letter: "Q", icao: "Quebec", spoken: "Quebec" },
  { letter: "R", icao: "Romeo", spoken: "Romeo" },
  { letter: "S", icao: "Sierra", spoken: "Sierra" },
  { letter: "T", icao: "Tango", spoken: "Tango" },
  { letter: "U", icao: "Uniform", spoken: "Uniform" },
  { letter: "V", icao: "Victor", spoken: "Victor" },
  { letter: "W", icao: "Whiskey", spoken: "Whiskey" },
  { letter: "X", icao: "X-ray", spoken: "X-ray" },
  { letter: "Y", icao: "Yankee", spoken: "Yankee" },
  { letter: "Z", icao: "Zulu", spoken: "Zulu" },
];

export const ICAO_LETTER_MAP: Record<string, string> = Object.fromEntries(
  ICAO_PHONETIC_TABLE.map((e) => [e.letter, e.spoken])
);

export const ICAO_DISPLAY_MAP: Record<string, string> = Object.fromEntries(
  ICAO_PHONETIC_TABLE.map((e) => [e.letter, e.icao])
);

export const DIGIT_WORDS: Record<string, string> = {
  "0": "Zero",
  "1": "One",
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Niner",
};

export const AIRLINE_TELEPHONY: Record<string, string> = {
  UAL: "United",
  DAL: "Delta",
  AAL: "American",
  SWA: "Southwest",
  JBU: "JetBlue",
  FDX: "FedEx",
  AIC: "Air India",
  IGO: "iFly",
  VTI: "Vistara",
  SEJ: "SpiceJet",
  AKJ: "Akasa Air",
  UAE: "Emirates",
  BAW: "Speedbird",
  SIA: "Singapore",
  DLH: "Lufthansa",
};

export function spellDigitsIcao(digits: string, capitalize = false): string {
  return digits
    .split("")
    .map((ch) => {
      const w = DIGIT_WORDS[ch];
      if (!w) return ch;
      return capitalize ? w : w.toLowerCase();
    })
    .join(" ");
}

export function spellLettersIcao(letters: string): string {
  return letters
    .toUpperCase()
    .split("")
    .map((ch) => ICAO_LETTER_MAP[ch] ?? ch)
    .join(" ");
}

export function formatGateIcao(gateId: string): string {
  const m = /^([A-Za-z]+)(\d+)$/.exec(gateId.trim());
  if (!m) return gateId;
  return `${spellLettersIcao(m[1])} ${spellDigitsIcao(m[2], true)}`;
}

export function formatFixIcao(fixId: string): string {
  const upper = fixId.trim().toUpperCase();
  if (upper === "IF09L") return "India Foxtrot Zero Niner Left";
  if (upper === "IF09R") return "India Foxtrot Zero Niner Right";
  if (upper === "IF08L") return "India Foxtrot Zero Eight Left";
  if (upper === "IF08R") return "India Foxtrot Zero Eight Right";
  if (upper === "IF09") return "India Foxtrot Zero Niner";
  if (upper === "IF27L") return "India Foxtrot Two Seven Left";
  if (upper === "IF27R") return "India Foxtrot Two Seven Right";

  // Named 4-6 letter RNAV waypoints followed by digits (e.g. ASTER1 -> "ASTER One", ALPINE1 -> "ALPINE One")
  const namedWithNum = /^([A-Z]{4,6})(\d{1,2})$/.exec(upper);
  if (namedWithNum) {
    return `${namedWithNum[1]} ${spellDigitsIcao(namedWithNum[2], true)}`;
  }

  // Short 1-3 letter fixes with digits (e.g. K5 -> "Kilo Five")
  const shortWithNum = /^([A-Z]{1,3})(\d{1,2})$/.exec(upper);
  if (shortWithNum) {
    return `${spellLettersIcao(shortWithNum[1])} ${spellDigitsIcao(shortWithNum[2], true)}`;
  }

  return upper.charAt(0) + upper.slice(1).toLowerCase();
}

export function formatCallsignIcao(callsign: string): string {
  const clean = callsign.trim().toUpperCase();
  const airlineMatch = /^([A-Z]{3})(\d+)$/.exec(clean);
  if (airlineMatch && AIRLINE_TELEPHONY[airlineMatch[1]]) {
    return `${AIRLINE_TELEPHONY[airlineMatch[1]]} ${spellDigitsIcao(airlineMatch[2], true)}`;
  }
  // Tail numbers / military callsigns (e.g. N732AB -> "November Seven Three Two Alpha Bravo")
  return clean
    .split("")
    .map((ch) => {
      if (ICAO_LETTER_MAP[ch]) return ICAO_LETTER_MAP[ch];
      if (DIGIT_WORDS[ch]) return DIGIT_WORDS[ch];
      return ch;
    })
    .join(" ");
}
