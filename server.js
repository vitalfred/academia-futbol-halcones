const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const pool = require('./db');
require('dotenv').config(); // Cargar variables de entorno

// Rutas
const userRoutes = require('./routes/userRoutes');
const expressRegistroAlumno = require('./routes/express_registro_alumno');
const detallesPdfRoutes = require('./routes/admin_detalles_pdf');
const comprobantesRoutes = require('./routes/comprobantes');
const adminRoutes = require('./routes/admin_routes');
const adminComprobantesRoutes = require('./routes/admin_comprobantes_routes');
const reportesRoutes = require('./routes/reportes_routes');

const app = express();
const PORT = process.env.PORT || 3000; // Usar el puerto de Railway

console.log("🔍 DATABASE_URL:", process.env.DATABASE_URL);

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error de conexión a PostgreSQL:', err);
    } else {
        console.log('✅ Conexión exitosa a PostgreSQL:', res.rows[0]);
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de sesiones
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mi_secreto_academia',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === 'production' }, // Secure solo en producción
  })
);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function verificarAutenticacion(req, res, next) {
  if (req.session && req.session.userId) next();
  else res.redirect('/users/login');
}

function verificarAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) next();
  else res.status(403).send('Acceso denegado. Necesitas permisos de administrador.');
}

// Archivos estáticos
app.use(express.static(path.join(__dirname, 'src')));
app.use(express.static(path.join(__dirname, 'public')));

// Rutas
app.use('/users', userRoutes);
app.use('/', expressRegistroAlumno);
app.use('/comprobantes', verificarAutenticacion, comprobantesRoutes);
app.use('/admin/detalles', detallesPdfRoutes);
app.use('/admin/comprobantes', adminComprobantesRoutes);
app.use('/admin/reportes', verificarAdmin, reportesRoutes);
app.use('/admin', adminRoutes);

// Ruta de inicio
app.get('/', (req, res) => {
  res.redirect('/users/login');
});

// Panel principal
app.get('/panel-principal/:userId', verificarAutenticacion, async (req, res) => {
  const { userId } = req.params;
  if (req.session.userId.toString() !== userId) {
    return res.status(403).send('Acceso no autorizado.');
  }
  try {
    const alumnos = await pool.query(
      'SELECT * FROM registro_alumno WHERE user_id = $1',
      [userId]
    );
    res.render('panel_principal', { userId, alumnos: alumnos.rows });
  } catch (error) {
    console.error('Error al cargar el panel principal:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

// Panel de administración
app.get('/admin-panel/:adminId', verificarAdmin, async (req, res) => {
  const { adminId } = req.params;
  try {
    const users = await pool.query('SELECT * FROM users');
    const alumnos = await pool.query('SELECT * FROM registro_alumno');
    res.render('admin_panel', { adminId, users: users.rows, alumnos: alumnos.rows });
  } catch (error) {
    console.error('Error al cargar el panel de administración:', error);
    res.status(500).send('Error interno del servidor.');
  }
});

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────
//   CRON: Marcar como vencido si fecha_vencimiento < NOW()
// ─────────────────────────────────────────────────────────
cron.schedule('1 0 * * *', async () => {
  try {
    console.log('Revisando comprobantes vencidos...');
    const result = await pool.query(`
      UPDATE comprobantes_pago
      SET estado = 'vencido'
      WHERE estado = 'aprobado'
        AND fecha_vencimiento < NOW()
    `);

    if (result.rowCount > 0) {
      console.log(`Se actualizaron ${result.rowCount} comprobantes a vencido.`);
    } else {
      console.log('No hay comprobantes para actualizar a vencido.');
    }
  } catch (error) {
    console.error('Error al actualizar comprobantes vencidos:', error);
  }
});
