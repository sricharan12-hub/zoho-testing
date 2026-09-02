/**
 * One-time Zoho bootstrap: turn a grant code into a refresh token and
 * discover the Books / Desk org IDs.
 *
 *   node scripts/zoho-bootstrap.mjs <grant-code> [--write]   first run: code -> refresh token
 *   node scripts/zoho-bootstrap.mjs --orgs [--write]        re-read org IDs, no new code
 *
 * Grant codes expire in minutes, so run this right after generating one.
 * --write patches the placeholders in .env instead of just printing.
 */
import { readFileSync, writeFileSync } from "node:fs";

const envPath = new URL("../.env", import.meta.url);
const envText = readFileSync(envPath, "utf8");

const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const write = process.argv.includes("--write");
// --orgs re-uses the stored refresh token, for when an org is created later.
const orgsOnly = process.argv.includes("--orgs");
const code = orgsOnly ? null : process.argv[2];
if (!orgsOnly && (!code || code.startsWith("--"))) {
  console.error("usage: node scripts/zoho-bootstrap.mjs <grant-code> [--write]");
  console.error("       node scripts/zoho-bootstrap.mjs --orgs [--write]");
  process.exit(1);
}

const accounts = env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.in";
// Desk lives on desk.zoho.<tld>, not the zohoapis.<tld> domain everything else uses.
const tld = new URL(accounts).hostname.split(".").pop();

async function json(res, what) {
  const body = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`${what}: non-JSON response (${res.status})\n${body.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`${what}: ${res.status}\n${body.slice(0, 300)}`);
  return parsed;
}

const grant = orgsOnly
  ? { grant_type: "refresh_token", refresh_token: env.ZOHO_REFRESH_TOKEN }
  : { grant_type: "authorization_code", redirect_uri: env.ZOHO_REDIRECT_URI ?? "", code };

const tokenRes = await fetch(`${accounts}/oauth/v2/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: env.ZOHO_CLIENT_ID,
    client_secret: env.ZOHO_CLIENT_SECRET,
    ...grant,
  }),
});
const token = await json(tokenRes, "token exchange");

// Zoho returns HTTP 200 with an `error` field on failure.
if (token.error) {
  console.error(`token exchange failed: ${token.error}`);
  if (token.error === "invalid_code") {
    console.error("  -> the code expired or was already used; generate a fresh one");
  }
  process.exit(1);
}
if (!orgsOnly && !token.refresh_token) {
  console.error(
    "no refresh_token in the response. Re-authorize with access_type=offline and prompt=consent"
  );
  console.error(JSON.stringify(token, null, 2));
  process.exit(1);
}

const apiDomain = token.api_domain || env.ZOHO_API_DOMAIN;
const auth = { Authorization: `Zoho-oauthtoken ${token.access_token}` };

async function orgIds(label, url, pick) {
  try {
    return pick(await json(await fetch(url, { headers: auth }), label));
  } catch (err) {
    console.error(`  (${label} lookup failed: ${err.message.split("\n")[0]})`);
    return [];
  }
}

const books = await orgIds(
  "books",
  `${apiDomain}/books/v3/organizations`,
  (d) => (d.organizations ?? []).map((o) => [o.organization_id, o.name])
);
const desk = await orgIds(
  "desk",
  `https://desk.zoho.${tld}/api/v1/organizations`,
  (d) => (d.data ?? []).map((o) => [o.id, o.companyName ?? o.portalName])
);

console.log("");
if (token.refresh_token) console.log("ZOHO_REFRESH_TOKEN=" + token.refresh_token);
for (const [id, name] of books) console.log(`ZOHO_BOOKS_ORGANIZATION_ID=${id}   # ${name}`);
for (const [id, name] of desk) console.log(`ZOHO_DESK_ORG_ID=${id}   # ${name}`);
if (!books.length) console.log("no Books organization on this account - create one, then rerun with --orgs");
if (!desk.length) console.log("no Desk organization on this account - provision Desk, then regenerate the code with Desk scopes");
console.log(`\n(api_domain reported by Zoho: ${apiDomain})`);

if (write) {
  const patch = {
    ...(token.refresh_token && { ZOHO_REFRESH_TOKEN: token.refresh_token }),
    ...(books[0] && { ZOHO_BOOKS_ORGANIZATION_ID: books[0][0] }),
    ...(desk[0] && { ZOHO_DESK_ORG_ID: desk[0][0] }),
  };
  let out = envText;
  for (const [k, v] of Object.entries(patch)) {
    out = out.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`);
  }
  writeFileSync(envPath, out);
  console.log(`\nwrote ${Object.keys(patch).join(", ")} to .env`);
  if (books.length > 1 || desk.length > 1) {
    console.log("more than one org exists — check .env picked the right one");
  }
}
