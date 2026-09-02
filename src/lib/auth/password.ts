import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Mirrors the client-side rule so the API can't be bypassed by curl. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  if (!/[a-z]/i.test(plain)) return "Password must contain a letter.";
  if (!/[0-9]/.test(plain)) return "Password must contain a number.";
  return null;
}
