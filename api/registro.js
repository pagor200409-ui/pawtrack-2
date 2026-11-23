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
    const nombre = (req.body?.nombre || '').trim();
    const correo = (req.body?.correo || '').trim();
    const password = req.body?.contrasena ?? req.body?.contraseña ?? '';

    if (!nombre || !correo || !password) {
      return res.status(400).json({ success: false, message: 'Completa todos los campos' });
    }

    const { data: existing, error: checkError } = await supabase
      .from('usuarios')
      .select('identificación')
      .eq('correo', correo)
      .limit(1);

    if (checkError) {
      console.error('Error verificando correo:', checkError);
      return res.status(500).json({ success: false, message: checkError.message });
    }

    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado' });
    }

    const { data: created, error: insertError } = await supabase
      .from('usuarios')
      .insert([{ nombre, correo, contrasena: password }])
      .select('identificación, nombre, correo')
      .single();

    if (insertError) {
      console.error('Error insertando usuario:', insertError);
      return res.status(500).json({ success: false, message: insertError.message });
    }

    return res.status(201).json({
      success: true,
      usuario: {
        id: created['identificación'],
        nombre: created.nombre,
        correo: created.correo
      }
    });
  } catch (err) {
    console.error('Error inesperado en registro:', err);
    return res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
}