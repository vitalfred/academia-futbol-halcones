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
 *   - Imagen (si existe)
 *
 * Ajustado para usar la imagen desde la base de datos (archivo_data).
 * No se agrega .addPage() aquí, se maneja afuera para 1 alumno por página.
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

  // Imagen desde base de datos
  if (row.archivo_data) {
    try {
      const imgBuffer = Buffer.from(row.archivo_data, 'binary');
      doc.image(imgBuffer, { fit: [400, 500], align: 'left' });
      doc.moveDown(2);
    } catch (err) {
      doc.fillColor('red').text('Error al mostrar la imagen del comprobante.', { lineGap: 5 });
      doc.fillColor('#000');
      doc.moveDown(1);
    }
  } else {
    doc.fillColor('red').text('No se adjuntó comprobante.', { lineGap: 5 });
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
      return res.render('reportes', {
        adminId: req.session.userId,
        errorMessage: 'La fecha final no puede ser mayor a la fecha actual.'
      });
    }

    // -----------------------------------------
    // Reporte de Comprobantes Validados -> PDF
    // -----------------------------------------
    if (tipo_reporte === 'comprobantes-validados') {
      if (!fecha_inicio || !fecha_fin) {
        return res.render('reportes', {
          adminId: req.session.userId,
          errorMessage: 'Se requieren fechas de inicio y fin para generar el reporte.'
        });
      }

      const query = `
        SELECT
          ra.matricula,
          ra.nombre_nino AS nombre,
          cp.fecha_subida AS fecha_validacion,
          cp.nombre_archivo,
          cp.archivo_data
        FROM registro_alumno ra
        INNER JOIN comprobantes_pago cp
          ON ra.id = cp.alumno_id
        WHERE cp.estado = 'aprobado'
          AND cp.fecha_subida::date BETWEEN $1 AND $2
        ORDER BY ra.matricula;
      `;
      const datos = await pool.query(query, [fecha_inicio, fecha_fin]);

      if (datos.rows.length === 0) {
        return res.render('reportes', {
          adminId: req.session.userId,
          errorMessage: 'No se encontraron comprobantes validados en el rango de fechas.'
        });
      }

      const fileName = `Comprobantes_Validados_${Date.now()}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(res);

      doc.fontSize(18).text('Reporte de Comprobantes Validados', { align: 'center' });
      doc.moveDown(2);

      datos.rows.forEach((row, index) => {
        printAlumno(doc, row);
        if (index < datos.rows.length - 1) {
          doc.addPage();
        }
      });

      doc.end();

    // -----------------------------------------
    // Reportes Excel
    // -----------------------------------------
    } else {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Reporte');
      worksheet.getRow(1).font = { bold: true };

      let queryResult;

      switch (tipo_reporte) {

        case 'general-alumnos':
  worksheet.columns = [
    { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
    { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
    { header: 'Matrícula', key: 'matricula', width: 15 },
    { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
    { header: 'Estado de Inscripción', key: 'estado_inscripcion', width: 20 },
  ];

  queryResult = await pool.query(`
    SELECT 
      ra.curso_interes,
      ra.categoria_horario,
      ra.matricula,
      ra.nombre_nino AS nombre,
      COALESCE(
        CASE 
          WHEN cp.estado = 'aprobado' THEN 'Inscrito'
          WHEN cp.estado = 'vencido' THEN 'No Inscrito'
          WHEN cp.estado = 'rechazado' THEN 'Rechazado'
          ELSE 'Pendiente'
        END, 
        'Pendiente'
      ) AS estado_inscripcion
    FROM registro_alumno ra
    LEFT JOIN (
      SELECT DISTINCT ON (alumno_id) alumno_id, estado
      FROM comprobantes_pago
      ORDER BY alumno_id, fecha_subida DESC
    ) cp ON ra.id = cp.alumno_id
    ORDER BY 
      CASE 
        WHEN cp.estado = 'aprobado' THEN 1 
        WHEN cp.estado = 'vencido' THEN 2
        WHEN cp.estado = 'rechazado' THEN 3
        ELSE 4 
      END,
      ra.curso_interes, 
      ra.categoria_horario;
  `);

  queryResult.rows.forEach((row, index) => {
    const newRow = worksheet.addRow({
      curso_interes: row.curso_interes,
      categoria_horario: row.categoria_horario,
      matricula: row.matricula || 'Sin matrícula',
      nombre: row.nombre,
      estado_inscripcion: row.estado_inscripcion,
    });

    // Aplicar color de fondo a la celda de "Estado de Inscripción"
    const estadoCell = newRow.getCell(5); // 5ta columna (Estado de Inscripción)

    switch (row.estado_inscripcion) {
      case 'Inscrito':
        estadoCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: '00FF00' }, // Verde
        };
        break;
      case 'No Inscrito':
        estadoCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF0000' }, // Rojo
        };
        break;
      case 'Rechazado':
        estadoCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFF00' }, // Amarillo
        };
        break;
      default:
        // No aplica color para 'Pendiente'
        break;
    }
  });

  break;

  case 'hermanos-inscritos':
  worksheet.columns = [
    { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
    { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
    { header: 'Matrícula', key: 'matricula', width: 15 },
    { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
    { header: 'Nombre del Hermano', key: 'nombre_hermano', width: 30 },
  ];

  queryResult = await pool.query(`
    SELECT 
      curso_interes,
      categoria_horario,
      matricula,
      nombre_nino AS nombre,
      nombre_hermano -- En lugar de hacer un JOIN, se toma directamente de la tabla
    FROM registro_alumno
    WHERE hermano_inscrito IS TRUE
    ORDER BY curso_interes, categoria_horario;
  `);

  queryResult.rows.forEach(row => {
    worksheet.addRow({
      curso_interes: row.curso_interes,
      categoria_horario: row.categoria_horario,
      matricula: row.matricula || 'Sin matrícula',
      nombre: row.nombre,
      nombre_hermano: row.nombre_hermano || 'No especificado', // Si no tiene, mostrar "No especificado"
    });
  });

  break;

  case 'alergias':
    worksheet.columns = [
      { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
      { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
      { header: 'Matrícula', key: 'matricula', width: 15 },
      { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
      { header: 'Detalle de Alergias', key: 'detalle_alergias', width: 50 },
    ];
  
    queryResult = await pool.query(`
      SELECT 
        curso_interes,
        categoria_horario,
        matricula,
        nombre_nino AS nombre,
        detalle_alergias
      FROM registro_alumno
      WHERE alergias IS TRUE -- Solo alumnos con alergias registradas
      ORDER BY curso_interes, categoria_horario;
    `);
  
    queryResult.rows.forEach(row => {
      worksheet.addRow({
        curso_interes: row.curso_interes,
        categoria_horario: row.categoria_horario,
        matricula: row.matricula || 'Sin matrícula',
        nombre: row.nombre,
        detalle_alergias: row.detalle_alergias || 'No especificado', // Si es NULL, poner "No especificado"
      });
    });
  
    break;
    case 'alergico-medicamentos':
      worksheet.columns = [
        { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
        { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
        { header: 'Matrícula', key: 'matricula', width: 15 },
        { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
        { header: 'Alérgico a Medicamento', key: 'alergico_medicamento', width: 50 },
      ];
    
      queryResult = await pool.query(`
        SELECT 
          curso_interes,
          categoria_horario,
          matricula,
          nombre_nino AS nombre,
          detalle_medicamento AS alergico_medicamento
        FROM registro_alumno
        WHERE alergico_medicamento IS TRUE -- Solo alumnos alérgicos a medicamentos
        ORDER BY curso_interes, categoria_horario;
      `);
    
      queryResult.rows.forEach(row => {
        worksheet.addRow({
          curso_interes: row.curso_interes,
          categoria_horario: row.categoria_horario,
          matricula: row.matricula || 'Sin matrícula',
          nombre: row.nombre,
          alergico_medicamento: row.alergico_medicamento || 'No especificado', // Si es NULL, poner "No especificado"
        });
      });
    
      break;
    
      case 'enterado-academia':
        worksheet.columns = [
          { header: 'Curso de Interés', key: 'curso_interes', width: 25 },
          { header: 'Categoría Horario', key: 'categoria_horario', width: 20 },
          { header: 'Matrícula', key: 'matricula', width: 15 },
          { header: 'Nombre del Alumno', key: 'nombre', width: 30 },
          { header: '¿Cómo se enteró?', key: 'enterado', width: 50 },
        ];
      
        queryResult = await pool.query(`
          SELECT 
            curso_interes,
            categoria_horario,
            matricula,
            nombre_nino AS nombre,
            COALESCE(enterado, otra_fuente, 'No especificado') AS enterado
          FROM registro_alumno
          ORDER BY curso_interes, categoria_horario;
        `);
      
        queryResult.rows.forEach(row => {
          worksheet.addRow({
            curso_interes: row.curso_interes,
            categoria_horario: row.categoria_horario,
            matricula: row.matricula || 'Sin matrícula',
            nombre: row.nombre,
            enterado: row.enterado,
          });
        });
      
        break;
      
        // -------------------------------------
        // Usuarios Vencidos
        // -------------------------------------
        case 'usuarios-vencidos':
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
            cp.fecha_vencimiento::date AS fecha_vencimiento
          FROM registro_alumno ra
          INNER JOIN comprobantes_pago cp 
            ON ra.id = cp.alumno_id
          WHERE cp.estado = 'vencido'
          ORDER BY cp.fecha_vencimiento DESC;

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

          
        // -------------------------------------
        // Usuarios Aprobados
        // -------------------------------------
        case 'usuarios-aprobados':
          // Definimos las columnas que queremos en el Excel (sin 'Correo')
          worksheet.columns = [
            { header: 'Matrícula',        key: 'matricula',          width: 15 },
            { header: 'Nombre del Alumno',key: 'alumno',             width: 30 },
            { header: 'Estado',           key: 'estado',             width: 15 },
            { header: 'Periodo',          key: 'periodo',            width: 15 },
            { header: 'Vencimiento',      key: 'fecha_vencimiento',  width: 20 },
          ];
        
          // Consulta para traer usuarios aprobados
          // Ajusta a tus columnas reales para periodo y fecha_vencimiento
          const queryAprobados = `
            SELECT
              ra.matricula,
              ra.nombre_nino AS alumno,
              cp.estado,
              cp.periodo,
              TO_CHAR(cp.fecha_vencimiento, 'DD/MM/YYYY') AS fecha_vencimiento
            FROM registro_alumno ra
            INNER JOIN comprobantes_pago cp 
              ON ra.id = cp.alumno_id
            WHERE cp.estado = 'aprobado'
            ORDER BY cp.fecha_subida DESC
          `;
        
          queryResult = await pool.query(queryAprobados);
        
          // Llenar el Excel con los datos
          queryResult.rows.forEach(row => {
            worksheet.addRow({
              matricula:         row.matricula,
              alumno:            row.alumno,
              estado:            row.estado,
              periodo:           row.periodo,
              fecha_vencimiento: row.fecha_vencimiento,
            });
          });
          break;

        // -------------------------------------
        // Usuarios Rechazados
        // -------------------------------------
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
              TO_CHAR(cp.fecha_subida, 'YYYY-MM-DD') AS fecha_rechazo,
              cp.fecha_subida -- Se agrega para que ORDER BY funcione
            FROM registro_alumno ra
            INNER JOIN comprobantes_pago cp 
              ON ra.id = cp.alumno_id
            WHERE cp.estado = 'rechazado'
            ORDER BY cp.fecha_subida DESC;
          `);
        
          queryResult.rows.forEach(row => {
            if (row.nombre) {
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
          return res.render('reportes', {
            adminId: req.session.userId,
            errorMessage: 'Tipo de reporte no válido.'
          });
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
    return res.render('reportes', {
      adminId: req.session.userId,
      errorMessage: 'Error al generar el reporte.'
    });
  }
});

module.exports = router;
