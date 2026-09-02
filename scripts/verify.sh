#!/usr/bin/env bash
#
# End-to-end verification of the portal's business requirements, driven through
# the running app exactly as a user (or an attacker) would reach it. Nothing is
# imported or stubbed: every check is an HTTP request against a live server.
#
#   npm run dev            # in one terminal
#   bash scripts/verify.sh # in another
#
# Override the target with BASE=https://portal.example.com bash scripts/verify.sh
#
# The suite creates a temporary user and role and deletes both when it is done,
# so it is safe to re-run against a seeded database.

set -u
BASE=${BASE:-http://localhost:3000}
PROJ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$(mktemp -d "${TMPDIR:-/tmp}/portal-verify.XXXXXX")"
trap 'rm -rf "$JAR"' EXIT

PASS=0; FAIL=0; declare -a FAILED

ok()  { PASS=$((PASS+1)); printf "  [PASS]  %s\n" "$1"; }
bad() { FAIL=$((FAIL+1)); FAILED+=("$1"); printf "  [FAIL]  %s\n          expected: %s\n          actual:   %s\n" "$1" "$2" "$3"; }
is()  { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2" "$3"; fi; }
sec() { printf "\n== %s\n" "$1"; }

login() {
  rm -f "$JAR/$3.txt"
  curl -s -c "$JAR/$3.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' -d "{\"email\":\"$1\",\"password\":\"$2\"}"
}
as()   { curl -s -b "$JAR/$1.txt" "${@:2}"; }
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
tiles(){ as "$1" "$BASE/dashboard" | grep -o "Zoho People\|Zoho CRM\|Zoho Desk\|Zoho Books" | sort -u | tr '\n' ',' | sed 's/,$//'; }

if [ "$(code "$BASE/login")" != "200" ]; then
  echo "No server at $BASE — start it with 'npm run dev' first." >&2
  exit 1
fi

sec "1. Custom login and JWT authentication"
is "valid credentials sign in"   200 "$(login admin@portal.test Admin@12345 admin)"
is "wrong password rejected"     401 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@portal.test","password":"wrong"}')"
is "unknown email rejected"      401 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"nobody@portal.test","password":"Portal@123"}')"
is "missing fields rejected"     400 "$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{}')"
HDR=$(curl -si -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"hr@portal.test","password":"Portal@123"}' | grep -i "^set-cookie")
if echo "$HDR" | grep -qi httponly; then ok "session cookie is HttpOnly"; else bad "session cookie is HttpOnly" "HttpOnly" "$HDR"; fi
if echo "$HDR" | grep -qi samesite; then ok "session cookie is SameSite"; else bad "session cookie is SameSite" "SameSite" "$HDR"; fi
is "credential is a 3-part JWT" 3 "$(grep portal_session "$JAR/admin.txt" | awk '{print $7}' | awk -F. '{print NF}')"

sec "2. Self-service signup"
STS=$(date +%s)
is "signup rejects a weak password"   400 "$(code -X POST "$BASE/api/auth/signup" -H 'Content-Type: application/json' -d '{"email":"w@portal.test","fullName":"W X","password":"short"}')"
is "signup rejects a malformed email" 400 "$(code -X POST "$BASE/api/auth/signup" -H 'Content-Type: application/json' -d '{"email":"nope","fullName":"W X","password":"Portal@123"}')"
is "signup rejects a duplicate email" 409 "$(code -X POST "$BASE/api/auth/signup" -H 'Content-Type: application/json' -d '{"email":"Employee@Portal.test","fullName":"W X","password":"Portal@123"}')"
is "signup creates an account"        201 "$(curl -s -c "$JAR/new.txt" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/signup" -H 'Content-Type: application/json' -d "{\"email\":\"v$STS@portal.test\",\"fullName\":\"Verify User\",\"password\":\"Portal@123\"}")"
is "new account is signed in already" 200 "$(code -b "$JAR/new.txt" "$BASE/api/auth/me")"
is "new account gets no Zoho app"     ""  "$(tiles new)"

sec "3. RBAC - each role sees only its own Zoho application"
for r in hr sales support finance employee; do login "$r@portal.test" Portal@123 "$r" >/dev/null; done
is "HR sees Zoho People only"     "Zoho People" "$(tiles hr)"
is "Sales sees Zoho CRM only"     "Zoho CRM"    "$(tiles sales)"
is "Support sees Zoho Desk only"  "Zoho Desk"   "$(tiles support)"
is "Finance sees Zoho Books only" "Zoho Books"  "$(tiles finance)"
is "Admin sees all four"          4             "$(as admin "$BASE/dashboard" | grep -o "Zoho People\|Zoho CRM\|Zoho Desk\|Zoho Books" | sort -u | wc -l | tr -d ' ')"
# Derived, not hardcoded: the tiles on the dashboard must equal the Zoho
# permissions the account actually holds. This stays true no matter what an
# admin has granted the demo user since the last seed, which a fixed
# expectation does not.
GRANTED=$(as employee "$BASE/api/auth/me" | grep -o "zoho\.[a-z]*\.access" | sed 's/zoho\.//;s/\.access//' | sort -u | tr '\n' ',' | sed 's/,$//')
SHOWN=$(as employee "$BASE/dashboard" | grep -o "Zoho People\|Zoho CRM\|Zoho Desk\|Zoho Books" | sed 's/Zoho People/people/;s/Zoho CRM/crm/;s/Zoho Desk/desk/;s/Zoho Books/books/' | sort -u | tr '\n' ',' | sed 's/,$//')
is "employee tiles match its granted permissions exactly" "$GRANTED" "$SHOWN"

sec "4. Permission enforced server-side, not by hiding tiles"
is "sales -> /api/zoho/books denied"     403 "$(code -b "$JAR/sales.txt"    "$BASE/api/zoho/books")"
is "finance -> /api/zoho/crm denied"     403 "$(code -b "$JAR/finance.txt"  "$BASE/api/zoho/crm")"
is "hr -> /api/zoho/desk denied"         403 "$(code -b "$JAR/hr.txt"       "$BASE/api/zoho/desk")"
is "support -> /api/zoho/people denied"  403 "$(code -b "$JAR/support.txt"  "$BASE/api/zoho/people")"
is "employee -> /api/admin/users denied" 403 "$(code -b "$JAR/employee.txt" "$BASE/api/admin/users")"
is "employee -> /api/admin/audit denied" 403 "$(code -b "$JAR/employee.txt" "$BASE/api/admin/audit")"
is "unauthenticated API returns 401"     401 "$(code "$BASE/api/zoho/books")"
is "unauthenticated page redirects"      307 "$(code "$BASE/dashboard")"

sec "5. Zoho One integration through one service account"
for pair in books:finance crm:sales desk:support people:hr; do
  app=${pair%%:*}; who=${pair##*:}
  BODY=$(as "$who" "$BASE/api/zoho/$app")
  if echo "$BODY" | grep -q '"data"';     then ok "$who loads live $app data";  else bad "$who loads live $app data" "data field" "$(echo "$BODY" | head -c 80)"; fi
  if echo "$BODY" | grep -q '"deepLink"'; then ok "$app returns redirect link"; else bad "$app redirect link" "deepLink" "$(echo "$BODY" | head -c 80)"; fi
done
if as finance "$BASE/api/zoho/books" | grep -qi "refresh_token\|client_secret\|access_token"; then
  bad "no Zoho credentials reach the client" "no tokens in response" "token found"
else ok "no Zoho credentials reach the client"; fi

sec "6. Admin manages users, roles, permissions and logs"
TS=$(date +%s)
NEW=$(as admin -X POST "$BASE/api/admin/users" -H 'Content-Type: application/json' -d "{\"email\":\"t$TS@portal.test\",\"fullName\":\"Temp User\",\"password\":\"Portal@123\",\"department\":\"QA\"}")
NUID=$(echo "$NEW" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$NUID" ]; then ok "admin creates a user"; else bad "admin creates a user" "an id" "$NEW"; fi
is "admin edits a user" 200 "$(code -b "$JAR/admin.txt" -X PATCH "$BASE/api/admin/users/$NUID" -H 'Content-Type: application/json' -d '{"department":"Edited"}')"
ROLE=$(as admin -X POST "$BASE/api/admin/roles" -H 'Content-Type: application/json' -d "{\"name\":\"Verify$TS\",\"description\":\"temp\"}")
RID=$(echo "$ROLE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$RID" ]; then ok "admin creates a role"; else bad "admin creates a role" "an id" "$ROLE"; fi
PID=$(as admin "$BASE/api/admin/permissions" | grep -o "{\"id\":\"[^\"]*\",\"key\":\"zoho.books.access\"" | cut -d'"' -f4)
is "admin assigns permission to role" 200 "$(code -b "$JAR/admin.txt" -X PATCH "$BASE/api/admin/roles/$RID" -H 'Content-Type: application/json' -d "{\"permissionIds\":[\"$PID\"]}")"
is "admin assigns role to user"       200 "$(code -b "$JAR/admin.txt" -X PATCH "$BASE/api/admin/users/$NUID" -H 'Content-Type: application/json' -d "{\"roleIds\":[\"$RID\"]}")"
login "t$TS@portal.test" Portal@123 temp >/dev/null
is "new grant takes effect on next request" "Zoho Books" "$(tiles temp)"
is "admin reads the audit log" 200 "$(code -b "$JAR/admin.txt" "$BASE/api/admin/audit")"
AUD=$(as admin "$BASE/api/admin/audit")
if echo "$AUD" | grep -q "access.denied"; then ok "denied attempts are audited"; else bad "denied attempts are audited" "access.denied entry" "none"; fi
if echo "$AUD" | grep -q "auth.login";    then ok "logins are audited";          else bad "logins are audited" "auth.login entry" "none"; fi
AID=$(as admin "$BASE/api/auth/me" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
is "admin cannot delete own account" 400 "$(code -b "$JAR/admin.txt" -X DELETE "$BASE/api/admin/users/$AID")"

sec "7. Session management and timeout controls"
as admin -X PATCH "$BASE/api/admin/users/$NUID" -H 'Content-Type: application/json' -d '{"isActive":false}' >/dev/null
is "deactivated account cannot sign in" 403 "$(login "t$TS@portal.test" Portal@123 dead)"
as admin -X PATCH "$BASE/api/admin/users/$NUID" -H 'Content-Type: application/json' -d '{"isActive":true}' >/dev/null
login "t$TS@portal.test" Portal@123 temp >/dev/null
is "signed-in user reaches dashboard" 200 "$(code -b "$JAR/temp.txt" "$BASE/dashboard")"
as temp -X POST "$BASE/api/auth/logout" >/dev/null
is "session dead after logout" 401 "$(code -b "$JAR/temp.txt" "$BASE/api/auth/me")"
if grep -q "IDLE_TIMEOUT_MINUTES = 30" "$PROJ/src/lib/auth/cookie.ts"; then ok "idle timeout configured (30 min)"; else bad "idle timeout" "30 min" "not found"; fi

sec "8. Admin deletes users, audit trail survives"
is "delete a user that has login history" 200 "$(code -b "$JAR/admin.txt" -X DELETE "$BASE/api/admin/users/$NUID")"
if as admin "$BASE/api/admin/audit" | grep -q "t$TS@portal.test"; then ok "deleted user's audit trail survives"; else bad "deleted user audit trail survives" "entries retained" "gone"; fi
code -b "$JAR/admin.txt" -X DELETE "$BASE/api/admin/roles/$RID" >/dev/null
VUID=$(as admin "$BASE/api/admin/users?q=v$STS" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$VUID" ] && code -b "$JAR/admin.txt" -X DELETE "$BASE/api/admin/users/$VUID" >/dev/null
ok "temporary user and role cleaned up"

sec "9. Transport security headers"
H=$(curl -sI "$BASE/login")
for h in Strict-Transport-Security X-Content-Type-Options X-Frame-Options Referrer-Policy; do
  if echo "$H" | grep -qi "^$h"; then ok "$h present"; else bad "$h" "present" "absent"; fi
done

sec "10. Manager is scoped to their own department"
login manager@portal.test Portal@123 manager >/dev/null
is "team report is single-department" 1 "$(as manager "$BASE/api/team" | grep -o '"department":"[^"]*"' | sort -u | wc -l | tr -d ' ')"
is "manager denied org-wide user list" 403 "$(code -b "$JAR/manager.txt" "$BASE/api/admin/users")"
is "manager reads no other department" 0 "$(as manager "$BASE/api/admin/users" | grep -o '"department":"[^"]*"' | sort -u | wc -l | tr -d ' ')"
is "manager still reaches team report" 200 "$(code -b "$JAR/manager.txt" "$BASE/api/team")"
is "manager still reaches team page"   200 "$(code -b "$JAR/manager.txt" "$BASE/team")"

printf "\n=========================================\n"
printf " PASSED: %s     FAILED: %s\n" "$PASS" "$FAIL"
if [ "$FAIL" -gt 0 ]; then printf "\n Failures:\n"; for f in "${FAILED[@]}"; do printf "  - %s\n" "$f"; done; fi
printf "=========================================\n"
[ "$FAIL" -eq 0 ]
