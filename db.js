const { Pool } = require('pg');
require('dotenv').config();

console.log(" Conectando a PostgreSQL en:", process.env.DATABASE_URL);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("railway") ? { rejectUnauthorized: false } : false
});

module.exports = pool;
