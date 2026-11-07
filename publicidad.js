/* AluConecta · publicidad sectorial. No muestra nada si no hay campaña activa y sistema habilitado.
 * Integrar mediante <script defer src="publicidad.js"></script> en las tres páginas previstas.
 * Los anuncios se obtienen mediante acceso anónimo y están separados de las sesiones privadas.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://wroaxwjyjrxzwctfkyoo.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_35152HM4RtYst1yA2a79zA_zIh6yDs3';
  const BUCKET = 'alu-publicidad';
  const rutas = {
    'index.html': { ubicacion: 'portada', selector: '#como-funciona', modo: 'after' },
    'panel-carpintero.html': { ubicacion: 'panel_carpintero', selector: 'main.wrap', modo: 'append' },
    'panel-cliente.html': { ubicacion: 'panel_profesional', selector: 'main.wrap', modo: 'append' }
  };

  function pintar(estilo) {
    const tag = document.createElement('style');
    tag.textContent = estilo;
    document.head.append(tag);
  }

  async function iniciar() {
    const ruta = location.pathname.split('/').pop() || 'index.html';
    const destino = rutas[ruta];
    if (!destino) return;
    const ancla = document.querySelector(destino.selector);
    if (!ancla || !window.supabase?.createClient) return;
    try {
      // Cliente sin persistencia de sesión: la publicidad no utiliza identidad del visitante.
      const cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
      const { data, error } = await cliente.from('publicidad_campanias')
        .select('id,anunciante,titulo,descripcion,url_destino,imagen_ruta,prioridad')
        .eq('ubicacion', destino.ubicacion)
        .order('prioridad', { ascending: false })
        .order('inicio_en', { ascending: false })
        .limit(40);
      if (error || !data?.length) return;
      // Rota automáticamente entre campañas de máxima prioridad, sin cookies ni perfiles.
      const mayorPrioridad = data[0].prioridad;
      const candidatas = data.filter(c => c.prioridad === mayorPrioridad);
      const anuncio = candidatas[Math.floor(Math.random() * candidatas.length)];
      const destinoUrl = new URL(anuncio.url_destino);
      if (destinoUrl.protocol !== 'https:') return;
      if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(anuncio.imagen_ruta)) return;
      const { data: imagen } = cliente.storage.from(BUCKET).getPublicUrl(anuncio.imagen_ruta);
      if (!imagen?.publicUrl) return;

      pintar(`
        .alu-publicidad{box-sizing:border-box;width:100%;max-width:1100px;margin:22px auto;padding:16px;
          border:1px solid #dce6ec;border-radius:13px;background:#fff;box-shadow:0 3px 14px #0f2e4d08;
          color:#173d58;font:inherit}
        .alu-publicidad *, .alu-publicidad *::before,.alu-publicidad *::after{box-sizing:border-box}
        .alu-publicidad .alu-publicidad-etiqueta{display:block;font:700 10px/1.4 system-ui,Arial,sans-serif;
          letter-spacing:.11em;text-transform:uppercase;color:#637788;margin-bottom:8px}
        .alu-publicidad .alu-publicidad-enlace{display:flex;align-items:center;gap:18px;
          text-decoration:none;color:inherit}
        .alu-publicidad .alu-publicidad-imagen{width:36%;max-width:310px;max-height:110px;
          object-fit:contain;flex:none;border-radius:7px}
        .alu-publicidad .alu-publicidad-titulo{display:block;font-size:16px;font-weight:750;line-height:1.35}
        .alu-publicidad .alu-publicidad-texto{display:block;font-size:13px;line-height:1.5;color:#526878;margin-top:4px}
        .alu-publicidad .alu-publicidad-marca{display:block;font-size:12px;color:#647789;margin-top:5px}
        @media(max-width:520px){.alu-publicidad{padding:12px}
          .alu-publicidad .alu-publicidad-enlace{display:block}
          .alu-publicidad .alu-publicidad-imagen{display:block;width:100%;max-width:100%;max-height:130px;
            margin:0 auto 10px}}
      `);

      const caja = document.createElement('aside');
      caja.className = 'alu-publicidad';
      caja.setAttribute('aria-label', 'Publicidad sectorial');
      const etiqueta = document.createElement('span');
      etiqueta.className = 'alu-publicidad-etiqueta';
      etiqueta.textContent = 'Publicidad';
      const enlace = document.createElement('a');
      enlace.className = 'alu-publicidad-enlace';
      enlace.href = destinoUrl.href;
      enlace.target = '_blank';
      enlace.rel = 'sponsored noopener noreferrer';
      enlace.referrerPolicy = 'no-referrer';
      const imagenEl = document.createElement('img');
      imagenEl.className = 'alu-publicidad-imagen';
      imagenEl.alt = `Anuncio de ${anuncio.anunciante}`;
      imagenEl.src = imagen.publicUrl;
      imagenEl.loading = 'lazy';
      imagenEl.referrerPolicy = 'no-referrer';
      const contenido = document.createElement('div');
      const titulo = document.createElement('strong');
      titulo.className = 'alu-publicidad-titulo';
      titulo.textContent = anuncio.titulo;
      const resumen = document.createElement('span');
      resumen.className = 'alu-publicidad-texto';
      resumen.textContent = anuncio.descripcion || '';
      const marca = document.createElement('span');
      marca.className = 'alu-publicidad-marca';
      marca.textContent = anuncio.anunciante;
      contenido.append(titulo, resumen, marca);
      enlace.append(imagenEl, contenido);
      caja.append(etiqueta, enlace);
      if (destino.modo === 'after') ancla.after(caja);
      else ancla.append(caja);
    } catch (error) {
      console.warn('AluConecta: no se pudo comprobar la publicidad disponible.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
