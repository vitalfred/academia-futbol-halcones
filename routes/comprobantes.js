const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const pool = require('../db');

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `comprobante_${req.params.id}_${Date.now()}${extension}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF, JPG o PNG.'));
    }
  },
});

// **Ruta para subir un comprobante**
router.post('/:id/subir', upload.single('comprobante'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).send('No se subió ningún archivo.');
    }

    // Opcional: Si quieres que cuando suba un nuevo comprobante,
    // el anterior (si estaba "aprobado") se vuelva "vencido", puedes conservar:
    // await pool.query(
    //   'UPDATE comprobantes_pago SET estado = $1 WHERE alumno_id = $2 AND estado = $3',
    //   ['vencido', id, 'aprobado']
    // );

    // Insertar el nuevo comprobante con estado "pendiente"
    await pool.query(
      'INSERT INTO comprobantes_pago (alumno_id, archivo, estado, fecha_subida) VALUES ($1, $2, $3, NOW())',
      [id, req.file.filename, 'pendiente']
    );

    res.redirect(`/alumno/${id}`);
  } catch (error) {
    console.error('Error al subir el comprobante:', error.message);
    res.status(500).send('Ocurrió un error al subir el comprobante.');
  }
});

// **Ruta para validar/rechazar un comprobante** (solo si todavía la usas)
router.post('/comprobante/:id/validar', async (req, res) => {
  try {
    const { id } = req.params;
    const { estado, periodo } = req.body;

    if (!['validado', 'rechazado'].includes(estado)) {
      return res.status(400).send('Estado inválido.');
    }

    if (estado === 'rechazado') {
      // Cambiar el estado a rechazado
      await pool.query(
        'UPDATE comprobantes_pago SET estado = $1 WHERE id = $2',
        ['rechazado', id]
      );
      return res.redirect('back'); // Redirige a la página actual
    }

    let fechaVencimiento = null;
    const ahora = new Date();

    // Lógica de periodos (antigua) - Puedes reemplazar con la nueva si gustas
    if (estado === 'validado') {
      switch (periodo) {
        case 'dia':
          fechaVencimiento = new Date(ahora.setDate(ahora.getDate() + 1));
          break;
        case 'mes':
          fechaVencimiento = new Date(ahora.setMonth(ahora.getMonth() + 1));
          break;
        case 'dos_meses':
          fechaVencimiento = new Date(ahora.setMonth(ahora.getMonth() + 2));
          break;
        case 'un_minuto':
          fechaVencimiento = new Date(ahora.setMinutes(ahora.getMinutes() + 1));
          break;
        default:
          fechaVencimiento = null;
      }

      await pool.query(
        'UPDATE comprobantes_pago SET estado = $1, periodo = $2, fecha_vencimiento = $3 WHERE id = $4',
        ['validado', periodo, fechaVencimiento, id]
      );

      res.redirect('back');
    }
  } catch (error) {
    console.error('Error al validar/rechazar comprobante:', error.message);
    res.status(500).send('Error interno al validar/rechazar el comprobante.');
  }
});

// **Ruta para obtener el último comprobante de un alumno**
router.get('/alumno/:id/comprobantes', async (req, res) => {
  try {
    const { id } = req.params;

    const comprobantes = await pool.query(
      'SELECT * FROM comprobantes_pago WHERE alumno_id = $1 ORDER BY fecha_subida DESC LIMIT 1',
      [id]
    );

    if (comprobantes.rows.length === 0) {
      return res.status(404).send('No se encontró ningún comprobante.');
    }

    res.json(comprobantes.rows[0]);
  } catch (error) {
    console.error('Error al obtener el comprobante:', error.message);
    res.status(500).send('Error al obtener el comprobante.');
  }
});

module.exports = router;
