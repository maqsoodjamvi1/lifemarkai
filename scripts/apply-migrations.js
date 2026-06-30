const { readFileSync } = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS = [
  'supabase/migrations/068_editor_intelligence_lenses.sql',
  'supabase/migrations/069_domain_registrations.sql',
  'supabase/migrations/070_seed_initial_data.sql',
  'supabase/migrations/071_seed_starter_templates.sql'
];

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  // try reading .env.local
  try {
    const env = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    const m = env.split('\n').map(l=>l.trim()).filter(Boolean).reduce((acc,line)=>{
      if (line.startsWith('#')) return acc;
      const [k,...rest]=line.split('=');
      acc[k]=rest.join('=');
      return acc;
    },{});
    return m[name];
  } catch(e){
    return undefined;
  }
}

(async function(){
  // Allow providing a full Postgres connection string via DATABASE_URL env var.
  const databaseUrl = process.env.DATABASE_URL || getEnv('DATABASE_URL');
  let client;
  if (databaseUrl) {
    // Use the provided connection string directly
    client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  } else {
    const url = getEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (or provide DATABASE_URL)');
      process.exit(1);
    }
    // accept urls with or without trailing slash
    const hostMatch = url.match(/^https?:\/\/([^/]+)(?:\/|$)/);
    if (!hostMatch) { console.error('Invalid NEXT_PUBLIC_SUPABASE_URL'); process.exit(1); }
    const host = hostMatch[1];
    client = new Client({
      host,
      port: 5432,
      user: 'postgres',
      password: serviceKey,
      database: 'postgres',
      ssl: { rejectUnauthorized: false }
    });
  }

  try {
    await client.connect();
    console.log('Connected to Postgres at', host);
    for (const m of MIGRATIONS) {
      const sql = readFileSync(path.join(__dirname, '..', m), 'utf8');
      console.log('\n---- Applying', m, '----');
      await client.query(sql);
      console.log('Applied', m);
    }
    console.log('\nAll migrations applied successfully.');
  } catch (err) {
    console.error('Error applying migrations:', err);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
})();
