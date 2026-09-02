/**
 * The permission catalogue. Seeding reads this, so adding a permission here
 * and re-running `npm run db:seed` is all it takes to introduce one.
 */
export const PERMISSIONS = [
  // Zoho application access — `zohoApp` links the permission to a dashboard tile.
  { key: "zoho.people.access", description: "Access Zoho People (HR)", zohoApp: "people" },
  { key: "zoho.crm.access", description: "Access Zoho CRM (Sales)", zohoApp: "crm" },
  { key: "zoho.desk.access", description: "Access Zoho Desk (Support)", zohoApp: "desk" },
  { key: "zoho.books.access", description: "Access Zoho Books (Finance)", zohoApp: "books" },

  // Portal administration
  { key: "admin.users.read", description: "View users", zohoApp: null },
  { key: "admin.users.write", description: "Create, edit and delete users", zohoApp: null },
  { key: "admin.roles.read", description: "View roles and permissions", zohoApp: null },
  { key: "admin.roles.write", description: "Create roles and assign permissions", zohoApp: null },
  { key: "admin.audit.read", description: "View audit and access logs", zohoApp: null },

  // Manager scope
  { key: "team.reports.read", description: "View team information and reports", zohoApp: null },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ADMIN_PERMISSIONS: string[] = PERMISSIONS.map((p) => p.key);

/**
 * Seeded roles. The four business roles map 1:1 to the Zoho applications named
 * in the brief; Admin gets everything, Manager gets team reporting.
 */
export const ROLES: {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}[] = [
  {
    name: "Admin",
    description: "Full portal access, user and role administration",
    isSystem: true,
    permissions: ADMIN_PERMISSIONS,
  },
  {
    name: "Manager",
    description: "Team information and reports for assigned departments",
    isSystem: true,
    // team.reports.read alone. admin.users.read is deliberately NOT granted:
    // it is an org-wide read, so it would let a manager list every employee in
    // the company through /api/admin/users, beyond the "assigned departments"
    // scope the role is meant to have. The team report reads the caller's own
    // department from their user record instead.
    permissions: ["team.reports.read"],
  },
  {
    name: "HR",
    description: "HR management functions via Zoho People",
    isSystem: true,
    permissions: ["zoho.people.access"],
  },
  {
    name: "Sales",
    description: "Sales and customer relationship management via Zoho CRM",
    isSystem: true,
    permissions: ["zoho.crm.access"],
  },
  {
    name: "Support",
    description: "Support ticketing and case management via Zoho Desk",
    isSystem: true,
    permissions: ["zoho.desk.access"],
  },
  {
    name: "Finance",
    description: "Financial and accounting operations via Zoho Books",
    isSystem: true,
    permissions: ["zoho.books.access"],
  },
  {
    name: "Employee",
    description: "Baseline access with no Zoho applications assigned",
    isSystem: true,
    permissions: [],
  },
];
