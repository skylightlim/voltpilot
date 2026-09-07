import { LOOKUP } from "./postcode-lookup";

const STATE_BY_PREFIX: Record<string, string> = {
  "01": "Perlis", "02": "Perlis",
  "03": "Kedah", "04": "Kedah", "05": "Kedah", "06": "Kedah", "07": "Kedah", "08": "Kedah", "09": "Kedah",
  "10": "Pulau Pinang", "11": "Pulau Pinang", "12": "Pulau Pinang", "13": "Pulau Pinang", "14": "Pulau Pinang",
  "15": "Kelantan", "16": "Kelantan", "17": "Kelantan", "18": "Kelantan", "19": "Kelantan",
  "20": "Terengganu", "21": "Terengganu", "22": "Terengganu", "23": "Terengganu", "24": "Terengganu",
  "25": "Pahang", "26": "Pahang", "27": "Pahang", "28": "Pahang", "29": "Pahang",
  "30": "Perak", "31": "Perak", "32": "Perak", "33": "Perak", "34": "Perak", "35": "Perak", "36": "Perak", "37": "Perak",
  "38": "Pahang", "39": "Pahang",
  "40": "Selangor", "41": "Selangor", "42": "Selangor", "43": "Selangor", "44": "Selangor",
  "45": "Selangor", "46": "Selangor", "47": "Selangor", "48": "Selangor",
  "49": "Kuala Lumpur", "50": "Kuala Lumpur", "51": "Kuala Lumpur", "52": "Kuala Lumpur", "53": "Kuala Lumpur",
  "54": "Selangor", "55": "Selangor", "56": "Selangor",
  "57": "Kuala Lumpur", "58": "Kuala Lumpur", "59": "Kuala Lumpur",
  "60": "Negeri Sembilan", "61": "Negeri Sembilan", "62": "Putrajaya",
  "63": "Selangor", "64": "Selangor", "65": "Selangor", "66": "Selangor", "67": "Selangor", "68": "Selangor",
  "69": "Pahang", "70": "Negeri Sembilan", "71": "Negeri Sembilan", "72": "Pahang", "73": "Pahang", "74": "Pahang",
  "75": "Melaka", "76": "Melaka", "77": "Melaka", "78": "Melaka",
  "79": "Johor", "80": "Johor", "81": "Johor", "82": "Johor", "83": "Johor", "84": "Johor", "85": "Johor", "86": "Johor",
  "87": "Labuan", "88": "Sabah", "89": "Sabah", "90": "Sabah", "91": "Sabah", "92": "Sabah",
  "93": "Sarawak", "94": "Sarawak", "95": "Sarawak", "96": "Sarawak", "97": "Sarawak", "98": "Sarawak", "99": "Sabah",
};

const STATE_FULL: Record<string, string> = {
  "Kuala Lumpur": "Wilayah Persekutuan Kuala Lumpur",
  "Putrajaya": "Wilayah Persekutuan Putrajaya",
  "Labuan": "Wilayah Persekutuan Labuan",
  "Wp Kuala Lumpur": "Wilayah Persekutuan Kuala Lumpur",
  "Wp Putrajaya": "Wilayah Persekutuan Putrajaya",
  "Wp Labuan": "Wilayah Persekutuan Labuan",
};

/** Returns "Area, State" for a full 5-digit postcode, or state name for partial input. */
export function getPostcodeArea(postcode: string): string | null {
  if (postcode.length === 5) {
    const entry = LOOKUP[postcode];
    if (entry) {
      const [area, state] = entry.split(", ");
      // Federal territories and single-city states repeat themselves: the raw
      // entries are "Kuala Lumpur, Wp Kuala Lumpur" and "Pulau Pinang, Pulau
      // Pinang", which rendered as "Kuala Lumpur, Wilayah Persekutuan Kuala
      // Lumpur" and wrapped the field readout onto a second line. Dropping the
      // Wp/Wilayah Persekutuan prefix before comparing catches all four.
      const bare = state.replace(/^(Wp|Wilayah Persekutuan)\s+/i, "");
      if (area === bare) return area;
      return `${area}, ${STATE_FULL[state] ?? state}`;
    }
    return null;
  }
  if (postcode.length >= 2) {
    const state = STATE_BY_PREFIX[postcode.slice(0, 2)];
    return state ? (STATE_FULL[state] ?? state) : null;
  }
  return null;
}
