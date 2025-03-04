const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const fs = require('fs');
const path = require('path');
const https = require('https');
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
const PORT = process.env.PORT || 3000; // HTTP
const HTTPS_PORT = process.env.HTTPS_PORT || 3443; // HTTPS

console.log("🔍 DATABASE_URL:", process.env.DATABASE_URL);

// Intentar conexión a PostgreSQL antes de iniciar el servidor
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa a PostgreSQL:', res.rows[0]);
  } catch (err) {
    console.error('❌ Error de conexión a PostgreSQL:', err);
    process.exit(1); // Salir si la base de datos no está disponible
  }
})();

// Configuración de confianza en proxy (necesario en Railway)
app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de sesiones con PostgreSQL
app.use(
  session({
    store: new pgSession({
      pool: pool, // Usar PostgreSQL para almacenar sesiones
      tableName: 'session', // Nombre de la tabla en la BD
      createTableIfMissing: true // Creará la tabla si no existe
    }),
    secret: process.env.SESSION_SECRET || 'mi_secreto_academia',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production', // Solo en producción
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 // 1 día de duración
    }
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

// HTTPS con certificados locales (en producción, Railway maneja esto automáticamente)
if (fs.existsSync('./certs/server.key') && fs.existsSync('./certs/server.cert')) {
  const httpsOptions = {
    key: fs.readFileSync('./certs/server.key'),
    cert: fs.readFileSync('./certs/server.cert'),
  };

  https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
    console.log(`🔒 Servidor HTTPS corriendo en https://localhost:${HTTPS_PORT}`);
  });
}

// Iniciar servidor HTTP
app.listen(PORT, () => {
  console.log(`🚀 Servidor HTTP corriendo en http://localhost:${PORT}`);
});

// ─────────────────────────────────────────────────────────
//   CRON: Marcar como vencido si fecha_vencimiento < NOW()
// ─────────────────────────────────────────────────────────
cron.schedule('1 0 * * *', async () => {
  try {
    console.log('🔄 Ejecutando cron job para actualizar comprobantes vencidos...');
    
    const result = await pool.query(`
      UPDATE comprobantes_pago
      SET estado = 'vencido'
      WHERE estado IN ('aprobado', 'validado')
        AND fecha_vencimiento < NOW()
    `);

    console.log(`✅ Se actualizaron ${result.rowCount} comprobantes a vencido.`);
  } catch (error) {
    console.error('❌ Error al actualizar comprobantes vencidos:', error);
  }
});

// ─────────────────────────────────────────────────────────
//   CRON: Eliminar comprobantes del mes anterior después de 5 días
// ─────────────────────────────────────────────────────────
cron.schedule('5 0 6 * *', async () => { 
  try {
    console.log('🗑 Eliminando comprobantes vencidos del mes anterior...');

    const result = await pool.query(`
      DELETE FROM comprobantes_pago
      WHERE estado = 'vencido' AND fecha_subida < date_trunc('month', CURRENT_DATE)
    `);

    console.log(`✅ Eliminados ${result.rowCount} comprobantes vencidos.`);
  } catch (error) {
    console.error('❌ Error al eliminar comprobantes vencidos:', error);
  }
});
