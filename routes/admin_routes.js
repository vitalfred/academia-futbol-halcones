const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db'); // Conexión a la base de datos
const router = express.Router();
const fs = require('fs');
// Middleware para verificar si el usuario es administrador
function verificarAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  res.status(403).send('Acceso no autorizado. Necesitas permisos de administrador.');
}

// Ruta para listar usuarios
router.get('/usuarios', verificarAdmin, async (req, res) => {
  try {
    // Consulta para obtener los usuarios ordenados por ID
    const users = await pool.query('SELECT user_id, email, is_admin FROM users ORDER BY user_id ASC');
    const adminId = req.session.userId; // Obtiene el ID del administrador desde la sesión
    res.render('admin_usuarios', { users: users.rows, adminId }); // Renderiza la vista con los usuarios
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).send('Error al listar usuarios.');
  }
});

// Ruta para crear un nuevo usuario
router.post('/usuarios/nuevo', verificarAdmin, async (req, res) => {
  const { email, password, is_admin } = req.body;
  try {
    // Encripta la contraseña antes de guardarla
    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (email, password, is_admin) VALUES ($1, $2, $3)',
      [email, hashedPassword, is_admin === 'true']
    );
    res.redirect('/admin/usuarios'); // Redirige a la página de usuarios
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).send('Error al crear usuario. Inténtalo de nuevo más tarde.');
  }
});

// Ruta para actualizar el rol de un usuario
router.post('/usuarios/:id/editar', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  const { is_admin } = req.body;
  try {
    await pool.query('UPDATE users SET is_admin = $1 WHERE user_id = $2', [
      is_admin === 'true',
      id,
    ]);
    res.redirect('/admin/usuarios');
  } catch (error) {
    console.error('Error al editar usuario:', error);
    res.status(500).send('Error al editar usuario. Inténtalo de nuevo más tarde.');
  }
});

// Ruta para eliminar un usuario
router.post('/usuarios/:id/eliminar', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE user_id = $1', [id]);
    res.redirect('/admin/usuarios');
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).send('Error al eliminar usuario. Inténtalo de nuevo más tarde.');
  }
});

// Ruta para cambiar la contraseña de un usuario
router.post('/usuarios/:id/cambiar-contrasena', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;
  try {
    if (!new_password || new_password.length < 8) {
      return res.status(400).send('La nueva contraseña debe tener al menos 8 caracteres.');
    }
    // Encripta la nueva contraseña
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE user_id = $2', [hashedPassword, id]);
    res.redirect('/admin/usuarios'); // Redirige a la página de usuarios
  } catch (error) {
    console.error('Error al cambiar la contraseña:', error);
    res.status(500).send('Error al cambiar la contraseña. Inténtalo de nuevo más tarde.');
  }
});

// Ruta para listar alumnos
router.get('/alumnos', verificarAdmin, async (req, res) => {
  try {
    const alumnos = await pool.query(`
      SELECT 
        id, 
        nombre_nino, 
        edad, 
        nombre_tutor, 
        correo_electronico, 
        telefono_contacto 
      FROM registro_alumno
    `);
    res.render('admin_alumno', { alumnos: alumnos.rows });
  } catch (error) {
    console.error('Error al obtener los alumnos:', error);
    res.status(500).send('Error al listar alumnos.');
  }
});

// Ruta para eliminar un alumno
router.delete('/alumnos/:id/eliminar', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM registro_alumno WHERE id = $1', [id]);
    res.status(200).send('Alumno eliminado exitosamente.');
  } catch (error) {
    console.error('Error al eliminar alumno:', error);
    res.status(500).send('Error al eliminar alumno.');
  }
});
// Ruta para regresar al panel administrador 
router.get('/panel', verificarAdmin, (req, res) => {
  const adminId = req.session.userId; // Obtén el ID del administrador desde la sesión
  res.render('admin_panel', { adminId });
});

// Ruta para mostrar los detalles de un alumno
router.get('/alumnos/:id', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM registro_alumno WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Alumno no encontrado.');
    }
    const userId = req.session.userId; // Obtener userId de la sesión
    res.render('admin_detalle_alumno', { alumno: result.rows[0], userId }); // Renderizar admin_detalle_alumno.ejs
  } catch (error) {
    console.error('Error al obtener los detalles del alumno:', error);
    res.status(500).send('Error al obtener los detalles del alumno.');
  }
});

