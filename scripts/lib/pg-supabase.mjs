// Embedded Postgres (PGlite) set up like a Supabase project: anon / authenticated / service_role, auth.uid(), auth.jwt(),
// storage tables, then supabase-schema.sql. Used by the SQL and payment tests; nothing goes online.
import { PGlite } from "@electric-sql/pglite";
import fs from "fs";

const ROOT = new URL("../../", import.meta.url);

export async function createSupabaseDb(){
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text, created_at timestamptz default now());
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (id serial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  `);
  const schema = fs.readFileSync(new URL("supabase-schema.sql", ROOT), "utf8");
  await db.exec(schema);

  const j = v => JSON.stringify(v).replace(/'/g, "''");
  // Run fn as a signed-in user (uid), as anon (null), or with the service key ("service")
  const as = async (who, fn) => {
    const role = who === "service" ? "service_role" : who ? "authenticated" : "anon";
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who && who !== "service" ? who : ""}', false); set role ${role};`);
    try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
  };
  const put = async (table, id, data) => db.exec(`insert into public."${table}" (id, data) values ('${id}', '${j(data)}') on conflict (id) do update set data = excluded.data`);
  const row = async (table, id) => { const r = (await db.query(`select data from public."${table}" where id = $1`, [id])).rows[0]; return r ? r.data : null; };
  const rows = async (table) => (await db.query(`select id, data from public."${table}" order by id`)).rows.map(r => Object.assign({ id: r.id }, r.data));
  // Call a database function by name with named arguments, like PostgREST's /rpc/name
  const rpc = async (name, args = {}) => {
    const keys = Object.keys(args);
    const sql = `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const vals = keys.map(k => args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]);
    return (await db.query(sql, vals)).rows[0].r;
  };
  return { db, as, put, row, rows, rpc, schema };
}
