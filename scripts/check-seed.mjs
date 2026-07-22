import pg from "pg";
const client = new pg.Client({ connectionString: process.env.PGURL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (label, sql) => console.log(label, (await client.query(sql)).rows[0].count);
await q("groupes test restants:", "select count(*) from public.groups where name = 'TEST-CONFLIT'");
await q("formateurs:", "select count(*) from public.trainers");
await q("dispositifs:", "select count(*) from public.programs");
await q("fermetures calendrier:", "select count(*) from public.calendar_closures");
await client.end();
