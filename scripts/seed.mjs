/**
 * Seeds the permission catalogue, the system roles, and a demo user per role.
 *
 *   npm run db:seed
 *
 * Idempotent: re-running updates existing rows rather than duplicating them,
 * so it is safe after editing src/lib/auth/permissions.ts.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

// Read .env directly so the script works without Next.js loading it for us.
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// Mirrors src/lib/auth/permissions.ts. Kept as plain data so this script has
// no build step and can run straight from node.
const PERMISSIONS = [
  { key: "zoho.people.access", description: "Access Zoho People (HR)", zoho_app: "people" },
  { key: "zoho.crm.access", description: "Access Zoho CRM (Sales)", zoho_app: "crm" },
  { key: "zoho.desk.access", description: "Access Zoho Desk (Support)", zoho_app: "desk" },
  { key: "zoho.books.access", description: "Access Zoho Books (Finance)", zoho_app: "books" },
  { key: "admin.users.read", description: "View users", zoho_app: null },
  { key: "admin.users.write", description: "Create, edit and delete users", zoho_app: null },
  { key: "admin.roles.read", description: "View roles and permissions", zoho_app: null },
  { key: "admin.roles.write", description: "Create roles and assign permissions", zoho_app: null },
  { key: "admin.audit.read", description: "View audit and access logs", zoho_app: null },
  { key: "team.reports.read", description: "View team information and reports", zoho_app: null },
];

const ALL = PERMISSIONS.map((p) => p.key);

const ROLES = [
  { name: "Admin", description: "Full portal access, user and role administration", is_system: true, permissions: ALL },
  { name: "Manager", description: "Team information and reports for assigned departments", is_system: true, permissions: ["team.reports.read"] },
  { name: "HR", description: "HR management functions via Zoho People", is_system: true, permissions: ["zoho.people.access"] },
  { name: "Sales", description: "Sales and customer relationship management via Zoho CRM", is_system: true, permissions: ["zoho.crm.access"] },
  { name: "Support", description: "Support ticketing and case management via Zoho Desk", is_system: true, permissions: ["zoho.desk.access"] },
  { name: "Finance", description: "Financial and accounting operations via Zoho Books", is_system: true, permissions: ["zoho.books.access"] },
  { name: "Employee", description: "Baseline access with no Zoho applications assigned", is_system: true, permissions: [] },
];

const USERS = [
  { email: "admin@portal.test", full_name: "Aditi Rao", department: "IT", password: "Admin@12345", roles: ["Admin"] },
  // Shares the Sales department with sales@ so the team report has content.
  { email: "manager@portal.test", full_name: "Vikram Shah", department: "Sales", password: "Portal@123", roles: ["Manager"] },
  { email: "hr@portal.test", full_name: "Neha Kulkarni", department: "Human Resources", password: "Portal@123", roles: ["HR"] },
  { email: "sales@portal.test", full_name: "Rahul Menon", department: "Sales", password: "Portal@123", roles: ["Sales"] },
  { email: "support@portal.test", full_name: "Priya Nair", department: "Support", password: "Portal@123", roles: ["Support"] },
  { email: "finance@portal.test", full_name: "Arjun Desai", department: "Finance", password: "Portal@123", roles: ["Finance"] },
  // Deliberately has no Zoho application, to demonstrate an empty dashboard.
  { email: "employee@portal.test", full_name: "Sana Iqbal", department: "General", password: "Portal@123", roles: ["Employee"] },
];

function die(step, error) {
  console.error(`\nSeed failed at ${step}: ${error.message ?? error}`);
  if (String(error.message ?? error).match(/does not exist|schema cache/i)) {
    console.error("Run supabase/schema.sql in the Supabase SQL Editor first.");
  }
  process.exit(1);
}

// ------------------------------------------------------------- permissions
const { data: perms, error: permErr } = await supabase
  .from("permissions")
  .upsert(PERMISSIONS, { onConflict: "key" })
  .select("id, key");
if (permErr) die("permissions", permErr);
const permId = Object.fromEntries(perms.map((p) => [p.key, p.id]));
console.log(`permissions: ${perms.length}`);

// ------------------------------------------------------------------- roles
const { data: roles, error: roleErr } = await supabase
  .from("roles")
  .upsert(
    ROLES.map(({ name, description, is_system }) => ({ name, description, is_system })),
    { onConflict: "name" }
  )
  .select("id, name");
if (roleErr) die("roles", roleErr);
const roleId = Object.fromEntries(roles.map((r) => [r.name, r.id]));
console.log(`roles: ${roles.length}`);

// -------------------------------------------------------- role_permissions
for (const role of ROLES) {
  await supabase.from("role_permissions").delete().eq("role_id", roleId[role.name]);
  if (!role.permissions.length) continue;
  const { error } = await supabase.from("role_permissions").insert(
    role.permissions.map((key) => ({ role_id: roleId[role.name], permission_id: permId[key] }))
  );
  if (error) die(`role_permissions (${role.name})`, error);
}
console.log("role permissions: assigned");

// ------------------------------------------------------------------- users
for (const user of USERS) {
  const password_hash = await bcrypt.hash(user.password, 10);

  const { data: row, error } = await supabase
    .from("users")
    .upsert(
      {
        email: user.email,
        full_name: user.full_name,
        department: user.department,
        password_hash,
        is_active: true,
      },
      { onConflict: "email" }
    )
    .select("id, email")
    .single();
  if (error) die(`users (${user.email})`, error);

  await supabase.from("user_roles").delete().eq("user_id", row.id);
  const { error: urErr } = await supabase
    .from("user_roles")
    .insert(user.roles.map((name) => ({ user_id: row.id, role_id: roleId[name] })));
  if (urErr) die(`user_roles (${user.email})`, urErr);
}

console.log(`users: ${USERS.length}`);
console.log("\nSeed complete. Sign in with:");
for (const u of USERS) {
  console.log(`  ${u.email.padEnd(24)} ${u.password.padEnd(13)} ${u.roles.join(", ")}`);
}
