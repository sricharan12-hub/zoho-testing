import { db } from "@/lib/supabase";
import "server-only";

/**
 * Read models shared by the admin pages (server-rendered) and the admin API
 * routes, so both always report the same shape.
 */

export type AdminUser = {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: { id: string; name: string }[];
};

export type AdminRole = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { id: string; key: string }[];
};

export type AdminPermission = {
  id: string;
  key: string;
  description: string;
  zohoApp: string | null;
};

export type AuditEntry = {
  id: number;
  actorEmail: string | null;
  action: string;
  resource: string | null;
  status: string;
  detail: Record<string, unknown>;
  ip: string | null;
  createdAt: string;
};

export const AUDIT_PAGE_SIZE = 50;
export const USER_PAGE_SIZE = 25;

export async function listUsers(options?: {
  search?: string | null;
  page?: number;
}): Promise<{ users: AdminUser[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, options?.page ?? 0);
  const search = options?.search?.trim();

  let query = db()
    .from("users")
    .select(
      // user_roles references users twice (user_id and assigned_by), so the
      // embed must name the constraint or PostgREST cannot disambiguate it.
      "id, email, full_name, department, is_active, last_login_at, created_at, " +
        "user_roles!user_roles_user_id_fkey ( roles ( id, name ) )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(page * USER_PAGE_SIZE, page * USER_PAGE_SIZE + USER_PAGE_SIZE - 1);

  if (search) {
    // Escape the PostgREST or() delimiters before interpolating user input.
    const safe = search.replace(/[,()]/g, " ");
    query = query.or(
      `email.ilike.%${safe}%,full_name.ilike.%${safe}%,department.ilike.%${safe}%`
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    email: string;
    full_name: string;
    department: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    user_roles: { roles: { id: string; name: string } | null }[];
  };

  return {
    users: (data as unknown as Row[]).map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      department: u.department,
      isActive: u.is_active,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
      roles: (u.user_roles ?? [])
        .map((ur) => ur.roles)
        .filter((r): r is { id: string; name: string } => Boolean(r)),
    })),
    total: count ?? 0,
    page,
    pageSize: USER_PAGE_SIZE,
  };
}

export async function listRoles(): Promise<AdminRole[]> {
  const { data, error } = await db()
    .from("roles")
    .select("id, name, description, is_system, role_permissions ( permissions ( id, key ) )")
    .order("name");

  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    name: string;
    description: string | null;
    is_system: boolean;
    role_permissions: { permissions: { id: string; key: string } | null }[];
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    isSystem: r.is_system,
    permissions: (r.role_permissions ?? [])
      .map((rp) => rp.permissions)
      .filter((p): p is { id: string; key: string } => Boolean(p)),
  }));
}

export async function listPermissions(): Promise<AdminPermission[]> {
  const { data, error } = await db()
    .from("permissions")
    .select("id, key, description, zoho_app")
    .order("key");

  if (error) throw new Error(error.message);

  return (data ?? []).map((p) => ({
    id: p.id,
    key: p.key,
    description: p.description,
    zohoApp: p.zoho_app,
  }));
}

export async function listAudit(options: {
  page?: number;
  action?: string | null;
  status?: string | null;
  actor?: string | null;
  from?: string | null;
  to?: string | null;
}): Promise<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(0, options.page ?? 0);

  let query = db()
    .from("audit_logs")
    .select("id, actor_email, action, resource, status, detail, ip, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE - 1);

  if (options.action) query = query.eq("action", options.action);
  if (options.status) query = query.eq("status", options.status);
  if (options.actor) query = query.ilike("actor_email", `%${options.actor.trim()}%`);
  if (options.from) query = query.gte("created_at", options.from);
  // `to` is a date; include the whole day by moving to the next midnight.
  if (options.to) {
    const end = new Date(`${options.to}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    query = query.lt("created_at", end.toISOString());
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    entries: (data ?? []).map((e) => ({
      id: e.id,
      actorEmail: e.actor_email,
      action: e.action,
      resource: e.resource,
      status: e.status,
      detail: e.detail,
      ip: e.ip,
      createdAt: e.created_at,
    })),
    total: count ?? 0,
    page,
    pageSize: AUDIT_PAGE_SIZE,
  };
}

// ------------------------------------------------------------------ team
// Backs the Manager role: "access to assigned departments/functions" and
// "view team-related information and reports" from the brief.

export type TeamMember = AdminUser;

export type TeamActivity = {
  id: number;
  actorEmail: string | null;
  action: string;
  resource: string | null;
  status: string;
  createdAt: string;
};

/** Everyone in one department, with their roles. */
export async function listTeamMembers(department: string): Promise<TeamMember[]> {
  const { data, error } = await db()
    .from("users")
    .select(
      "id, email, full_name, department, is_active, last_login_at, created_at, " +
        "user_roles!user_roles_user_id_fkey ( roles ( id, name ) )"
    )
    .eq("department", department)
    .order("full_name");

  if (error) throw new Error(error.message);

  type Row = {
    id: string;
    email: string;
    full_name: string;
    department: string | null;
    is_active: boolean;
    last_login_at: string | null;
    created_at: string;
    user_roles: { roles: { id: string; name: string } | null }[];
  };

  return (data as unknown as Row[]).map((u) => ({
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    department: u.department,
    isActive: u.is_active,
    lastLoginAt: u.last_login_at,
    createdAt: u.created_at,
    roles: (u.user_roles ?? [])
      .map((ur) => ur.roles)
      .filter((r): r is { id: string; name: string } => Boolean(r)),
  }));
}

/** Recent activity for a set of users, for the team report. */
/**
 * Recent activity for one department.
 *
 * Filters through the audit_logs -> users foreign key rather than taking a list
 * of member ids, so this no longer has to wait for listTeamMembers() to return.
 * The two are the whole cost of the team page and can now run concurrently.
 *
 * The inner join also drops rows whose user was deleted (user_id is nulled by
 * the offboarding path), which is right for a department view: a removed
 * employee has no department to be scoped to.
 */
export async function teamActivityForDepartment(
  department: string
): Promise<TeamActivity[]> {
  const { data, error } = await db()
    .from("audit_logs")
    .select(
      "id, actor_email, action, resource, status, created_at, users!inner ( department )"
    )
    .eq("users.department", department)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(error.message);

  // The generated types do not describe embedded rows, so name the shape here.
  type Row = {
    id: number;
    actor_email: string | null;
    action: string;
    resource: string | null;
    status: string;
    created_at: string;
  };

  return ((data ?? []) as unknown as Row[]).map((e) => ({
    id: e.id,
    actorEmail: e.actor_email,
    action: e.action,
    resource: e.resource,
    status: e.status,
    createdAt: e.created_at,
  }));
}

