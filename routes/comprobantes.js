const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db');

// **Límite de tamaño en bytes (2MB)**
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// Configuración de multer para almacenar archivos en memoria
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE }, // **Límite de 2MB**
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes en formato JPG o PNG.'));
    }
  },
});

// **Ruta para subir un comprobante con manejo de errores sin recargar la página**
router.post('/:id/subir', (req, res, next) => {
  upload.single('comprobante')(req, res, (err) => {
    if (err) {
      let errorMessage = 'Error inesperado al subir el archivo.';
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        errorMessage = 'El archivo es demasiado grande. Límite: 2MB.';
      } else if (err.message === 'Solo se permiten imágenes en formato JPG o PNG.') {
        errorMessage = err.message;
      }

      return res.send(`
        <script>
          alert("${errorMessage}");
          window.history.back();
        </script>
      `);
    }
    next();
  });
}, async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.send(`
        <script>
          alert("No se subió ningún archivo.");
          window.history.back();
        </script>
      `);
    }

    // Insertar el archivo en la base de datos
    await pool.query(
      'INSERT INTO comprobantes_pago (alumno_id, nombre_archivo, archivo_data, estado, fecha_subida) VALUES ($1, $2, $3, $4, NOW())',
      [id, req.file.originalname, req.file.buffer, 'pendiente']
    );

    res.send(`
      <script>
        alert("Comprobante subido correctamente.");
        window.location.href = "/alumno/${id}";
      </script>
    `);
  } catch (error) {
    console.error('Error al subir el comprobante:', error.message);
    res.send(`
      <script>
        alert("Ocurrió un error al subir el comprobante.");
        window.history.back();
      </script>
    `);
  }
});



// **Ruta para descargar un comprobante desde la BD**
router.get('/:id/descargar', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT nombre_archivo, archivo_data FROM comprobantes_pago WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Comprobante no encontrado.');
    }

    const { nombre_archivo, archivo_data } = result.rows[0];

    if (!archivo_data) {
      return res.status(404).send('No hay datos almacenados para este comprobante.');
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

// **Ruta para eliminar un comprobante**
router.post('/:id/eliminar', async (req, res) => {
  try {
    const { id } = req.params;

    // Eliminar el registro de la base de datos
    await pool.query('DELETE FROM comprobantes_pago WHERE id = $1', [id]);

    res.redirect('/admin/comprobantes');
  } catch (error) {
    console.error('Error al eliminar el comprobante:', error);
    res.status(500).send('Error interno al eliminar comprobante.');
  }
});

// **Ruta para validar/rechazar un comprobante**
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
