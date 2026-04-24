const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_K1GyJAWLo2Ob@ep-icy-term-am0wfqqn-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const c = await pool.query(`
    SELECT contract_address, creator_address, creator_email, title, created_at
    FROM campaigns ORDER BY created_at DESC LIMIT 5
  `);
  console.log('Latest 5 campaigns:');
  c.rows.forEach(row => console.log(JSON.stringify(row)));
  pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });
