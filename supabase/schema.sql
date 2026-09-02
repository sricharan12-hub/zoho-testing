-- Employee Portal — schema
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- Tables map directly to the six named in the assignment brief — Users, Roles,
-- Permissions, UserRoles, RolePermissions, AuditLogs — plus `sessions`, which
-- is what makes logout and admin revocation terminate access immediately
-- rather than whenever the JWT happens to expire.
--
-- Every table has RLS enabled and NO policies: PostgREST's anon/authenticated
-- roles can therefore touch nothing. All access goes through the server using
-- the service role key, which bypasses RLS by design.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- users
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  full_name     text not null,
  department    text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Sign-in matches email case-insensitively, so uniqueness must be
-- case-insensitive too. Without this, "A@x.com" and "a@x.com" are two rows
-- and the login lookup matches both.
create unique index if not exists users_email_lower_idx
  on public.users (lower(email));

-- ---------------------------------------------------------------- roles
create table if not exists public.roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  -- system roles cannot be renamed or deleted from the admin UI
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------- permissions
create table if not exists public.permissions (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  description text not null,
  -- set for permissions that unlock a Zoho application tile
  zoho_app    text
);

-- ----------------------------------------------------------- user_roles
create table if not exists public.user_roles (
  user_id     uuid not null references public.users (id) on delete cascade,
  role_id     uuid not null references public.roles (id) on delete cascade,
  -- who granted this role, for "monitor user activity and access"
  assigned_by uuid references public.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- The primary key indexes (user_id, role_id); this covers lookups the other
-- way round, such as "who still holds the role I am about to delete".
create index if not exists user_roles_role_idx on public.user_roles (role_id);

-- ----------------------------------------------------- role_permissions
create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

-- --------------------------------------------------------------- sessions
create table if not exists public.sessions (
  id           uuid primary key default gen_random_uuid(),
  jti          text not null unique,
  user_id      uuid not null references public.users (id) on delete cascade,
  issued_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  -- refreshed on each authenticated request, drives the idle timeout
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz,
  ip           text,
  user_agent   text
);
create index if not exists sessions_user_idx on public.sessions (user_id);
create index if not exists sessions_jti_idx  on public.sessions (jti);

-- ------------------------------------------------------------- audit_logs
create table if not exists public.audit_logs (
  id          bigserial primary key,
  -- kept even if the user is later deleted, so the trail survives offboarding
  user_id     uuid references public.users (id) on delete set null,
  actor_email text,
  action      text not null,
  resource    text,
  status      text not null default 'success'
    check (status in ('success', 'failure', 'denied')),
  detail      jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_user_idx    on public.audit_logs (user_id);
create index if not exists audit_action_idx  on public.audit_logs (action);
create index if not exists audit_actor_idx   on public.audit_logs (lower(actor_email));

-- ------------------------------------------------------------------ RLS
alter table public.users            enable row level security;
alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.user_roles       enable row level security;
alter table public.role_permissions enable row level security;
alter table public.sessions         enable row level security;
alter table public.audit_logs       enable row level security;

-- --------------------------------------------------- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists users_touch_updated_at on public.users;
create trigger users_touch_updated_at
  before update on public.users
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------ audit log is append-only
-- Enforced in the database rather than by convention, so the trail cannot be
-- rewritten even by the service role or from the SQL editor by accident.
create or replace function public.audit_logs_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op;
end $$;

drop trigger if exists audit_logs_no_change on public.audit_logs;
create trigger audit_logs_no_change
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_append_only();
