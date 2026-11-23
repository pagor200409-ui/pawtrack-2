require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    })
  : null;

function getIndexHtml() {
  return fs.readFileSync(path.join(__dirname, 'HTML', 'index.html'), 'utf8');
}

app.get('/', (req, res) => {
  try {
    res.type('html').send(getIndexHtml());
  } catch (err) {
    console.error('Error leyendo HTML/index.html:', err);
    res.status(500).send('Error cargando la interfaz');
  }
});

// LOGIN
app.post('/api/login', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const correo = (req.body.correo || '').trim();
    const password = req.body.contrasena ?? req.body.contraseña ?? '';

    if (!correo || !password) {
      return res.status(400).json({ success: false, message: 'Ingresa correo y contraseña' });
    }

    const result = await pool.query(
      'SELECT "identificación" AS id, nombre, correo, contrasena FROM usuarios WHERE correo = $1 LIMIT 1',
      [correo]
    );

    const user = result.rows[0];
    if (!user || user.contrasena !== password) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
    }

    return res.json({
      success: true,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        correo: user.correo
      }
    });
  } catch (err) {
    console.error('Error en /api/login:', err);
    return res.status(500).json({ success: false, message: 'Error de conexión con la base de datos' });
  }
});

// REGISTRO
app.post('/api/registro', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const nombre = (req.body.nombre || '').trim();
    const correo = (req.body.correo || '').trim();
    const password = req.body.contrasena ?? req.body.contraseña ?? '';

    if (!nombre || !correo || !password) {
      return res.status(400).json({ success: false, message: 'Completa todos los campos' });
    }

    const existing = await pool.query(
      'SELECT "identificación" AS id FROM usuarios WHERE correo = $1 LIMIT 1',
      [correo]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado' });
    }

    const inserted = await pool.query(
      'INSERT INTO usuarios (nombre, correo, contrasena) VALUES ($1, $2, $3) RETURNING "identificación" AS id, nombre, correo',
      [nombre, correo, password]
    );

    return res.status(201).json({ success: true, usuario: inserted.rows[0] });
  } catch (err) {
    console.error('Error en /api/registro:', err);
    return res.status(500).json({ success: false, message: 'Error al registrar usuario' });
  }
});

// PERROS POR USUARIO
app.get('/api/perros/:usuarioId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const usuarioId = Number(req.params.usuarioId);
    const result = await pool.query(
      'SELECT "identificación" AS id, usuario_id, nombre, raza, edad, peso, fecha_registro FROM perros WHERE usuario_id = $1 ORDER BY "identificación" ASC',
      [usuarioId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/perros/:usuarioId:', err);
    return res.status(500).json({ error: 'Error al obtener mascotas' });
  }
});

// REGISTRAR PERRO
app.post('/api/perros', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ success: false, message: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const { usuario_id, nombre, raza, edad, peso } = req.body;
    const result = await pool.query(
      'INSERT INTO perros (usuario_id, nombre, raza, edad, peso) VALUES ($1, $2, $3, $4, $5) RETURNING "identificación" AS id, usuario_id, nombre, raza, edad, peso',
      [
        Number(usuario_id),
        nombre,
        raza,
        edad ? Number(edad) : null,
        peso ? Number(peso) : null
      ]
    );
    return res.status(201).json({ success: true, perro: result.rows[0] });
  } catch (err) {
    console.error('Error en /api/perros:', err);
    return res.status(500).json({ success: false, message: 'Error al registrar perro' });
  }
});

// DISPOSITIVO VINCULADO A PERRO
app.get('/api/dispositivo/:perroId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const perroId = Number(req.params.perroId);
    const result = await pool.query(
      'SELECT "identificación" AS id, código, perro_id, "batería" AS bateria FROM dispositivos WHERE perro_id = $1 LIMIT 1',
      [perroId]
    );
    return res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error en /api/dispositivo/:perroId:', err);
    return res.status(500).json({ error: 'Error al consultar dispositivo' });
  }
});

// HISTORIAL DE MEDICIONES (tabla "medir")
app.get('/api/historial-mediciones/:dispositivoId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const dispositivoId = Number(req.params.dispositivoId);
    const result = await pool.query(
      'SELECT "identificación" AS id, dispositivo_id, temperatura, pulso, actividad, fecha_hora FROM medir WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 20',
      [dispositivoId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/historial-mediciones/:dispositivoId:', err);
    return res.status(500).json({ error: 'Error al consultar mediciones' });
  }
});

// ÚLTIMA UBICACIÓN
app.get('/api/ubicacion/:dispositivoId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const dispositivoId = Number(req.params.dispositivoId);
    const result = await pool.query(
      'SELECT "identificación" AS id, dispositivo_id, latitud, longitud, fecha_hora FROM ubicaciones WHERE dispositivo_id = $1 ORDER BY fecha_hora DESC LIMIT 1',
      [dispositivoId]
    );
    return res.json(result.rows[0] || {});
  } catch (err) {
    console.error('Error en /api/ubicacion/:dispositivoId:', err);
    return res.status(500).json({ error: 'Error al consultar ubicación' });
  }
});

// ALERTAS DEL PERRO
app.get('/api/alertas/:perroId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: 'Falta DATABASE_URL en el servidor' });
  }
  try {
    const perroId = Number(req.params.perroId);
    const result = await pool.query(
      'SELECT "identificación" AS id, perro_id, tipo, "descripción" AS descripcion, fecha_hora, atendida FROM alertas WHERE perro_id = $1 ORDER BY "identificación" DESC',
      [perroId]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('Error en /api/alertas/:perroId:', err);
    return res.status(500).json({ error: 'Error al consultar alertas' });
  }
});

app.get('*', (req, res) => {
  try {
    res.type('html').send(getIndexHtml());
  } catch (err) {
    console.error('Error leyendo HTML/index.html:', err);
    res.status(500).send('Error cargando la interfaz');
  }
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
  });
}

module.exports = app;
