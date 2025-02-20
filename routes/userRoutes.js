const express = require('express');
const router = express.Router();
const pool = require('../db'); // Importar la conexión a la base de datos desde db.js
const bcrypt = require('bcrypt'); // Importamos bcrypt para encriptar contraseñas
// Ruta para renderizar el formulario de inicio de sesión
router.get('/login', (req, res) => {
  res.render('login'); // Renderiza el archivo views/login.ejs
});
router.get('/cambio-contrasena', (req, res) => {
  res.render('cambio_contraseña'); // Renderiza la nueva vista
});
// Ruta de inicio de sesión (método POST)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Buscar el usuario en la base de datos
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Correo electrónico o contraseña incorrectos' });
    }

    const user = userResult.rows[0];

    // Comparar la contraseña ingresada con la contraseña encriptada almacenada
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Correo electrónico o contraseña incorrectos' });
    }

    // Almacenar el ID del usuario y rol en la sesión
    req.session.userId = user.user_id;
    req.session.isAdmin = user.is_admin;

    // Redirigir según el rol del usuario
    
    if (user.is_admin) {
      res.status(200).json({
        message: 'Inicio de sesión correcto',
        redirectUrl: `/admin-panel/${user.user_id}` // Cambia a la ruta del admin_panel
      });
    
} else {
  res.status(200).json({
    message: 'Inicio de sesión correcto',
    redirectUrl: `/panel-principal/${user.user_id}`
  });
}
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    res.status(500).json({ message: 'Error al iniciar sesión. Inténtelo de nuevo más tarde.' });
  }
});

// Ruta para registrar un nuevo usuario (POST)
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  // Validar que el correo pertenezca a un dominio conocido
  const emailRegex = /^[a-zA-Z0-9._%+-]+@(gmail\.com|outlook\.com|hotmail\.com)$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'El correo debe ser un correo válido de Gmail, Outlook, o Hotmail.' });
  }

  // Validar que la contraseña cumpla con los requisitos de seguridad
  const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9!@#$%^&*]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ message: 'La contraseña debe contener al menos una letra mayúscula, un número o signo, y tener un mínimo de 8 caracteres.' });
  }

  try {
    // Comprobar si el usuario ya existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'El correo ya está registrado.' });
    }

    // Encriptar la contraseña antes de guardar en la base de datos
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insertar un nuevo usuario en la base de datos
    const newUser = await pool.query(
      'INSERT INTO users (email, password, role) VALUES ($1, $2, $3) RETURNING *',
      [email, hashedPassword, 'parent/tutor']
    );

    // Enviar respuesta con mensaje de éxito
    res.status(201).json({ message: 'Usuario registrado exitosamente', redirectUrl: '/users/login' });
  } catch (error) {
    console.error('Error al registrar el usuario:', error);
    res.status(500).json({ message: `Error al registrar el usuario. Detalles: ${error.message}` });
  }
});

// Ruta de prueba para verificar la conexión a la base de datos (GET)
router.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.status(200).json({ message: 'Conexión exitosa a la base de datos', time: result.rows[0].now });
  } catch (error) {
    console.error('Error al conectar con la base de datos:', error);
    res.status(500).send('Error al conectar con la base de datos');
  }
});

// Ruta para cerrar sesión (GET)
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error al cerrar sesión. Inténtelo de nuevo más tarde.' });
    }
    res.redirect('/users/login');
  });
});

module.exports = router;
