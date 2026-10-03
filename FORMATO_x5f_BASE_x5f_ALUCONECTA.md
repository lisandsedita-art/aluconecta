# FORMATO BASE ALUCONECTA

Documento de referencia para mantener coherencia visual, funcional y de producto en toda la plataforma.

## 1. Identidad

- Nombre: AluConecta
- Dominio oficial: aluconecta.com.ar
- Slogan: “Donde los proyectos encuentran sus aberturas.”
- Rubro actual: carpintería y aberturas de aluminio.
- No ampliar a PVC, madera u otros rubros sin una decisión específica de producto.

## 2. Público de la plataforma

AluConecta conecta dos partes:

### Profesionales / Empresas

Arquitectos, ingenieros, constructores, desarrolladores y empresas que necesitan resolver aberturas de aluminio para sus proyectos.

### Carpinterías de aluminio

Talleres y empresas que fabrican, proveen o instalan aberturas de aluminio y buscan proyectos para cotizar.

La plataforma no está orientada al propietario particular como público principal.

## 3. Flujo principal

El flujo central que debe preservarse es:

1. El profesional o empresa publica un proyecto.
2. Las carpinterías registradas pueden consultar las oportunidades disponibles.
3. Una carpintería manifiesta interés.
4. El propietario del proyecto decide si autoriza a esa carpintería.
5. Sólo después de la autorización se habilitan los datos de contacto y la documentación correspondiente.
6. La carpintería puede enviar su cotización.
7. El profesional compara las propuestas recibidas.

No romper ni simplificar este flujo sin revisar previamente seguridad, privacidad y permisos.

## 4. Privacidad y seguridad

- Los proyectos no deben exponer información privada innecesaria.
- Los datos de contacto se mantienen protegidos hasta que exista autorización.
- Los buckets de documentación y cotizaciones son privados.
- Los archivos se abren mediante URLs firmadas de duración limitada.
- Supabase RLS y los RPC existentes forman parte de la seguridad del producto.
- No reemplazar controles de base de datos por controles solamente visuales o de JavaScript.
- No mostrar mensajes técnicos de Supabase directamente al usuario.
- Los errores técnicos pueden registrarse en consola para diagnóstico.
- No presentar a una carpintería como “verificada” salvo que exista un proceso real y definido de verificación.

## 5. Roles

Los tipos principales de cuenta son:

- `carpintero`
- `cliente_profesional`

También pueden existir valores históricos compatibles como profesional, empresa o cliente, pero la estructura principal debe conservar los dos tipos anteriores.

## 6. Datos de perfil

### Carpintería

- Nombre / taller
- Localidad base
- Provincia
- Zonas donde trabaja
- Teléfono / WhatsApp
- Presentación
- Instagram
- Facebook
- TikTok
- Sitio web

Las zonas donde trabaja se almacenan actualmente en `perfiles.servicios`.

### Profesional / Empresa

- Nombre / empresa
- Actividad / rol profesional
- Localidad
- Provincia
- Teléfono / WhatsApp
- Presentación
- Instagram
- Facebook
- TikTok
- Sitio web

La actividad profesional se almacena en `perfiles.actividades`.

El DNI es un dato privado de cuenta y no forma parte del perfil público.

## 7. Identidad visual

### Colores principales

- Azul principal: `#0f2e4d`
- Azul secundario: tonos derivados del azul principal.
- Celeste de identidad: usado en “Conecta” y acentos.
- Amarillo: reservado principalmente para acciones destacadas.
- Fondo general: tonos claros y neutros.
- Blanco: tarjetas, superficies y contraste.

Actualmente existen pequeñas variaciones de amarillo entre páginas (`#ffd54f`, `#facc15` y derivados). No unificar globalmente sin revisar antes el diseño completo.

## 8. Estilo visual

- Apariencia profesional, sobria y vinculada al sector de la construcción.
- Evitar emojis decorativos.
- Preferir iconos SVG simples.
- Mantener buena lectura en dispositivos móviles.
- Botones claros y con jerarquía visual.
- Tarjetas con bordes y sombras sutiles.
- Evitar sobrecargar la portada o los paneles con información repetida.

## 9. Terminología

Usar preferentemente:

- Proyecto
- Obra
- Carpintería de aluminio
- Profesional / Empresa
- Cotización
- Interés
- Autorización
- Documentación técnica
- Contacto habilitado

Evitar términos que puedan generar una promesa que AluConecta no pueda demostrar, como “carpintería verificada”, salvo que exista un sistema formal que lo respalde.

## 10. Portada

La portada debe presentar a ambas partes con equilibrio.

Principios:

- No favorecer visualmente un rol sobre el otro.
- No mostrar proyectos privados a visitantes.
- Explicar con claridad cómo funciona AluConecta.
- Mantener el lenguaje dirigido a profesionales del sector.
- Evitar redundancias.
- El acceso y el registro deben ser claros para ambos tipos de cuenta.

## 11. Navegación

La navegación debe respetar el rol autenticado.

### Profesional / Empresa

Acceso principal a:

- Panel
- Publicar proyecto
- Mis proyectos
- Interesados
- Cotizaciones
- Buscar carpinterías
- Editar mis datos

### Carpintería

Acceso principal a:

- Panel
- Obras disponibles
- Mis intereses
- Cotizaciones
- Perfil comercial
- Editar mi perfil

## 12. Archivos principales

- `index.html` — portada
- `ingresar.html` — inicio de sesión
- `acceso.html` — elección de tipo de cuenta
- `registro-cliente.html` — registro profesional / empresa
- `registro-carpintero.html` — registro carpintería
- `confirmacion.html` — confirmación de cuenta
- `recuperar-password.html` — recuperación de contraseña
- `nueva-password.html` — nueva contraseña
- `panel-cliente.html` — panel profesional / empresa
- `panel-carpintero.html` — panel carpintería
- `editar-perfil.html` — edición de perfil compartida por ambos roles
- `perfil.html` — perfil comercial de carpintería
- `aluminio.html` — búsqueda de carpinterías
- `proyectos.html` — acceso y derivación según sesión / rol
- `publicar-proyecto.html` — publicación de proyecto
- `mis-proyectos.html` — gestión de proyectos, intereses y cotizaciones
- `cotizar.html` — creación y edición de cotizaciones
- `manifest.json` — configuración PWA
- `sw.js` — service worker actualmente no activado

## 13. Regla de modificaciones

Antes de modificar un archivo:

1. Revisar el código actual completo relacionado con el cambio.
2. Confirmar si el archivo es utilizado por uno o por ambos roles.
3. No romper funcionalidades ya comprobadas.
4. Hacer cambios quirúrgicos, no reescrituras generales innecesarias.
5. Cuando varias modificaciones pertenecen al mismo bloque, reemplazar el bloque completo.
6. Verificar el resultado en `main` después de cada modificación.
7. Probar el flujo afectado antes de dar el archivo por terminado.
8. No modificar Supabase, RLS, RPC, triggers o Storage sin comprender primero su función actual.

## 14. Principio general

AluConecta debe mantenerse simple para el usuario y prudente técnicamente.

La prioridad es preservar:

- seguridad;
- privacidad;
- claridad entre roles;
- funcionamiento del flujo de autorización;
- consistencia visual;
- rendimiento;
- estabilidad de lo que ya funciona.
