/* AluConecta Pruebas: revisión previa a la solicitud de baja.
   Instalar DESPUÉS del script actual de cuenta.html, solo en prueba-gestion-cuentas.
   No sustituye las verificaciones del servidor ni habilita el borrado con historial. */
(() => {
  'use strict';
  const zona = document.getElementById('zonaBaja');
  const zonaPendiente = document.getElementById('zonaPendiente');

  // Instrucciones visibles ANTES de solicitar la baja y mientras se tramita.
  // La solicitud se admite aun si hay cotizaciones pendientes; lo condicionado
  // por las declaraciones de ambas partes es la ejecución del cierre automático.
  function explicarSituaciones(contenedor, mensaje) {
    if (!contenedor || contenedor.querySelector('[data-aclaracion-cotizaciones-baja]')) return;
    const aviso = document.createElement('p');
    aviso.className = 'ayuda';
    aviso.setAttribute('data-aclaracion-cotizaciones-baja', '');
    aviso.textContent = mensaje;
    const acciones = contenedor.querySelector('.acciones');
    if (acciones) contenedor.insertBefore(aviso, acciones);
    else contenedor.appendChild(aviso);
  }
  explicarSituaciones(zona,
    'Si tenés cotizaciones, para que el cierre automático pueda avanzar ambas partes deben informar, en cada una, la misma situación final: «No se llegó a un acuerdo» o «Trabajo finalizado». «Pendiente de resolver» y «Acuerdo informado» no son situaciones finales. Informá lo que realmente ocurrió; podés solicitar la baja aunque queden situaciones pendientes, pero el cierre podría demorarse. No borres los documentos compartidos.');
  explicarSituaciones(zonaPendiente,
    'Si hay cotizaciones asociadas, ambas partes deben declarar la misma situación final («No se llegó a un acuerdo» o «Trabajo finalizado») para que el sistema pueda evaluar el cierre automático. Si no podés completar una declaración porque tu cuenta ya tiene la baja solicitada, contactá a AluConecta; no necesitás cancelar la solicitud ni borrar los archivos.');

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
      await informarEstadoCotizacionesParaBaja(client, itemTexto);
      const habilitada = data.puede_solicitar === true && !abiertas.length && !data.requiere_gestion_administrativa;
      if (habilitada) {
        resumen.textContent = 'Podés presentar la solicitud de baja. Esto no significa que las situaciones comerciales estén resueltas ni que el cierre ya esté autorizado.';
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

/* Advertencias informativas: el historial no se elimina ni se cierra por esta consulta.
   Un desacuerdo no prueba que haya obligaciones comerciales exigibles. */
async function informarEstadoCotizacionesParaBaja(cliente, agregar) {
  try {
    const { data: cotizaciones, error } = await cliente
      .from('cotizaciones').select('id').limit(30);
    if (error) throw error;
    if (!cotizaciones || !cotizaciones.length) return;
    let sinDefinir = 0, divergentes = 0, finalesCoincidentes = 0, acuerdosInformados = 0;
    const finales = new Set(['sin_acuerdo', 'trabajo_finalizado']);
    for (const c of cotizaciones) {
      const { data, error: errorEstado } = await cliente.rpc('consultar_situaciones_cotizacion', {
        p_cotizacion_id: c.id
      });
      if (errorEstado || !data) throw errorEstado || new Error('Consulta incompleta');
      const p = data.profesional?.situacion;
      const f = data.carpinteria?.situacion;
      if (!p || !f || p === 'pendiente' || f === 'pendiente') sinDefinir++;
      else if (p !== f) divergentes++;
      else if (finales.has(p)) finalesCoincidentes++;
      else if (p === 'acuerdo_informado') acuerdosInformados++;
      else sinDefinir++;
    }
    agregar('Tenés ' + cotizaciones.length + ' cotización(es) vinculada(s). Para el cierre automático, ambas partes deben informar en cada una la misma situación final: «No se llegó a un acuerdo» o «Trabajo finalizado». Deben declarar lo que realmente ocurrió.');
    if (sinDefinir) agregar('En ' + sinDefinir + ' cotización(es) falta una declaración final de alguna de las partes o sigue pendiente. Revisalas antes de solicitar la baja, si es posible.');
    if (divergentes) agregar('En ' + divergentes + ' cotización(es) las declaraciones son diferentes. Es necesario aclarar la situación real con la contraparte.');
    if (acuerdosInformados) agregar('En ' + acuerdosInformados + ' cotización(es), ambas partes informaron un acuerdo, pero todavía no indicaron «Trabajo finalizado». Esa coincidencia no habilita el cierre automático.');
    if (finalesCoincidentes) agregar('En ' + finalesCoincidentes + ' cotización(es) ambas partes declararon la misma situación final. Esto no equivale a aceptación contractual ni autoriza por sí solo la eliminación de archivos.');
    if (cotizaciones.length === 30) agregar('Se muestran hasta 30 cotizaciones visibles. El resultado no es una auditoría completa de los antecedentes.');
    agregar('El trámite de baja se puede solicitar aunque haya cotizaciones; el sistema aplicará los controles de conservación y privacidad vigentes.');
  } catch (error) {
    console.error('No se pudieron consultar declaraciones de cotizaciones', error);
    agregar('No pudimos consultar las declaraciones comerciales. Podés solicitar la baja y consultar sobre los asuntos pendientes con AluConecta.');
  }
}
