/**
 * PII SCRUBBER — the strictest sanitization layer in the frontend.
 * `scrubPii` recursively walks arbitrary payloads and replaces anything
 * matching a PII pattern with `[REDACTED]`. Used for error contexts,
 * mutation variables, and any payload whose provenance is not fully
 * controlled. The logger carries its own key/pattern redaction for the
 * hot path; this module is the defense-in-depth scrub for the rest.
 *
 * Pattern set (Baltic-first):
 *  - emails, international phone numbers, IPv4 addresses;
 *  - UUID-like strings (potential session/identity tokens);
 *  - credit-card-like digit runs (13–19 digits, Luhn-validated to avoid
 *    redacting innocent long numbers);
 *  - Lithuanian personal codes (11 digits, G YYMMDD XXX C);
 *  - Latvian personal codes (old DDMMYY-CXXXX and new 32-prefix form);
 *  - LT/LV postal codes;
 *  - key-based full replacement for name/address/secret-like keys
 *    (includes Lithuanian/Latvian field names).
 */

export const SCRUBBED = "[REDACTED]";

const MAX_DEPTH = 8;

/* -------------------------------------------------------------------------- */
/* Value patterns (applied to strings)                                         */
/* -------------------------------------------------------------------------- */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// E.164-capped (≤15 digits): longer unseparated runs are order IDs etc.;
// both guards refuse partial matches inside longer digit runs.
const PHONE = /(?<!\d)\+?\d(?:[ \-().]?\d){6,14}(?!\d)/g;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const UUID_LIKE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Lithuanian personal code: gender digit 1–6 + YYMMDD + serial + check. */
const LT_PERSONAL_CODE =
  /\b[1-6]\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{4}\b/g;
/** Latvian personal code: DDMMYY-CXXXX (legacy) or 32-prefixed new form. */
const LV_PERSONAL_CODE =
  /\b[0-3]\d(?:0[1-9]|1[0-2])\d{2}-?\d{5}\b|\b32\d{9}\b/g;
const POSTAL_LT_LV = /\b(?:LT-?\d{5}|LV-?\d{4})\b/gi;
/** Candidate card numbers: 13–19 digits with optional separators. */
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

/** Luhn check — only redact digit runs that could actually be cards. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    const digit = Number(digits[i]);
    if (Number.isNaN(digit)) return false;
    let add = digit;
    if (double) {
      add = digit * 2;
      if (add > 9) add -= 9;
    }
    sum += add;
    double = !double;
  }
  return sum % 10 === 0;
}

function scrubCardCandidates(value: string): string {
  return value.replace(CARD_CANDIDATE, (candidate) => {
    const digits = candidate.replace(/[ -]/g, "");
    return digits.length >= 13 && digits.length <= 19 && luhnValid(digits)
      ? SCRUBBED
      : candidate;
  });
}

/** Scrub PII patterns out of a single string. Card candidates go FIRST:
 * a Luhn-valid 16-digit span must be evaluated whole before the phone
 * pattern can partially consume it. */
export function scrubString(value: string): string {
  return scrubCardCandidates(value)
    .replace(EMAIL, SCRUBBED)
    .replace(UUID_LIKE, SCRUBBED)
    .replace(LT_PERSONAL_CODE, SCRUBBED)
    .replace(LV_PERSONAL_CODE, SCRUBBED)
    .replace(POSTAL_LT_LV, SCRUBBED)
    .replace(IPV4, SCRUBBED)
    .replace(PHONE, SCRUBBED);
}

/* -------------------------------------------------------------------------- */
/* Key-based replacement (names/addresses/secrets incl. LT/LV field names)    */
/* -------------------------------------------------------------------------- */

const PII_KEY =
  /email|password|secret|token|credential|phone|first_?name|last_?name|full_?name|^name$|vardas|pavarde|uzvards|name_|street|address|adres|adrese|city|miestas|postal|zip|dob|birth|personal_?code|asmens|ip/;

/* -------------------------------------------------------------------------- */
/* Recursive scrubber                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Deep-scrub any payload. Strings are pattern-scrubbed; PII-keyed values
 * are replaced wholesale; arrays/objects are traversed (cycles cut at
 * MAX_DEPTH); Errors reduce to name + scrubbed message. Never throws.
 */
export function scrubPii(data: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[TRUNCATED]";
  if (typeof data === "string") return scrubString(data);
  if (typeof data !== "object" || data === null) return data;
  if (data instanceof Error) {
    return { name: data.name, message: scrubString(data.message) };
  }
  if (Array.isArray(data)) {
    return data.map((entry) => scrubPii(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(data as Record<string, unknown>)) {
    out[key] = PII_KEY.test(key) ? SCRUBBED : scrubPii(entry, depth + 1);
  }
  return out;
}