// Ruta para editar los detalles de un alumno
router.post('/alumnos/:id/editar', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    curso_interes,
    categoria_horario,
    nombre_nino,
    edad,
    fecha_nacimiento,
    sexo,
    talla_camiseta,
    estatura,
    peso,
    centro_educativo,
    seguro_medico,
    nombre_seguro,
    nombre_tutor,
    telefono_contacto,
    correo_electronico,
    direccion,
    alergias,
    detalle_alergias,
    alergico_medicamento,
    detalle_medicamento,
    actividad_fisica,
    detalle_deporte,
    practico_futbol,
    equipos_participados,
    posicion_campo,
    habilidades,
    enterado,
    otra_fuente,
    hermano_inscrito,
    nombre_hermano,
    expectativas,
    matricula // Captura correctamente la matrícula
  } = req.body;

  try {
    await pool.query(
      `UPDATE registro_alumno SET
        curso_interes = $1,
        categoria_horario = $2,
        nombre_nino = $3,
        edad = $4,
        fecha_nacimiento = $5,
        sexo = $6,
        talla_camiseta = $7,
        estatura = $8,
        peso = $9,
        centro_educativo = $10,
        seguro_medico = $11,
        nombre_seguro = $12,
        nombre_tutor = $13,
        telefono_contacto = $14,
        correo_electronico = $15,
        direccion = $16,
        alergias = $17,
        detalle_alergias = $18,
        alergico_medicamento = $19,
        detalle_medicamento = $20,
        actividad_fisica = $21,
        detalle_deporte = $22,
        practico_futbol = $23,
        equipos_participados = $24,
        posicion_campo = $25,
        habilidades = $26,
        enterado = $27,
        otra_fuente = $28,
        hermano_inscrito = $29,
        nombre_hermano = $30,
        expectativas = $31,
        matricula = $32
      WHERE id = $33`,
      [
        curso_interes,
        categoria_horario,
        nombre_nino,
        edad,
        fecha_nacimiento,
        sexo,
        talla_camiseta,
        estatura,
        peso,
        centro_educativo,
        seguro_medico === 'true',
        nombre_seguro,
        nombre_tutor,
        telefono_contacto,
        correo_electronico,
        direccion,
        alergias === 'true',
        detalle_alergias,
        alergico_medicamento === 'true',
        detalle_medicamento,
        actividad_fisica === 'true',
        detalle_deporte,
        practico_futbol === 'true',
        equipos_participados,
        posicion_campo,
        habilidades ? JSON.parse(habilidades) : [],
        enterado,
        otra_fuente,
        hermano_inscrito === 'true',
        nombre_hermano,
        expectativas,
        matricula, // Nuevo campo
        id
      ]
    );
    res.redirect(`/admin/alumnos/${id}`);
  } catch (error) {
    console.error('Error al editar los detalles del alumno:', error);
    res.status(500).send('Error al editar los detalles del alumno.');
  }
});

// Ruta para descargar el acta de nacimiento
router.get('/alumnos/:id/descargar-acta', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT acta_nacimiento FROM registro_alumno WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].acta_nacimiento) {
      return res.status(404).send('Acta de nacimiento no encontrada.');
    }
    const actaNacimiento = result.rows[0].acta_nacimiento;

    res.setHeader('Content-Disposition', 'attachment; filename="acta_nacimiento.pdf"');
    res.setHeader('Content-Type', 'application/pdf'); // Cambia según el tipo MIME
    res.send(actaNacimiento);
  } catch (error) {
    console.error('Error al descargar el acta de nacimiento:', error);
    res.status(500).send('Error al descargar el acta de nacimiento.');
  }
});

// Ruta para descargar el certificado médico
router.get('/alumnos/:id/descargar-certificado', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT certificado_medico FROM registro_alumno WHERE id = $1', [id]);
    if (result.rows.length === 0 || !result.rows[0].certificado_medico) {
      return res.status(404).send('Certificado médico no encontrado.');
    }
    const certificadoMedico = result.rows[0].certificado_medico;

    res.setHeader('Content-Disposition', 'attachment; filename="certificado_medico.pdf"');
    res.setHeader('Content-Type', 'application/pdf'); // Cambia según el tipo MIME
    res.send(certificadoMedico);
  } catch (error) {
    console.error('Error al descargar el certificado médico:', error);
    res.status(500).send('Error al descargar el certificado médico.');
  }
});

module.exports = router;

