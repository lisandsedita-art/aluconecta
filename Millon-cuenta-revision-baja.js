/* AluConecta Pruebas: revisión previa a la solicitud de baja.
   Instalar DESPUÉS del script actual de cuenta.html, solo en prueba-gestion-cuentas.
   No sustituye las verificaciones del servidor ni habilita el borrado con historial. */
(() => {
  'use strict';
  const zona = document.getElementById('zonaBaja');
  const botonOriginal = zona?.querySelector('button[data-accion="baja"]');
  if (!zona || !botonOriginal || !window.supabase?.createClient) return;

  const client = window.supabase.createClient(
    'https://oktojwocvwrxvqxmyhtm.supabase.co',
    'sb_publishable_Eu21tArov_F1rztzJ4PObQ_rZ0BTeHH'
  );
  let ocupada = false;
  // El botón original conserva su manejador de confirmación dentro de cuenta.html,
  // pero se separa del DOM para que nadie pueda invocarlo sin la revisión previa.
  const botonRevisar = botonOriginal.cloneNode(true);
  botonRevisar.removeAttribute('data-accion');
  botonRevisar.className = 'primario';
  botonRevisar.textContent = 'Revisar requisitos para la baja';
  botonOriginal.replaceWith(botonRevisar);

  const panel = document.createElement('div');
  panel.className = 'detalle-diagnostico';
  panel.style.marginTop = '18px';
  panel.hidden = true;
  panel.setAttribute('aria-live', 'polite');
  const titulo = document.createElement('h3');
  titulo.textContent = 'Preparación de la baja';
  const resumen = document.createElement('p');
  const lista = document.createElement('ul');
  const acciones = document.createElement('div');
  acciones.className = 'acciones';
  const actualizar = document.createElement('button');
  actualizar.type = 'button';
  actualizar.className = 'secundario';
  actualizar.textContent = 'Volver a comprobar';
  const confirmar = document.createElement('button');
  confirmar.type = 'button';
  confirmar.className = 'peligro';
  confirmar.textContent = 'Confirmar solicitud de baja';
  confirmar.hidden = true;
  acciones.append(actualizar, confirmar);
  panel.append(titulo, resumen, lista, acciones);
  zona.append(panel);

  function itemTexto(texto) {
    const li = document.createElement('li');
    li.textContent = texto;
    lista.append(li);
    return li;
  }

  async function revisar() {
    if (ocupada || zona.hidden) return false;
    ocupada = true;
    botonRevisar.disabled = true;
    actualizar.disabled = true;
    confirmar.hidden = true;
    panel.hidden = false;
    resumen.textContent = 'Comprobando tu situación…';
    lista.replaceChildren();
    try {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || !auth?.user) throw new Error('La sesión venció. Volvé a iniciar sesión.');
      const { data, error } = await client.rpc('preparar_mi_baja');
      if (error) throw error;
      if (!data || !Array.isArray(data.publicaciones_abiertas)) {
        throw new Error('No se pudo completar la revisión previa.');
      }
      if (!['activa', 'desactivada'].includes(data.estado_cuenta)) {
        throw new Error('El estado de la cuenta ya no permite solicitar la baja. Actualizá la página.');
      }
      const abiertas = data.publicaciones_abiertas;
      if (abiertas.length) {
        resumen.textContent = abiertas.length === 1
          ? 'Tenés 1 publicación abierta. Resolvela antes de solicitar la baja.'
          : `Tenés ${abiertas.length} publicaciones abiertas. Resolvelas antes de solicitar la baja.`;
        for (const publicacion of abiertas) {
          const li = itemTexto(String(publicacion.nombre || 'Publicación sin título') + ' ');
          const boton = document.createElement('button');
          boton.type = 'button';
          boton.className = 'secundario';
          boton.textContent = 'Cerrar publicación';
          boton.addEventListener('click', async () => {
            const id = String(publicacion.id ?? '');
            if (ocupada || !/^\d+$/.test(id)) return;
            if (!window.confirm('¿Cerrar esta publicación? No recibirá nuevos intereses. El historial comercial se conserva.')) return;
            ocupada = true;
            boton.disabled = true;
            try {
              const { error: cerrarError } = await client.rpc('cerrar_publicacion_para_baja', { p_proyecto_id: id });
              if (cerrarError) throw cerrarError;
              // Evita que el diagnóstico original de cuenta.html quede desactualizado.
              window.location.reload();
            } catch (errorCierre) {
              resumen.textContent = errorCierre.message || 'No pudimos cerrar la publicación.';
              boton.disabled = false;
              ocupada = false;
            }
          });
          li.append(boton);
        }
        const li = document.createElement('li');
        const enlace = document.createElement('a');
        enlace.href = 'mis-proyectos.html';
        enlace.textContent = 'Revisar mis publicaciones';
        li.append(enlace);
        lista.append(li);
      }
      if (data.requiere_gestion_administrativa) {
        itemTexto('Tu cuenta tiene responsabilidades administrativas. Contactá a AluConecta para su transferencia antes de la baja.');
      }
      const habilitada = data.puede_solicitar === true && !abiertas.length && !data.requiere_gestion_administrativa;
      if (habilitada) {
        resumen.textContent = 'No encontramos asuntos pendientes que debas resolver antes de solicitar la baja.';
        itemTexto('Los proyectos cerrados, intereses y cotizaciones no deben borrarse para iniciar la solicitud.');
        confirmar.hidden = false;
      }
      return habilitada;
    } catch (error) {
      resumen.textContent = error.message || 'No se pudo completar la revisión.';
      itemTexto('No se enviará una solicitud sin haber comprobado los requisitos.');
      return false;
    } finally {
      ocupada = false;
      botonRevisar.disabled = false;
      actualizar.disabled = false;
    }
  }

  botonRevisar.addEventListener('click', revisar);
  actualizar.addEventListener('click', revisar);
  confirmar.addEventListener('click', async () => {
    // Evita validaciones obsoletas en la interfaz; la RPC final también comprueba.
    if (await revisar()) botonOriginal.click();
  });
})();
