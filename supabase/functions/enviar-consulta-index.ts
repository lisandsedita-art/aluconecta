import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "npm:@supabase/server@^1";

type ConsultaPayload = {
nombre?: unknown;
email?: unknown;
telefono?: unknown;
motivo?: unknown;
mensaje?: unknown;
turnstileToken?: unknown;
};

const HOSTNAMES_PERMITIDOS = new Set([
"aluconecta.com.ar",
"www.aluconecta.com.ar",
]);

const MOTIVOS_PERMITIDOS = new Set([
"consulta_general",
"profesional",
"carpintero",
"soporte",
]);

function textoValido(
valor: unknown,
maximo: number,
obligatorio = true,
) {
if (valor === null || valor === undefined) {
return !obligatorio;
}

if (typeof valor !== "string") {
return false;
}

const limpio = valor.trim();

if (obligatorio && !limpio) {
return false;
}

return limpio.length <= maximo;
}

export default {
fetch: withSupabase(
{
auth: "none",
},
async (req, ctx) => {
if (req.method !== "POST") {
return Response.json(
{ ok: false },
{ status: 405 },
);
}

try {
const body =
await req.json() as ConsultaPayload;

const nombre =
typeof body.nombre === "string"
? body.nombre.trim()
: "";

const email =
typeof body.email === "string"
? body.email.trim()
: "";

const telefono =
typeof body.telefono === "string"
? body.telefono.trim()
: "";

const motivo =
typeof body.motivo === "string"
? body.motivo
: "";

const mensaje =
typeof body.mensaje === "string"
? body.mensaje.trim()
: "";

const turnstileToken =
typeof body.turnstileToken === "string"
? body.turnstileToken
: "";

if (
!textoValido(nombre, 120) ||
!textoValido(email, 254) ||
!textoValido(telefono, 40, false) ||
!textoValido(mensaje, 4000) ||
!MOTIVOS_PERMITIDOS.has(motivo) ||
!turnstileToken ||
turnstileToken.length > 2048
) {
return Response.json(
{
ok: false,
message:
"No pudimos validar la consulta.",
},
{ status: 400 },
);
}

const turnstileSecret =
Deno.env.get(
"TURNSTILE_SECRET_KEY",
);

if (!turnstileSecret) {
console.error(
"TURNSTILE_SECRET_KEY no configurada.",
);

return Response.json(
{
ok: false,
message:
"No pudimos procesar la consulta.",
},
{ status: 500 },
);
}

const ip =
req.headers
.get("x-forwarded-for")
?.split(",")[0]
?.trim() || "";

const datosVerificacion =
new URLSearchParams();

datosVerificacion.set(
"secret",
turnstileSecret,
);

datosVerificacion.set(
"response",
turnstileToken,
);

if (ip) {
datosVerificacion.set(
"remoteip",
ip,
);
}

const verificacion =
await fetch(
"https://challenges.cloudflare.com/turnstile/v0/siteverify",
{
method: "POST",
headers: {
"Content-Type":
"application/x-www-form-urlencoded",
},
body: datosVerificacion,
signal:
AbortSignal.timeout(10000),
},
);

if (!verificacion.ok) {
console.error(
"Turnstile respondió con estado:",
verificacion.status,
);

return Response.json(
{
ok: false,
message:
"No pudimos verificar la consulta.",
},
{ status: 403 },
);
}

const resultadoTurnstile =
await verificacion.json();

if (
resultadoTurnstile.success !== true ||
!HOSTNAMES_PERMITIDOS.has(
resultadoTurnstile.hostname,
) ||
resultadoTurnstile.action !==
"contacto"
) {
console.warn(
"Turnstile rechazó la consulta.",
resultadoTurnstile[
"error-codes"
] || [],
);

return Response.json(
{
ok: false,
message:
"No pudimos verificar la consulta.",
},
{ status: 403 },
);
}

const {
error: insertError,
} =
await ctx.supabaseAdmin
.from(
"consultas_contacto",
)
.insert({
nombre,
email,
telefono:
telefono || null,
motivo,
mensaje,
estado: "nuevo",
tipo_usuario:
"visitante",
});

if (insertError) {
console.error(
"No se pudo guardar la consulta:",
insertError,
);

return Response.json(
{
ok: false,
message:
"No pudimos enviar la consulta.",
},
{ status: 500 },
);
}

return Response.json({
ok: true,
});
} catch (error) {
console.error(
"Error inesperado en enviar-consulta:",
error,
);

return Response.json(
{
ok: false,
message:
"No pudimos procesar la consulta.",
},
{ status: 500 },
);
}
},
),
};
