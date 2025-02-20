const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta la ruta si tu db.js está en otra ubicación
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Ruta para mostrar la página de reportes
router.get('/', (req, res) => {
  try {
    if (!req.session || !req.session.isAdmin) {
      return res.status(403).send('Acceso no autorizado.');
    }
    res.render('reportes', { adminId: req.session.userId });
  } catch (error) {
    console.error('Error al cargar la página de reportes:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

/**
 * Imprime un alumno en el PDF:
 *   - Matrícula
 *   - Nombre
 *   - Fecha de Validación
 *   - Imagen (si existe y es de un formato soportado)
 * No se agrega .addPage() aquí, ya que se maneja fuera para forzar 1 alumno por página.
 */
function printAlumno(doc, row) {
  doc.fontSize(12).fillColor('#000');

  // Matrícula
  const matriculaValue = row.matricula ? row.matricula : 'N/A';
  doc.text(`Matrícula: ${matriculaValue}`, { lineGap: 5 });

  // Nombre
  const nombreValue = row.nombre ? row.nombre : 'Sin nombre';
  doc.text(`Nombre: ${nombreValue}`, { lineGap: 5 });

  // Fecha de Validación
  const fecha = row.fecha_validacion
    ? new Date(row.fecha_validacion).toLocaleDateString()
    : 'N/A';
  doc.text(`Fecha de Validación: ${fecha}`, { lineGap: 5 });

  doc.moveDown(1);

  // Imagen
  if (row.archivo) {
    const comprobantePath = path.join(__dirname, '../uploads', row.archivo);
    if (fs.existsSync(comprobantePath)) {
      // Verificar que la extensión sea soportada (solo se aceptan JPG/JPEG y PNG)
      const ext = path.extname(comprobantePath).toLowerCase();
      if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
        doc.image(comprobantePath, {
          fit: [400, 500],
          align: 'left',
        });
        doc.moveDown(2);
      } else {
        // Si el formato no es compatible, mostramos un mensaje en el PDF
        doc.fillColor('red').text('Archivo adjunto no es una imagen soportada.');
        doc.fillColor('#000');
        doc.moveDown(1);
      }
    } else {
      doc.fillColor('red').text('Comprobante no disponible.');
      doc.fillColor('#000');
      doc.moveDown(1);
    }
  } else {
    doc.fillColor('red').text('No se adjuntó comprobante.');
    doc.fillColor('#000');
    doc.moveDown(2);
  }
}


// Ruta única para generar cualquiera de los reportes
router.post('/generar', async (req, res) => {
  try {
    const { tipo_reporte, fecha_inicio, fecha_fin } = req.body;

    if (!req.session || !req.session.isAdmin) {
      return res.status(403).send('Acceso no autorizado.');
    }

    // Validación en el servidor: la fecha final no puede ser mayor a la fecha actual
    const today = new Date().toISOString().split('T')[0];
    if (fecha_fin > today) {
      return res.render('reportes', { adminId: req.session.userId, errorMessage: 'La fecha final no puede ser mayor a la fecha actual.' });
    }

    // -----------------------------------------
    // Reporte de Comprobantes Validados -> PDF
    // -----------------------------------------
    if (tipo_reporte === 'comprobantes-validados') {
      if (!fecha_inicio || !fecha_fin) {
        return res.render('reportes', { adminId: req.session.userId, errorMessage: 'Se requieren fechas de inicio y fin para generar el reporte.' });
      }

      // Se compara únicamente la parte de la fecha (sin la hora)
      const query = `
        SELECT
          ra.matricula,
          ra.nombre_nino AS nombre,
          cp.fecha_subida AS fecha_validacion,
          cp.archivo
        FROM registro_alumno ra
        INNER JOIN comprobantes_pago cp
          ON ra.id = cp.alumno_id
        WHERE cp.estado = 'aprobado'
          AND cp.fecha_subida::date BETWEEN $1 AND $2
        ORDER BY ra.matricula;
      `;
      const datos = await pool.query(query, [fecha_inicio, fecha_fin]);

      if (datos.rows.length === 0) {
        return res.render('reportes', { adminId: req.session.userId, errorMessage: 'No se encontraron comprobantes validados en el rango de fechas.' });
      }

      // Preparar cabeceras para descarga del PDF
      const fileName = `Comprobantes_Validados_${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      // Crear el PDF con PDFKit
      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      // Título
      doc.fontSize(18).text('Reporte de Comprobantes Validados', { align: 'center' });
      doc.moveDown(2);

      // Imprime 1 alumno por página
      datos.rows.forEach((row, index) => {
        printAlumno(doc, row);
        if (index < datos.rows.length - 1) {
          doc.addPage();
        }
      });

      doc.end();

    // -----------------------------------------
    // Otros reportes -> Excel
    // -----------------------------------------
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reporte');
      let queryResult;

      // Columnas base (se sobrescriben en algunos reportes)
      worksheet.columns = [
        { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
        { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
        { header: 'Matrícula', key: 'matricula', width: 15 },
        { header: 'User ID', key: 'user_id', width: 15 },
        { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
        { header: 'Detalles', key: 'detalles', width: 50 },
      ];
      worksheet.getRow(1).font = { bold: true };

      switch (tipo_reporte) {

        case 'general-alumnos':
          queryResult = await pool.query(`
            SELECT
              curso_interes,
              categoria_horario,
              matricula,
              user_id,
              nombre_nino AS nombre,
              'General Info' AS detalles
            FROM registro_alumno
            WHERE fecha_registro BETWEEN $1 AND $2
            ORDER BY curso_interes, categoria_horario
          `, [fecha_inicio, fecha_fin]);
          break;

        case 'hermanos-inscritos':
          queryResult = await pool.query(`
            SELECT
              curso_interes,
              categoria_horario,
              matricula,
              user_id,
              nombre_nino AS nombre,
              nombre_hermano AS detalles
            FROM registro_alumno
            WHERE hermano_inscrito = TRUE
              AND fecha_registro BETWEEN $1 AND $2
            ORDER BY curso_interes, categoria_horario
          `, [fecha_inicio, fecha_fin]);
          break;

        case 'alergias':
          queryResult = await pool.query(`
            SELECT
              curso_interes,
              categoria_horario,
              matricula,
              user_id,
              nombre_nino AS nombre,
              detalle_alergias AS detalles
            FROM registro_alumno
            WHERE alergias = TRUE
              AND fecha_registro BETWEEN $1 AND $2
            ORDER BY curso_interes, categoria_horario
          `, [fecha_inicio, fecha_fin]);
          break;

        case 'alergico-medicamentos':
          queryResult = await pool.query(`
            SELECT
              curso_interes,
              categoria_horario,
              matricula,
              user_id,
              nombre_nino AS nombre,
              detalle_medicamento AS detalles
            FROM registro_alumno
            WHERE alergico_medicamento = TRUE
              AND fecha_registro BETWEEN $1 AND $2
            ORDER BY curso_interes, categoria_horario
          `, [fecha_inicio, fecha_fin]);
          break;

        case 'enterado-academia':
          queryResult = await pool.query(`
            SELECT
              curso_interes,
              categoria_horario,
              matricula,
              user_id,
              nombre_nino AS nombre,
              enterado AS detalles
            FROM registro_alumno
            WHERE fecha_registro BETWEEN $1 AND $2
            ORDER BY curso_interes, categoria_horario
          `, [fecha_inicio, fecha_fin]);
          break;

        case 'usuarios-vencidos':
          // Definir columnas específicas para este reporte
          worksheet.columns = [
            { header: 'Matrícula', key: 'matricula', width: 15 },
            { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
            { header: 'Detalles', key: 'detalles', width: 50 },
            { header: 'Fecha de Vencimiento', key: 'fecha_vencimiento', width: 20 },
          ];
          queryResult = await pool.query(`
            SELECT 
              ra.matricula, 
              ra.nombre_nino AS nombre, 
              'Vencido' AS detalles, 
              TO_CHAR(MAX(cp.fecha_vencimiento), 'YYYY-MM-DD') AS fecha_vencimiento
            FROM registro_alumno ra
            INNER JOIN comprobantes_pago cp 
              ON ra.id = cp.alumno_id
            WHERE cp.estado = 'vencido'
            GROUP BY ra.matricula, ra.nombre_nino
            ORDER BY MAX(cp.fecha_vencimiento) DESC;
          `);
          queryResult.rows.forEach(row => {
            worksheet.addRow({
              matricula: row.matricula,
              nombre: row.nombre,
              detalles: row.detalles,
              fecha_vencimiento: row.fecha_vencimiento,
            });
          });
          break;

        case 'usuarios-aprobados':
          worksheet.columns = [
            { header: 'Matrícula', key: 'matricula', width: 15 },
            { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
            { header: 'Detalles', key: 'detalles', width: 50 },
            { header: 'Fecha de Aprobación', key: 'fecha_aprobacion', width: 20 },
          ];
          queryResult = await pool.query(`
            SELECT 
              ra.matricula, 
              ra.nombre_nino AS nombre, 
              'Aprobado' AS detalles, 
              TO_CHAR(MAX(cp.fecha_subida), 'YYYY-MM-DD') AS fecha_aprobacion
            FROM registro_alumno ra
            INNER JOIN comprobantes_pago cp 
              ON ra.id = cp.alumno_id
            WHERE cp.estado = 'aprobado'
            GROUP BY ra.matricula, ra.nombre_nino
            ORDER BY MAX(cp.fecha_subida) DESC;
          `);
          queryResult.rows.forEach(row => {
            if (row.matricula && row.nombre) {
              worksheet.addRow({
                matricula: row.matricula,
                nombre: row.nombre,
                detalles: row.detalles,
                fecha_aprobacion: row.fecha_aprobacion,
              });
            }
          });
          break;

        case 'usuarios-rechazados':
          worksheet.columns = [
            { header: 'Matrícula', key: 'matricula', width: 15 },
            { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
            { header: 'Detalles', key: 'detalles', width: 50 },
            { header: 'Fecha de Rechazo', key: 'fecha_rechazo', width: 20 },
          ];
          queryResult = await pool.query(`
            SELECT DISTINCT
              ra.matricula, 
              ra.nombre_nino AS nombre, 
              'Rechazado' AS detalles, 
              TO_CHAR(cp.fecha_subida, 'YYYY-MM-DD') AS fecha_rechazo
            FROM registro_alumno ra
            INNER JOIN comprobantes_pago cp 
              ON ra.id = cp.alumno_id
            WHERE cp.estado = 'rechazado'
            ORDER BY cp.fecha_subida DESC;
          `);
          queryResult.rows.forEach(row => {
            if (row.matricula && row.nombre) {
              worksheet.addRow({
                matricula: row.matricula,
                nombre: row.nombre,
                detalles: row.detalles,
                fecha_rechazo: row.fecha_rechazo,
              });
            }
          });
          break;

        default:
          return res.render('reportes', { adminId: req.session.userId, errorMessage: 'Tipo de reporte no válido.' });
      }

      // Forzar la descarga del archivo Excel
      const fileName = `Reporte_${tipo_reporte}_${Date.now()}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      await workbook.xlsx.write(res);
      return res.end();
    }
  } catch (error) {
    console.error('Error al generar el reporte:', error);
    return res.render('reportes', { adminId: req.session.userId, errorMessage: 'Error al generar el reporte.' });
  }
});

module.exports = router;
