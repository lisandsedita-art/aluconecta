import postgres from "npm:postgres@3.4.7";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const PROJECT = "https://wroaxwjyjrxzwctfkyoo.supabase.co";
const reply = (status: number, data: Record<string, unknown>) =>
  new Response(JSON.stringify(data), {status, headers: {"content-type":"application/json","cache-control":"no-store"}});
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return reply(405, {error:"Método no permitido"});
  if (Deno.env.get("ALUC_CIERRES_HABILITADOS") !== "si") return reply(503, {error: "Cierres automáticos deshabilitados"});
  if (Deno.env.get("SUPABASE_URL") !== PROJECT) return reply(503, {error:"Entorno no habilitado"});
  const databaseUrl = Deno.env.get("SUPABASE_DB_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!databaseUrl || !serviceKey) return reply(503, {error:"Configuración interna incompleta"});
  let token: unknown;
  try { token = (await request.json())?.token; } catch { return reply(400,{error:"Solicitud inválida"}); }
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return reply(401,{error:"No autorizado"});
  const db = postgres(databaseUrl, {max:1,prepare:false,connect_timeout:8});
  try {
    const [validation] = await db.unsafe("select gestion_interna.consumir_token_cierre($1) as valido",[token]);
    if (validation?.valido !== true) return reply(401,{error:"No autorizado"});
    await db.unsafe("select gestion_interna.actualizar_evaluaciones_baja_automatica()");
    const candidates = await db.unsafe(
      "select s.usuario_id from gestion_interna.solicitudes_baja s "+
      "join gestion_interna.evaluaciones_baja_automatica e using(usuario_id) "+
      "join public.perfiles p on p.id=s.usuario_id "+
      "where e.estado='lista_para_cierre' and e.solicitada_en=s.solicitada_en "+
      "and s.cancelada_en is null and p.estado_cuenta='baja_solicitada' "+
      "and clock_timestamp()>=s.solicitada_en+interval '72 hours' "+
      "and not exists(select 1 from gestion_interna.cierres_baja c where c.usuario_id=s.usuario_id) "+
      "order by s.solicitada_en limit 10");
    const admin = createClient(PROJECT,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    let eliminated=0, failed=0;
    for (const candidate of candidates) {
      // El trigger vuelve a comprobar plazo y vínculos en la transacción de Auth.
      const {error} = await admin.auth.admin.deleteUser(candidate.usuario_id, false);
      if (error) {
        failed++;
        console.error("Cierre no completado", {usuario_id:candidate.usuario_id,code:error.code,status:error.status});
      } else {
        const [receipt] = await db.unsafe("select 1 as ok from gestion_interna.cierres_baja where usuario_id=$1",[candidate.usuario_id]);
        if (receipt?.ok===1) eliminated++; else failed++;
      }
    }
    return reply(failed ? 500 : 200,{candidatas:candidates.length,eliminadas:eliminated,fallidas:failed});
  } catch {
    console.error("Fallo interno del cierre automático");
    return reply(500,{error:"No se pudo completar el cierre"});
  } finally { await db.end().catch(()=>{}); }
});

