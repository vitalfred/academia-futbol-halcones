// const express = require('express');
// const router = express.Router();
// const pool = require('../db');
// const bcrypt = require('bcryptjs');

// // Ruta temporal para crear el usuario admin
// router.get('/crear-admin/:secret', async (req, res) => {
//   // Utiliza un secret para proteger esta ruta
//   if (req.params.secret !== 'MI_SUPER_SECRETO') {
//     return res.status(403).send('Acceso prohibido');
//   }

//   try {
//     const email = 'admin@ejemplo.com';
//     const plainPassword = 'admin123';
//     const saltRounds = 10;

//     const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

//     const query = `
//       INSERT INTO users (email, password, is_admin)
//       VALUES ($1, $2, $3)
//       RETURNING *
//     `;
//     const values = [email, hashedPassword, true];

//     const result = await pool.query(query, values);

//     res.send(`Usuario admin creado: ${JSON.stringify(result.rows[0])}`);
//   } catch (error) {
//     console.error('Error al crear admin:', error);
//     res.status(500).send('Error al crear admin');
//   }
// });

// module.exports = router;
