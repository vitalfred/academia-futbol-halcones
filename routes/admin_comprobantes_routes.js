const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexión a la base de datos

// Función para obtener el último día del mes en curso
function ultimoDiaDelMes(fecha) {
  const temp = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0); // Último día del mes en curso
  return temp;
}

// Ruta para mostrar la página de gestión de comprobantes
router.get('/', async (req, res) => {
  try {
    if (!req.session || !req.session.isAdmin) {
      return res.status(403).send('Acceso no autorizado.');
    }

    // Obtener todos los comprobantes
    const comprobantes = await pool.query(`
      SELECT cp.id, cp.nombre_archivo, cp.estado, cp.periodo, cp.fecha_subida, cp.fecha_vencimiento,
             ra.nombre_nino, ra.correo_electronico
      FROM comprobantes_pago cp
      INNER JOIN registro_alumno ra ON cp.alumno_id = ra.id
      ORDER BY cp.fecha_subida DESC
    `);

    const aprobados = comprobantes.rows.filter((comp) => comp.estado === 'aprobado');
    const pendientes = comprobantes.rows.filter((comp) => comp.estado === 'pendiente');
    const rechazados = comprobantes.rows.filter((comp) => comp.estado === 'rechazado');
    const vencidos = comprobantes.rows.filter((comp) => comp.estado === 'vencido');

    const error = req.query.error;

    res.render('admin_comprobantes', {
      aprobados,
      pendientes,
      rechazados,
      vencidos,
      adminId: req.session.userId,
      error
    });
  } catch (error) {
    console.error('Error al cargar los comprobantes:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

// **Ruta para aprobar un comprobante (Vence el último día del mes en curso)**
router.post('/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { periodo } = req.body;

    const ahora = new Date();
    let fechaVencimiento = ultimoDiaDelMes(ahora); // Se establece como el último día del mes en curso

    const actual = await pool.query('SELECT * FROM comprobantes_pago WHERE id = $1', [id]);
    if (actual.rowCount === 0) {
      return res.status(404).send('Comprobante no encontrado.');
    }

    const comprobante = actual.rows[0];
    const alumnoId = comprobante.alumno_id;

    // Eliminar comprobantes rechazados o vencidos del mismo alumno antes de aprobar el nuevo
    await pool.query(`
      DELETE FROM comprobantes_pago
      WHERE alumno_id = $1
        AND estado IN ('rechazado', 'vencido')
        AND id <> $2
    `, [alumnoId, id]);

    // Aprobar el comprobante y asignar la fecha de vencimiento correcta
    await pool.query(`
      UPDATE comprobantes_pago
      SET estado = 'aprobado',
          periodo = $1,
          fecha_vencimiento = $2
      WHERE id = $3
    `, [periodo, fechaVencimiento, id]);

    res.redirect('/admin/comprobantes');
  } catch (error) {
    console.error('Error al aprobar el comprobante:', error);
    res.status(500).send('Error interno al aprobar el comprobante.');
  }
});

// **Ruta para descargar un comprobante desde la BD**
router.get('/:id/descargar', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT nombre_archivo, archivo_data FROM comprobantes_pago WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.redirect('/admin/comprobantes?error=Comprobante no encontrado.');
    }

    const { nombre_archivo, archivo_data } = result.rows[0];

    if (!archivo_data) {
      return res.redirect('/admin/comprobantes?error=El archivo no se encuentra en la base de datos.');
    }

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${nombre_archivo}"`,
      'Content-Length': archivo_data.length
    });

    res.send(archivo_data);
  } catch (error) {
    console.error('Error al descargar el comprobante:', error);
    res.status(500).send('Error al descargar el comprobante.');
  }
});

// **Ruta para rechazar un comprobante**
router.post('/:id/rechazar', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(`
      UPDATE comprobantes_pago
      SET estado = 'rechazado', periodo = NULL, fecha_vencimiento = NULL
      WHERE id = $1
    `, [id]);

    res.redirect('/admin/comprobantes');
  } catch (error) {
    console.error('Error al rechazar el comprobante:', error);
    res.status(500).send('Error al rechazar el comprobante.');
  }
});

// **Ruta para eliminar un comprobante**
router.post('/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT nombre_archivo FROM comprobantes_pago WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Comprobante no encontrado.');
    }

    await pool.query('DELETE FROM comprobantes_pago WHERE id = $1', [id]);

    res.redirect('/admin/comprobantes');
  } catch (error) {
    console.error('Error al eliminar el comprobante:', error);
    res.status(500).send('Error interno al eliminar comprobante.');
  }
});

module.exports = router;
