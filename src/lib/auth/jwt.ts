import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";

export type TokenClaims = {
  sub: string; // user id
  email: string;
  jti: string; // matches sessions.jti, so a token can be revoked server-side
};

export function signToken(user: { id: string; email: string }): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = randomUUID();
  const token = jwt.sign({ sub: user.id, email: user.email, jti }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
  const { exp } = jwt.decode(token) as { exp: number };
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

/** Returns null for anything malformed, expired, or signed with another key. */
export function verifyToken(token: string): TokenClaims | null {
  try {
    const claims = jwt.verify(token, env.jwtSecret) as TokenClaims;
    return claims.sub && claims.jti ? claims : null;
  } catch {
    return null;
  }
}
