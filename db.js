const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',          // Reemplaza con tu usuario de PostgreSQL
  host: 'localhost',
  database: 'academia_futbol_halcones',
  password: '291095',   // Reemplaza con tu contraseña de PostgreSQL
  port: 5432,
});

module.exports = pool;
