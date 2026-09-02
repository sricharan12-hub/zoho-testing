/**
 * Hand-maintained mirror of supabase/schema.sql. Keeping this in sync is what
 * lets the Supabase client return typed rows instead of `never`.
 */
type Timestamp = string;

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  department: string | null;
  is_active: boolean;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
};

export type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: Timestamp;
};

export type PermissionRow = {
  id: string;
  key: string;
  description: string;
  zoho_app: string | null;
};

export type UserRoleRow = {
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  assigned_at: Timestamp;
};

export type RolePermissionRow = {
  role_id: string;
  permission_id: string;
};

export type SessionRow = {
  id: string;
  jti: string;
  user_id: string;
  issued_at: Timestamp;
  expires_at: Timestamp;
  last_seen_at: Timestamp;
  revoked_at: Timestamp | null;
  ip: string | null;
  user_agent: string | null;
};

export type AuditLogRow = {
  id: number;
  user_id: string | null;
  actor_email: string | null;
  action: string;
  resource: string | null;
  status: string;
  detail: Record<string, unknown>;
  ip: string | null;
  user_agent: string | null;
  created_at: Timestamp;
};

export type Database = {
  public: {
    Tables: {
      users: Table<
        UserRow,
        Omit<UserRow, "id" | "created_at" | "updated_at" | "last_login_at" | "is_active"> &
          Partial<Pick<UserRow, "id" | "is_active" | "last_login_at">>
      >;
      roles: Table<
        RoleRow,
        Omit<RoleRow, "id" | "created_at"> & Partial<Pick<RoleRow, "id">>
      >;
      permissions: Table<
        PermissionRow,
        Omit<PermissionRow, "id"> & Partial<Pick<PermissionRow, "id">>
      >;
      user_roles: Table<
        UserRoleRow,
        Omit<UserRoleRow, "assigned_at" | "assigned_by"> &
          Partial<Pick<UserRoleRow, "assigned_by">>
      >;
      role_permissions: Table<RolePermissionRow, RolePermissionRow>;
      sessions: Table<
        SessionRow,
        Omit<SessionRow, "id" | "issued_at" | "last_seen_at" | "revoked_at"> &
          Partial<Pick<SessionRow, "id" | "revoked_at">>
      >;
      audit_logs: Table<
        AuditLogRow,
        Omit<AuditLogRow, "id" | "created_at" | "status" | "detail"> &
          Partial<Pick<AuditLogRow, "status" | "detail">>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
