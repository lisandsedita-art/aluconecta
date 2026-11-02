
import postgres from "npm:postgres@3.4.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

// AluConecta: cierre automático de cuentas con historial comercial.
// Proyecto principal. Esta función se mantiene DESHABILITADA hasta completar
// las pruebas de permisos, recuperación y conservación documental.
const PROJECT = "https://wroaxwjyjrxzwctfkyoo.supabase.co";
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return reply(405, { error: "Método no permitido" });
  }

  // Doble autorización deliberada: no basta con habilitar el cierre de cuentas
  // sin vínculos para habilitar también la eliminación lógica con historial.
  if (Deno.env.get("ALUC_CIERRES_HABILITADOS") !== "si" ||
      Deno.env.get("ALUC_CIERRES_HISTORIAL_HABILITADOS") !== "si") {
    return reply(503, { error: "Cierres con historial deshabilitados" });
  }
  if (Deno.env.get("SUPABASE_URL") !== PROJECT) {
    return reply(503, { error: "Entorno incorrecto" });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!dbUrl || !serviceKey) {
    return reply(503, { error: "Configuración incompleta" });
  }

  let token: unknown;
  try {
    token = (await request.json())?.token;
  } catch {
    return reply(400, { error: "Solicitud inválida" });
  }
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return reply(401, { error: "Acceso no autorizado" });
  }

  const db = postgres(dbUrl, { max: 1, prepare: false, connect_timeout: 8 });
  let lockHeld = false;
  const admin = createClient(PROJECT, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const counters = { candidatas: 0, recuperaciones: 0, cerradas: 0, fallidas: 0 };

  // Registrar solamente la etapa y el código de error, sin datos personales.
  const incident = async (userId: string, stage: string, code: string) => {
    const validStage = ["auth", "finalizacion", "validacion", "preparacion"].includes(stage)
      ? stage
      : "validacion";
    try {
      await db.unsafe(
        "select gestion_interna.registrar_incidencia_cierre_historial($1::uuid,$2,$3)",
        [userId, validStage, code.slice(0, 80)],
      );
    } catch {
      console.error("No se pudo registrar incidencia de cierre");
    }
  };

  const isSoftDeleted = async (id: string): Promise<boolean> => {
    const rows = await db.unsafe(
      "select deleted_at is not null as eliminado from auth.users where id=$1::uuid",
      [id],
    );
    return rows[0]?.eliminado === true;
  };

  const finish = async (id: string): Promise<boolean> => {
    try {
      const [res] = await db.unsafe(
        "select gestion_interna.completar_cierre_logico_con_historial($1::uuid) as resultado",
        [id],
      );
      if (res?.resultado?.cerrada !== true) {
        throw new Error("recibo_no_confirmado");
      }
      counters.cerradas++;
      return true;
    } catch (error) {
      counters.fallidas++;
      await incident(id, "finalizacion", "fallo_finalizador");
      console.error("Cierre lógico requiere recuperación", {
        usuario_id: id,
        codigo: (error as { code?: string }).code || "sin_codigo",
      });
      return false;
    }
  };

  const softDelete = async (id: string): Promise<boolean> => {
    // Revalidar antes de llamar a Auth para prevenir cierres fuera de condiciones.
    const [plan] = await db.unsafe(
      "select gestion_interna.planificar_cierre_historial($1::uuid) as plan",
      [id],
    );
    if (!["lista_para_preparacion_logica", "lista_para_preparacion_logica_documentos"]
      .includes(plan?.plan?.fase)) {
      counters.fallidas++;
      await incident(id, "validacion", "nuevos_impedimentos");
      return false;
    }

    const { data, error: readError } = await admin.auth.admin.getUserById(id);
    if (readError || data?.user?.id !== id) {
      counters.fallidas++;
      await incident(id, "auth", "usuario_no_legible");
      return false;
    }

    const { error } = await admin.auth.admin.deleteUser(id, true);
    // Incluso si Auth devolvió un error, consultar el estado efectivo.
    const deleted = await isSoftDeleted(id);
    if (!deleted) {
      counters.fallidas++;
      await incident(id, "auth", error?.code || "baja_no_confirmada");
      console.error("Auth rechazó cierre lógico", {
        usuario_id: id,
        status: error?.status,
        codigo: error?.code,
      });
      return false;
    }
    return finish(id);
  };

  try {
    // Token de uso único, válido por cinco minutos; generado en la base.
    const [valid] = await db.unsafe(
      "select gestion_interna.consumir_llamada_cierre_historial($1) as valido",
      [token],
    );
    if (valid?.valido !== true) {
      return reply(401, { error: "Acceso no autorizado" });
    }

    const [lock] = await db.unsafe(
      "select pg_try_advisory_lock(200026, 1027) as adquirido",
    );
    if (lock?.adquirido !== true) {
      return reply(409, { estado: "ejecutor_ocupado" });
    }
    lockHeld = true;

    // Recuperaciones: nunca repetir deleteUser si Auth ya marcó el cierre.
    const recoveries = await db.unsafe(
      "select usuario_id,tipo from gestion_interna.listar_recuperaciones_cierre_historial(3)",
    );
    for (const row of recoveries) {
      counters.recuperaciones++;
      if (row.tipo === "finalizacion_pendiente") {
        await finish(row.usuario_id);
      } else if (row.tipo === "auth_pendiente") {
        await softDelete(row.usuario_id);
      }
    }

    // Preparar solamente las cuentas que el diagnóstico del servidor habilite.
    const candidates = await db.unsafe(
      "select usuario_id from gestion_interna.listar_candidatos_logicos_sin_archivos(3)",
    );
    for (const row of candidates) {
      const id: string = row.usuario_id;
      counters.candidatas++;
      try {
        // PostgreSQL revalida plazo de 72 horas y vínculos antes de preparar.
        const [pre] = await db.unsafe(
          "select gestion_interna.preparar_cierre_logico_con_historial($1::uuid) as resultado",
          [id],
        );
        if (pre?.resultado?.preparado !== true) {
          throw new Error("sin_preparacion");
        }
      } catch (error) {
        counters.fallidas++;
        await incident(id, "preparacion", "preparacion_rechazada");
        console.error("Preparación rechazada", {
          usuario_id: id,
          codigo: (error as { code?: string }).code || "sin_codigo",
        });
        continue;
      }
      await softDelete(id);
    }

    return reply(counters.fallidas ? 207 : 200, {
      estado: counters.fallidas ? "requiere_seguimiento" : "procesado",
      ...counters,
    });
  } catch {
    console.error("Error interno del ejecutor con historial");
    return reply(500, { error: "Error interno; revisar incidencias antes de reintentar" });
  } finally {
    if (lockHeld) {
      await db.unsafe("select pg_advisory_unlock(200026, 1027)").catch(() => {});
    }
    await db.end().catch(() => {});
  }
});
