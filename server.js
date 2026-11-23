require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  '';

async function sbRequest(table, { method = 'GET', query = '', body = null } = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY en Vercel');
  }

  const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : ''
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const errMsg = (data && (data.message || data.error)) || `Error HTTP ${res.status}`;
    throw new Error(errMsg);
  }

  return data;
}

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
  try {
    const correo = (req.body.correo || '').trim();
    const password = req.body.contrasena ?? req.body.contraseña ?? '';

    if (!correo || !password) {
      return res.status(400).json({ success: false, message: 'Ingresa correo y contraseña' });
    }

    const rows = await sbRequest(
      'usuarios',
      {
        query: `select=${encodeURIComponent('identificación,nombre,correo,contrasena')}&correo=eq.${encodeURIComponent(correo)}&limit=1`
      }
    );

    const user = Array.isArray(rows) ? rows[0] : null;
    if (!user || user.contrasena !== password) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
    }

    return res.json({
      success: true,
      usuario: {
        id: user['identificación'],
        nombre: user.nombre,
        correo: user.correo
      }
    });
  } catch (err) {
    console.error('Error en /api/login:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error de conexión con la base de datos' });
  }
});

// REGISTRO
app.post('/api/registro', async (req, res) => {
  try {
    const nombre = (req.body.nombre || '').trim();
    const correo = (req.body.correo || '').trim();
    const password = req.body.contrasena ?? req.body.contraseña ?? '';

    if (!nombre || !correo || !password) {
      return res.status(400).json({ success: false, message: 'Completa todos los campos' });
    }

    const existing = await sbRequest(
      'usuarios',
      {
        query: `select=${encodeURIComponent('identificación')}&correo=eq.${encodeURIComponent(correo)}&limit=1`
      }
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado' });
    }

    const created = await sbRequest('usuarios', {
      method: 'POST',
      body: [{ nombre, correo, contrasena: password }]
    });

    const newUser = Array.isArray(created) ? created[0] : created;
    return res.status(201).json({
      success: true,
      usuario: {
        id: newUser['identificación'],
        nombre: newUser.nombre,
        correo: newUser.correo
      }
    });
  } catch (err) {
    console.error('Error en /api/registro:', err);
    return res.status(500).json({ success: false, message: err.message || 'Error al registrar usuario' });
  }
});

// PERROS POR USUARIO
app.get('/api/perros/:usuarioId', async (req, res) => {
  try {
    const usuarioId = Number(req.params.usuarioId);
    const rows = await sbRequest(
      'perros',
      {
        query: `select=*&usuario_id=eq.${usuarioId}&order=${encodeURIComponent('identificación.asc')}`
      }
    );
    const formatted = (rows || []).map((d) => ({
      ...d,
      id: d['identificación']
    }));
    return res.json(formatted);
  } catch (err) {
    console.error('Error en /api/perros/:usuarioId:', err);
    return res.status(500).json({ error: 'Error al obtener mascotas' });
  }
});

// REGISTRAR PERRO
app.post('/api/perros', async (req, res) => {
  try {
    const { usuario_id, nombre, raza, edad, peso } = req.body;
    const created = await sbRequest('perros', {
      method: 'POST',
      body: [{
        usuario_id: Number(usuario_id),
        nombre,
        raza,
        edad: edad ? Number(edad) : null,
        peso: peso ? Number(peso) : null
      }]
    });
    const dog = Array.isArray(created) ? created[0] : created;
    return res.status(201).json({
      success: true,
      perro: { ...dog, id: dog['identificación'] }
    });
  } catch (err) {
    console.error('Error en /api/perros:', err);
    return res.status(500).json({ success: false, message: 'Error al registrar perro' });
  }
});

// DISPOSITIVO VINCULADO A PERRO
app.get('/api/dispositivo/:perroId', async (req, res) => {
  try {
    const perroId = Number(req.params.perroId);
    const rows = await sbRequest(
      'dispositivos',
      {
        query: `select=*&perro_id=eq.${perroId}&limit=1`
      }
    );
    const disp = Array.isArray(rows) ? rows[0] : null;
    if (!disp) return res.json({});
    return res.json({
      ...disp,
      id: disp['identificación'],
      bateria: disp['batería'] ?? 100
    });
  } catch (err) {
    console.error('Error en /api/dispositivo/:perroId:', err);
    return res.status(500).json({ error: 'Error al consultar dispositivo' });
  }
});

// HISTORIAL DE MEDICIONES (tabla "medir")
app.get('/api/historial-mediciones/:dispositivoId', async (req, res) => {
  try {
    const dispositivoId = Number(req.params.dispositivoId);
    const rows = await sbRequest(
      'medir',
      {
        query: `select=*&dispositivo_id=eq.${dispositivoId}&order=fecha_hora.desc&limit=20`
      }
    );
    return res.json(rows || []);
  } catch (err) {
    console.error('Error en /api/historial-mediciones/:dispositivoId:', err);
    return res.status(500).json({ error: 'Error al consultar mediciones' });
  }
});

// ÚLTIMA UBICACIÓN
app.get('/api/ubicacion/:dispositivoId', async (req, res) => {
  try {
    const dispositivoId = Number(req.params.dispositivoId);
    const rows = await sbRequest(
      'ubicaciones',
      {
        query: `select=*&dispositivo_id=eq.${dispositivoId}&order=fecha_hora.desc&limit=1`
      }
    );
    return res.json((Array.isArray(rows) && rows[0]) || {});
  } catch (err) {
    console.error('Error en /api/ubicacion/:dispositivoId:', err);
    return res.status(500).json({ error: 'Error al consultar ubicación' });
  }
});

// ALERTAS DEL PERRO
app.get('/api/alertas/:perroId', async (req, res) => {
  try {
    const perroId = Number(req.params.perroId);
    const rows = await sbRequest(
      'alertas',
      {
        query: `select=*&perro_id=eq.${perroId}&order=${encodeURIComponent('identificación.desc')}`
      }
    );
    const formatted = (rows || []).map((a) => ({
      ...a,
      descripcion: a['descripción'] || a.descripcion || ''
    }));
    return res.json(formatted);
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
