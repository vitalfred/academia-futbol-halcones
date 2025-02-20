const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path'); // Para manejar rutas de archivos
const pool = require('../db'); // Ajusta la ruta según tu estructura
const router = express.Router();
const fs = require('fs');
// Middleware para verificar si el usuario es administrador
function verificarAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }
  res.status(403).send('Acceso no autorizado. Necesitas permisos de administrador.');
}

// Ruta para descargar el PDF con los detalles completos del alumno
router.get('/alumnos/:id/descargar-detalles', verificarAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM registro_alumno WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Alumno no encontrado.');
    }

    const alumno = result.rows[0];
    const doc = new PDFDocument();

    res.setHeader('Content-Disposition', 'attachment; filename="detalles_alumno.pdf"');
    res.setHeader('Content-Type', 'application/pdf');

    doc.pipe(res);

    // Ruta del logo
    const logoPath = path.join(__dirname, '../src/assets/img/logo.png');
    if (fs.existsSync(logoPath)) {
      // Coloca el logo en la parte superior derecha
      doc.image(logoPath, doc.page.width - 200, 20, { fit: [180, 180] });
    } else {
      console.error('El archivo logo.png no existe en la ruta especificada:', logoPath);
    }

    // Título alineado a la izquierda
    doc.font('Helvetica-Bold')
      .fontSize(18) // Reducido dos niveles
      .text(`Detalles del Alumno (ID: ${alumno.id})`, 20, 50) // Posición fija (x: 20, y: 50)
      .moveDown(2);

    // **Detalles del alumno**
    const fields = [
      { label: 'Matrícula', value: alumno.matricula || 'N/A' }, 
      { label: 'Nombre', value: alumno.nombre_nino },
      { label: 'Edad', value: alumno.edad },
      { label: 'Curso de Interés', value: alumno.curso_interes },
      { label: 'Categoría Horario', value: alumno.categoria_horario },
      { label: 'Sexo', value: alumno.sexo },
      { label: 'Fecha de Nacimiento', value: alumno.fecha_nacimiento.toISOString().split('T')[0] },
      { label: 'Centro Educativo', value: alumno.centro_educativo },
      { label: 'Seguro Médico', value: alumno.seguro_medico ? 'Sí' : 'No' },
      { label: 'Nombre del Seguro', value: alumno.nombre_seguro || 'N/A' },
      { label: 'Nombre del Tutor', value: alumno.nombre_tutor },
      { label: 'Teléfono Contacto', value: alumno.telefono_contacto },
      { label: 'Correo Electrónico', value: alumno.correo_electronico },
      { label: 'Dirección', value: alumno.direccion || 'N/A' },
      { label: 'Alergias', value: alumno.alergias ? 'Sí' : 'No' },
      { label: 'Detalle Alergias', value: alumno.detalle_alergias || 'N/A' },
      { label: 'Alérgico Medicamento', value: alumno.alergico_medicamento ? 'Sí' : 'No' },
      { label: 'Detalle Medicamento', value: alumno.detalle_medicamento || 'N/A' },
      { label: 'Actividad Física', value: alumno.actividad_fisica ? 'Sí' : 'No' },
      { label: 'Detalle Deporte', value: alumno.detalle_deporte || 'N/A' },
      { label: 'Practicó Fútbol', value: alumno.practico_futbol ? 'Sí' : 'No' },
      { label: 'Equipos Participados', value: alumno.equipos_participados || 'N/A' },
      { label: 'Posición Campo', value: alumno.posicion_campo || 'N/A' },
      { label: 'Habilidades', value: alumno.habilidades ? JSON.stringify(alumno.habilidades) : 'N/A' },
      { label: 'Enterado', value: alumno.enterado || 'N/A' },
      { label: 'Otra Fuente', value: alumno.otra_fuente || 'N/A' },
      { label: 'Hermano Inscrito', value: alumno.hermano_inscrito ? 'Sí' : 'No' },
      { label: 'Nombre Hermano', value: alumno.nombre_hermano || 'N/A' },
      { label: 'Expectativas', value: alumno.expectativas || 'N/A' },
    ];

    // Iterar sobre los campos y aplicar estilos
    fields.forEach(field => {
      doc.font('Helvetica-Bold')
        .fontSize(14)
        .text(`${field.label}:`, { continued: true }) // Título en negritas
        .font('Helvetica')
        .fontSize(12)
        .text(` ${field.value}`); // Respuesta normal
      doc.moveDown(0.5);
    });

    doc.end();

  } catch (error) {
    console.error('Error al descargar detalles del alumno:', error);
    res.status(500).send('Error al descargar detalles del alumno.');
  }
});

module.exports = router;
