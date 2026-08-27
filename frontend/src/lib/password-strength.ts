/**
 * Password strength heuristic — deliberately dependency-free (no zxcvbn:
 * ~1MB of dictionaries is not worth the download on the register page of a
 * marketplace whose persona floor is modest hardware). Real enforcement is
 * server-side policy; this only guides the user.
 */

export type StrengthLevel = "weak" | "fair" | "good" | "strong";

export interface PasswordStrength {
  /** 0–4 score, mirrors the four levels. */
  score: number;
  level: StrengthLevel;
}

export function passwordStrength(password: string): PasswordStrength {
  let points = 0;

  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^A-Za-z0-9]/.test(password)) points += 1;
  if (new Set(password).size >= 8) points += 1;

  // Penalize trivial patterns regardless of length.
  if (/^(.)\1+$/.test(password)) points = 0;
  if (/^(?:password|slaptazodis|parole|parool|123456)/i.test(password)) {
    points = Math.min(points, 1);
  }

  const score = Math.max(0, Math.min(4, Math.floor(points / 1.5)));
  const level: StrengthLevel =
    score >= 4
      ? "strong"
      : score === 3
        ? "good"
        : score === 2
          ? "fair"
          : "weak";
  return { score, level };
}
