-- Extensions et utilitaires communs
create extension if not exists btree_gist;  -- EXCLUDE (uuid WITH =, range WITH &&)
create extension if not exists pg_trgm;     -- recherche floue

create schema if not exists private;

-- Trigger générique updated_at
-- Helpers JWT (claims injectés par le custom access token hook, cf. migration RLS)
create or replace function private.jwt_org_id()
returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'org_id', '')::uuid;
$$;

create or replace function private.jwt_role()
returns text
language sql stable
as $$
  select auth.jwt() ->> 'app_role';
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
