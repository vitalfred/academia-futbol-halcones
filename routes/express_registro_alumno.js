const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');
const path = require('path');
const fs = require('fs');

router.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
  }
}));

// Configuración de multer para el manejo de archivos
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });



// Funciones auxiliares para normalizar datos
const capitalizeWords = (text) =>
  text
    ? text
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    : null;

const capitalizeFirstLetter = (text) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : null;

// Ruta para renderizar el formulario de registro de alumnos (GET)
router.get('/registro-alumno', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/users/login');
  }
  res.render('registro_alumno', {
    userId: req.session.userId,
  });
});

// Ruta para el panel de administración
router.get('/admin-panel/:id', async (req, res) => {
  const { id } = req.params;

  if (!req.session.isAdmin) {
    return res.status(403).send('Acceso no autorizado.');
  }

  try {
    const users = await pool.query('SELECT user_id, email FROM users WHERE is_admin = FALSE');
    const alumnos = await pool.query('SELECT * FROM registro_alumno');

    res.render('admin_panel', {
      adminId: id,
      users: users.rows,
      alumnos: alumnos.rows,
    });
  } catch (error) {
    console.error('Error al cargar el panel de administración:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

// Ruta para registrar un alumno (POST)
router.post(
  '/registro-alumno',
  upload.fields([
    { name: 'acta-nacimiento', maxCount: 1 },
    { name: 'certificado-medico', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!req.session || !req.session.userId) {
        return res.status(401).json({ message: 'Usuario no autenticado' });
      }

      const userId = req.session.userId;

      let {
        'curso-interes': cursoInteres,
        'categoria-horario': categoriaHorario,
        'nombre-nino': nombreNino,
        edad,
        'fecha-nacimiento': fechaNacimiento,
        sexo,
        'talla-camiseta': tallaCamiseta,
        estatura,
        peso,
        'centro-educativo': centroEducativo,
        'seguro-medico': seguroMedico,
        'nombre-seguro': nombreSeguro,
        'nombre-tutor': nombreTutor,
        'telefono-contacto': telefonoContacto,
        'correo-electronico': correoElectronico,
        direccion,
        alergias,
        'detalle-alergias': detalleAlergias,
        'alergico-medicamento': alergicoMedicamento,
        'detalle-medicamento': detalleMedicamento,
        'actividad-fisica': actividadFisica,
        'detalle-deporte': detalleDeporte,
        'practico-futbol': practicoFutbol,
        'equipos-participados': equiposParticipados,
        'posicion-campo': posicionCampo,
        habilidades,
        enterado,
        'otra-fuente': otraFuente,
        'hermano-inscrito': hermanoInscrito,
        'nombre-hermano': nombreHermano,
        expectativas,
      } = req.body;

      sexo = capitalizeFirstLetter(sexo);
      tallaCamiseta = tallaCamiseta.toUpperCase();
      nombreNino = capitalizeWords(nombreNino);
      centroEducativo = capitalizeWords(centroEducativo);
      nombreSeguro = capitalizeWords(nombreSeguro);
      nombreTutor = capitalizeWords(nombreTutor);
      nombreHermano = capitalizeWords(nombreHermano);
      detalleAlergias = capitalizeFirstLetter(detalleAlergias);
      detalleMedicamento = capitalizeFirstLetter(detalleMedicamento);
      detalleDeporte = capitalizeFirstLetter(detalleDeporte);

      const actaNacimiento = req.files['acta-nacimiento']
        ? req.files['acta-nacimiento'][0].buffer
        : null;
      const certificadoMedico = req.files['certificado-medico']
        ? req.files['certificado-medico'][0].buffer
        : null;

      const nuevoAlumno = await pool.query(
        `INSERT INTO registro_alumno (
          user_id, 
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
          acta_nacimiento,
          certificado_medico,
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
          expectativas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34) RETURNING *`,
        [
          userId,
          cursoInteres,
          categoriaHorario,
          nombreNino,
          edad,
          fechaNacimiento,
          sexo,
          tallaCamiseta,
          estatura,
          peso,
          centroEducativo,
          seguroMedico === 'si',
          nombreSeguro || null,
          actaNacimiento,
          certificadoMedico,
          nombreTutor,
          telefonoContacto,
          correoElectronico,
          direccion,
          alergias === 'si',
          detalleAlergias || null,
          alergicoMedicamento === 'si',
          detalleMedicamento || null,
          actividadFisica === 'si',
          detalleDeporte || null,
          practicoFutbol === 'si',
          equiposParticipados || null,
          posicionCampo || null,
          habilidades || null,
          enterado,
          otraFuente || null,
          hermanoInscrito === 'si',
          nombreHermano || null,
          expectativas || null,
        ]
      );

      const alumnoId = nuevoAlumno.rows[0].id;

      res.redirect(`/panel-principal/${userId}`);
    } catch (error) {
      console.error('Error al registrar al alumno:', error);
      res.status(500).json({
        message: 'Error al registrar al alumno. Inténtelo de nuevo más tarde.',
      });
    }
  }
);

// Ruta para subir comprobante de pago
router.post('/alumno/:id/comprobante', upload.single('comprobante'), async (req, res) => {
  try {
    const { id } = req.params;
    const comprobante = req.file;

    if (!comprobante) {
      return res.status(400).send('Debe subir un comprobante.');
    }

    const comprobanteNombre = `${Date.now()}-${comprobante.originalname}`;
    const comprobantePath = path.join(__dirname, '../uploads', comprobanteNombre);

    fs.writeFileSync(comprobantePath, comprobante.buffer);

    await pool.query(
      'UPDATE registro_alumno SET comprobante_pago = $1, estado_comprobante = $2 WHERE id = $3',
      [comprobanteNombre, 'pendiente', id]
    );

    res.redirect(`/alumno/${id}`);
  } catch (error) {
    console.error('Error al subir el comprobante:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

// Ruta para eliminar un alumno (DELETE)
router.delete('/alumno/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.session || !req.session.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const result = await pool.query('DELETE FROM registro_alumno WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Alumno no encontrado' });
    }

    res.status(200).json({ message: 'Alumno eliminado exitosamente' });
  } catch (error) {
    console.error('Error al eliminar el alumno:', error);
    res.status(500).json({ message: 'Error al eliminar el alumno. Inténtelo de nuevo más tarde.' });
  }
});
// Ruta para obtener detalles del alumno (GET)
// Modificar esta ruta para asegurarse de que la matrícula esté disponible
router.get('/alumno/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.session || !req.session.userId) {
      return res.redirect('/users/login');
    }

    const alumnoResult = await pool.query('SELECT * FROM registro_alumno WHERE id = $1', [id]);
    if (alumnoResult.rows.length === 0) {
      return res.status(404).send('Alumno no encontrado.');
    }
    const alumno = alumnoResult.rows[0];

    const comprobanteResult = await pool.query(
      `SELECT *, (DATE_PART('day', fecha_vencimiento::timestamp - NOW()::timestamp)) AS dias_restantes
       FROM comprobantes_pago
       WHERE alumno_id = $1
       ORDER BY fecha_subida DESC
       LIMIT 1`,
      [id]
    );
    const comprobante = comprobanteResult.rows.length > 0 ? comprobanteResult.rows[0] : null;

    
    // Mapear estado "aprobado" como "validado" para consistencia
    if (comprobante && comprobante.estado === 'aprobado') {
      comprobante.estado = 'validado';
    }

    res.render('detalle_alumno', {
      alumno,
      comprobante,
      userId: req.session.userId,
    });
  } catch (error) {
    console.error('Error al obtener detalles del alumno:', error.message);
    res.status(500).send('Error interno del servidor.');
  }
});



module.exports = router;
