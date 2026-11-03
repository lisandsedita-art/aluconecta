import { withSupabase } from "npm:@supabase/server@1";
interface ConsultaRecord {
  nombre?: unknown;
  email?: unknown;
  telefono?: unknown;
  motivo?: unknown;
  mensaje?: unknown;
  estado?: unknown;
  tipo_usuario?: unknown;
}

interface DatabaseWebhookPayload {
  type?: unknown;
  schema?: unknown;
  table?: unknown;
  record?: ConsultaRecord | null;
}

function jsonResponse(body: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

Deno.serve(withSupabase({ auth: "secret" }, async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("RESEND_API_KEY is not configured");
    return jsonResponse({ error: "Email service is not configured" }, 500);
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (
    payload.type !== "INSERT" ||
    payload.schema !== "public" ||
    payload.table !== "consultas_contacto" ||
    !payload.record || typeof payload.record !== "object" || Array.isArray(payload.record)
  ) {
    return jsonResponse({ error: "Unexpected webhook payload" }, 400);
  }

  const { nombre, email, telefono, motivo, mensaje, estado, tipo_usuario } = payload.record;
  // estado and tipo_usuario are read from the webhook row for compatibility with the table payload.
  void estado;
  void tipo_usuario;

  const emailText = [
    `Nombre: ${textValue(nombre)}`,
    `Email: ${textValue(email)}`,
    `Teléfono: ${textValue(telefono)}`,
    `Motivo: ${textValue(motivo)}`,
    "",
    "Mensaje:",
    textValue(mensaje),
  ].join("\n");

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AluConecta <notificaciones@aluconecta.com.ar>",
        to: ["hola@aluconecta.com.ar"],
        subject: "Nueva consulta en AluConecta",
        text: emailText,
      }),
    });

    if (!resendResponse.ok) {
      console.error("Resend rejected the email request", { status: resendResponse.status });
      return jsonResponse({ error: "Failed to send notification email" }, 502);
    }

    return jsonResponse({ success: "Notification email sent" }, 200);
  } catch {
    console.error("Could not reach Resend API");
    return jsonResponse({ error: "Email provider is temporarily unavailable" }, 503);
  }
}));