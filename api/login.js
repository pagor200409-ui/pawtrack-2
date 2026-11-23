import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      message: 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel'
    });
  }

  try {
    const correo = (req.body?.correo || '').trim();
    const password = req.body?.contrasena ?? req.body?.contraseña ?? '';

    if (!correo || !password) {
      return res.status(400).json({ success: false, message: 'Ingresa correo y contraseña' });
    }

    const { data, error } = await supabase
      .from('usuarios')
      .select('identificación, nombre, correo, contrasena')
      .eq('correo', correo)
      .limit(1);

    if (error) {
      console.error('Error Supabase login:', error);
      return res.status(500).json({ success: false, message: error.message });
    }

    const user = data?.[0];
    if (!user || user.contrasena !== password) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos' });
    }

    return res.status(200).json({
      success: true,
      usuario: {
        id: user['identificación'],
        nombre: user.nombre,
        correo: user.correo
      }
    });
  } catch (err) {
    console.error('Error inesperado en login:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}