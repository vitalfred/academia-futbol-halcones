const express = require('express');
const router = express.Router();
const pool = require('../db'); // Conexión a la base de datos
const path = require('path');
const fs = require('fs');

// Función para obtener el último día del mes de la fecha dada
function ultimoDiaDelMes(fecha) {
  const temp = new Date(fecha.getTime());
  // Movemos al siguiente mes
  temp.setMonth(temp.getMonth() + 1);
  // Fijamos el día en 1
  temp.setDate(1);
  // Restamos 1 día => último día del mes anterior
  temp.setDate(temp.getDate() - 1);
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
      SELECT cp.id, cp.archivo, cp.estado, cp.periodo, cp.fecha_subida, cp.fecha_vencimiento,
             ra.nombre_nino, ra.correo_electronico
      FROM comprobantes_pago cp
      INNER JOIN registro_alumno ra ON cp.alumno_id = ra.id
      ORDER BY cp.fecha_subida DESC
    `);

    const aprobados = comprobantes.rows.filter((comp) => comp.estado === 'aprobado');
    const pendientes = comprobantes.rows.filter((comp) => comp.estado === 'pendiente');
    const rechazados = comprobantes.rows.filter((comp) => comp.estado === 'rechazado');
    const vencidos = comprobantes.rows.filter((comp) => comp.estado === 'vencido');

    // Si existe un parámetro de error en la query, se envía a la vista
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

// Ruta para descargar un comprobante (modificada para redirigir en caso de ausencia del archivo)
router.get('/:id/descargar', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT archivo FROM comprobantes_pago WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.redirect('/admin/comprobantes?error=Comprobante no encontrado.');
    }

    const archivo = result.rows[0].archivo;
    const archivoPath = path.join(__dirname, '../uploads', archivo);

    if (!fs.existsSync(archivoPath)) {
      // Redirigimos con un mensaje de error si el archivo no existe
      return res.redirect('/admin/comprobantes?error=El archivo ya no se encuentra en el servidor.');
    }

    res.download(archivoPath, archivo);
  } catch (error) {
    console.error('Error al descargar el comprobante:', error);
    res.status(500).send('Error al descargar el comprobante.');
  }
});

// **Ruta para aprobar un comprobante** (con nueva lógica)
router.post('/:id/aprobar', async (req, res) => {
  try {
    const { id } = req.params;
    const { periodo } = req.body;

    const ahora = new Date();
    let fechaVencimiento = null;

    switch (periodo) {
      case 'un_minuto':
        // Suma 1 minuto
        fechaVencimiento = new Date(ahora.setMinutes(ahora.getMinutes() + 1));
        break;
      case 'mensual':
        // Si hoy es 15/01 => se vence 31/01
        fechaVencimiento = ultimoDiaDelMes(ahora);
        break;
      case 'bimestral':
        // Ejemplo simple: avanzar 1 mes y forzar fin de ese mes
        const unMesDespues = new Date(ahora.setMonth(ahora.getMonth() + 1));
        fechaVencimiento = ultimoDiaDelMes(unMesDespues);
        break;
      default:
        return res.status(400).send('Periodo inválido. Usa un_minuto, mensual o bimestral.');
    }

    // Obtenemos el comprobante actual para saber el alumno
    const actual = await pool.query('SELECT * FROM comprobantes_pago WHERE id = $1', [id]);
    if (actual.rowCount === 0) {
      return res.status(404).send('Comprobante no encontrado.');
    }

    const comprobante = actual.rows[0];
    const alumnoId = comprobante.alumno_id;

    // Antes de aprobar éste, borramos los comprobantes que estén en "rechazado" o "vencido" de ese alumno
    // para que no se queden "colgados".
    await pool.query(`
      DELETE FROM comprobantes_pago
      WHERE alumno_id = $1
        AND estado IN ('rechazado', 'vencido')
        AND id <> $2
    `, [alumnoId, id]);

    // Ahora aprobamos el comprobante actual
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

// Ruta para rechazar un comprobante
router.post('/:id/rechazar', async (req, res) => {
  try {
    const { id } = req.params;

    // Actualizamos el estado a "rechazado"
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

// Ruta para eliminar comprobantes
router.post('/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;

    // Obtener el archivo
    const result = await pool.query('SELECT archivo FROM comprobantes_pago WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).send('Comprobante no encontrado.');
    }

    const archivo = result.rows[0].archivo;
    const archivoPath = path.join(__dirname, '../uploads', archivo);

    // Eliminar el archivo físico
    if (fs.existsSync(archivoPath)) {
      fs.unlinkSync(archivoPath);
      console.log(`Archivo eliminado: ${archivoPath}`);
    } else {
      console.log(`Archivo no encontrado en el sistema: ${archivoPath}`);
    }

    // Eliminar el registro de la base
    await pool.query('DELETE FROM comprobantes_pago WHERE id = $1', [id]);

    res.redirect('/admin/comprobantes');
  } catch (error) {
    console.error('Error al eliminar el comprobante:', error);
    res.status(500).send('Error interno al eliminar comprobante.');
  }
});

module.exports = router;
