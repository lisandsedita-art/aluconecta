import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import forge from "npm:node-forge@1.3.1";


const SERVICE =
  "ws_sr_constancia_inscripcion";


const WSAA_URL =
  "https://wsaa.afip.gov.ar/ws/services/LoginCms";


const PADRON_URL =
  "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5";



function decodeBase64(
  value: string,
) {

  const binary =
    atob(
      value.trim(),
    );


  const bytes =
    Uint8Array.from(
      binary,
      (c) =>
        c.charCodeAt(0),
    );


  return new TextDecoder()
    .decode(bytes);

}



function escapeXml(
  value: string,
) {

  return value
    .replaceAll(
      "&",
      "&amp;",
    )
    .replaceAll(
      "<",
      "&lt;",
    )
    .replaceAll(
      ">",
      "&gt;",
    )
    .replaceAll(
      '"',
      "&quot;",
    )
    .replaceAll(
      "'",
      "&apos;",
    );

}



function decodeXmlEntities(
  value: string,
) {

  return value
    .replaceAll(
      "&lt;",
      "<",
    )
    .replaceAll(
      "&gt;",
      ">",
    )
    .replaceAll(
      "&quot;",
      '"',
    )
    .replaceAll(
      "&apos;",
      "'",
    )
    .replaceAll(
      "&amp;",
      "&",
    );

}



function tagName(
  tag: string,
) {

  return `(?:[A-Za-z0-9_-]+:)?${tag}`;

}



function extractBlock(
  xml: string,
  tag: string,
) {

  const t =
    tagName(tag);


  const match =
    xml.match(
      new RegExp(
        `<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`,
        "i",
      ),
    );


  return match?.[1] ?? null;

}



function extractBlocks(
  xml: string,
  tag: string,
) {

  const t =
    tagName(tag);


  const regex =
    new RegExp(
      `<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`,
      "gi",
    );


  return [
    ...xml.matchAll(regex),
  ].map(
    (m) => m[1],
  );

}



function extractTag(
  xml: string,
  tag: string,
) {

  const value =
    extractBlock(
      xml,
      tag,
    );


  if (
    value === null
  ) {

    return null;

  }


  const cleaned =
    value
      .replace(
        /^<!\[CDATA\[([\s\S]*)\]\]>$/,
        "$1",
      )
      .trim();


  return decodeXmlEntities(
    cleaned,
  );

}



function extractTags(
  xml: string,
  tag: string,
) {

  return extractBlocks(
    xml,
    tag,
  )
    .map(
      (value) =>
        decodeXmlEntities(
          value
            .replace(
              /^<!\[CDATA\[([\s\S]*)\]\]>$/,
              "$1",
            )
            .trim(),
        ),
    )
    .filter(Boolean);

}



function normalizeCuit(
  value: unknown,
) {

  return String(
    value ?? "",
  ).replace(
    /\D/g,
    "",
  );

}



function sleep(
  ms: number,
) {

  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms,
      ),
  );

}



async function solicitarTicketNuevo() {

  const privateKeyB64 =
    Deno.env.get(
      "ARCA_PRIVATE_KEY_B64",
    );


  const certB64 =
    Deno.env.get(
      "ARCA_CERT_B64",
    );


  if (
    !privateKeyB64 ||
    !certB64
  ) {

    throw new Error(
      "Faltan las credenciales de ARCA en Supabase",
    );

  }


  const privateKeyPem =
    decodeBase64(
      privateKeyB64,
    );


  const certPem =
    decodeBase64(
      certB64,
    );


  const privateKey =
    forge.pki
      .privateKeyFromPem(
        privateKeyPem,
      );


  const certificate =
    forge.pki
      .certificateFromPem(
        certPem,
      );


  const now =
    new Date();


  const generationTime =
    new Date(
      now.getTime() -
      10 * 60 * 1000,
    ).toISOString();


  const expirationTime =
    new Date(
      now.getTime() +
      10 * 60 * 1000,
    ).toISOString();


  const uniqueId =
    Math.floor(
      Date.now() / 1000,
    ) %
    4294967295;


  const loginTicketRequest =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<loginTicketRequest version="1.0">` +
    `<header>` +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime}</generationTime>` +
    `<expirationTime>${expirationTime}</expirationTime>` +
    `</header>` +
    `<service>${SERVICE}</service>` +
    `</loginTicketRequest>`;


  const p7 =
    forge.pkcs7
      .createSignedData();


  p7.content =
    forge.util
      .createBuffer(
        loginTicketRequest,
        "utf8",
      );


  p7.addCertificate(
    certificate,
  );


  p7.addSigner({

    key:
      privateKey,

    certificate,

    digestAlgorithm:
      forge.pki.oids.sha1,

    authenticatedAttributes: [

      {
        type:
          forge.pki.oids
            .contentType,

        value:
          forge.pki.oids.data,
      },

      {
        type:
          forge.pki.oids
            .messageDigest,
      },

      {
        type:
          forge.pki.oids
            .signingTime,

        value:
          new Date(),
      },

    ],

  });


  p7.sign({
    detached: false,
  });


  const der =
    forge.asn1
      .toDer(
        p7.toAsn1(),
      )
      .getBytes();


  const cmsBase64 =
    forge.util
      .encode64(
        der,
      );


  const soapRequest =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope ` +
    `xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<wsaa:loginCms>` +
    `<wsaa:in0>${escapeXml(
      cmsBase64,
    )}</wsaa:in0>` +
    `</wsaa:loginCms>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;


  const response =
    await fetch(
      WSAA_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "text/xml;charset=UTF-8",

          SOAPAction:
            "",

        },

        body:
          soapRequest,

      },
    );


  const responseText =
    await response.text();


  const fault =
    extractTag(
      responseText,
      "faultstring",
    );


  if (
    !response.ok ||
    fault
  ) {

    throw new Error(
      fault ??
        "ARCA rechazó la solicitud al WSAA",
    );

  }


  const loginCmsReturn =
    extractTag(
      responseText,
      "loginCmsReturn",
    );


  if (
    !loginCmsReturn
  ) {

    throw new Error(
      "WSAA no devolvió un Ticket de Acceso",
    );

  }


  const ticketXml =
    decodeXmlEntities(
      loginCmsReturn,
    );


  const token =
    extractTag(
      ticketXml,
      "token",
    );


  const sign =
    extractTag(
      ticketXml,
      "sign",
    );


  const expiresAt =
    extractTag(
      ticketXml,
      "expirationTime",
    );


  if (
    !token ||
    !sign ||
    !expiresAt
  ) {

    throw new Error(
      "No se pudieron leer las credenciales devueltas por WSAA",
    );

  }


  return {

    token,

    sign,

    expiresAt,

  };

}



async function obtenerTicket(
  supabaseAdmin: any,
) {

  const minimumValidity =
    new Date(
      Date.now() +
      2 * 60 * 1000,
    ).toISOString();


  const {
    data,
    error,
  } =
    await supabaseAdmin

      .from(
        "arca_wsaa_tickets",
      )

      .select(
        "token, sign, expires_at",
      )

      .eq(
        "service",
        SERVICE,
      )

      .gt(
        "expires_at",
        minimumValidity,
      )

      .maybeSingle();


  if (
    error
  ) {

    throw new Error(
      `No se pudo leer el ticket guardado: ${error.message}`,
    );

  }


  if (
    data
  ) {

    return {

      token:
        data.token,

      sign:
        data.sign,

      expiresAt:
        data.expires_at,

    };

  }


  try {

    const ticket =
      await solicitarTicketNuevo();


    const {
      error:
        saveError,
    } =
      await supabaseAdmin

        .from(
          "arca_wsaa_tickets",
        )

        .upsert({

          service:
            SERVICE,

          token:
            ticket.token,

          sign:
            ticket.sign,

          expires_at:
            ticket.expiresAt,

          updated_at:
            new Date()
              .toISOString(),

        });


    if (
      saveError
    ) {

      throw new Error(
        `No se pudo guardar el ticket: ${saveError.message}`,
      );

    }


    return ticket;

  } catch (
    error
  ) {

    const message =
      error instanceof Error
        ? error.message
        : String(error);


    if (
      message
        .toLowerCase()
        .includes(
          "alreadyauthenticated",
        )
    ) {

      await sleep(
        1500,
      );


      const {
        data:
          retryData,
        error:
          retryError,
      } =
        await supabaseAdmin

          .from(
            "arca_wsaa_tickets",
          )

          .select(
            "token, sign, expires_at",
          )

          .eq(
            "service",
            SERVICE,
          )

          .gt(
            "expires_at",
            new Date()
              .toISOString(),
          )

          .maybeSingle();


      if (
        retryError
      ) {

        throw new Error(
          `No se pudo recuperar el ticket guardado: ${retryError.message}`,
        );

      }


      if (
        retryData
      ) {

        return {

          token:
            retryData.token,

          sign:
            retryData.sign,

          expiresAt:
            retryData.expires_at,

        };

      }

    }


    throw error;

  }

}



async function consultarPersona(
  cuit: string,
  cuitRepresentada: string,
  token: string,
  sign: string,
) {

  const soapRequest =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope ` +
    `xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ` +
    `xmlns:a5="http://a5.soap.ws.server.puc.sr/">` +
    `<soapenv:Header/>` +
    `<soapenv:Body>` +
    `<a5:getPersona_v2>` +
    `<token>${escapeXml(
      token,
    )}</token>` +
    `<sign>${escapeXml(
      sign,
    )}</sign>` +
    `<cuitRepresentada>${escapeXml(
      cuitRepresentada,
    )}</cuitRepresentada>` +
    `<idPersona>${escapeXml(
      cuit,
    )}</idPersona>` +
    `</a5:getPersona_v2>` +
    `</soapenv:Body>` +
    `</soapenv:Envelope>`;


  const response =
    await fetch(
      PADRON_URL,
      {

        method:
          "POST",

        headers: {

          "Content-Type":
            "text/xml;charset=UTF-8",

          SOAPAction:
            "",

        },

        body:
          soapRequest,

      },
    );


  const responseText =
    await response.text();


  const fault =
    extractTag(
      responseText,
      "faultstring",
    );


  if (
    !response.ok ||
    fault
  ) {

    throw new Error(
      fault ??
        "ARCA rechazó la consulta de CUIT",
    );

  }


  return responseText;

}



function parseActividades(
  xml: string,
) {

  const bloques = [

    ...extractBlocks(
      xml,
      "actividad",
    ),

    ...extractBlocks(
      xml,
      "actividadMonotributista",
    ),

  ];


  const actividades =
    bloques.map(
      (bloque) => ({

        id:
          extractTag(
            bloque,
            "idActividad",
          ),

        descripcion:
          extractTag(
            bloque,
            "descripcionActividad",
          ),

        periodo:
          extractTag(
            bloque,
            "periodo",
          ),

      }),
    );


  const unicas =
    new Map();


  for (
    const actividad
    of actividades
  ) {

    if (
      !actividad.id &&
      !actividad.descripcion
    ) {

      continue;

    }


    const key =
      `${actividad.id ?? ""}|${actividad.descripcion ?? ""}`;


    if (
      !unicas.has(key)
    ) {

      unicas.set(
        key,
        actividad,
      );

    }

  }


  return [
    ...unicas.values(),
  ];

}



function parseImpuestos(
  xml: string,
) {

  const impuestos =
    extractBlocks(
      xml,
      "impuesto",
    ).map(
      (bloque) => ({

        id:
          extractTag(
            bloque,
            "idImpuesto",
          ),

        descripcion:
          extractTag(
            bloque,
            "descripcionImpuesto",
          ),

        estado:
          extractTag(
            bloque,
            "estadoImpuesto",
          ),

        periodo:
          extractTag(
            bloque,
            "periodo",
          ),

      }),
    );


  const unicos =
    new Map();


  for (
    const impuesto
    of impuestos
  ) {

    if (
      !impuesto.id &&
      !impuesto.descripcion
    ) {

      continue;

    }


    const key =
      `${impuesto.id ?? ""}|${impuesto.descripcion ?? ""}`;


    if (
      !unicos.has(key)
    ) {

      unicos.set(
        key,
        impuesto,
      );

    }

  }


  return [
    ...unicos.values(),
  ];

}



function interpretarPersona(
  xml: string,
  cuitSolicitado: string,
) {

  const persona =
    extractBlock(
      xml,
      "personaReturn",
    );


  if (
    !persona
  ) {

    throw new Error(
      "ARCA respondió sin datos de persona",
    );

  }


  const errorConstancia =
    extractBlock(
      persona,
      "errorConstancia",
    );


  if (
    errorConstancia
  ) {

    const errores =
      extractTags(
        errorConstancia,
        "error",
      );


    return {

      ok:
        true,

      verificado:
        false,

      fuente:
        "ARCA",

      cuit:
        cuitSolicitado,

      motivo:
        errores.length > 0
          ? errores.join(
              " | ",
            )
          : "ARCA no devolvió una constancia válida para ese CUIT",

    };

  }


  const generales =
    extractBlock(
      persona,
      "datosGenerales",
    );


  if (
    !generales
  ) {

    throw new Error(
      "ARCA no devolvió datos generales del contribuyente",
    );

  }


  const domicilio =
    extractBlock(
      generales,
      "domicilioFiscal",
    ) ?? "";


  const regimenGeneral =
    extractBlock(
      persona,
      "datosRegimenGeneral",
    ) ?? "";


  const monotributo =
    extractBlock(
      persona,
      "datosMonotributo",
    ) ?? "";


  const categoriaMono =
    extractBlock(
      monotributo,
      "categoriaMonotributo",
    );


  const razonSocial =
    extractTag(
      generales,
      "razonSocial",
    );


  const nombre =
    extractTag(
      generales,
      "nombre",
    );


  const apellido =
    extractTag(
      generales,
      "apellido",
    );


  const denominacion =
    razonSocial ||
    [
      nombre,
      apellido,
    ]
      .filter(Boolean)
      .join(" ") ||
    null;


  return {

    ok:
      true,

    verificado:
      true,

    fuente:
      "ARCA",


    persona: {

      cuit:
        extractTag(
          generales,
          "idPersona",
        ) ||
        cuitSolicitado,


      denominacion,


      razon_social:
        razonSocial,


      nombre,


      apellido,


      tipo_persona:
        extractTag(
          generales,
          "tipoPersona",
        ),


      tipo_clave:
        extractTag(
          generales,
          "tipoClave",
        ),


      estado_clave:
        extractTag(
          generales,
          "estadoClave",
        ),


      cuit_activo:
        extractTag(
          generales,
          "estadoClave",
        ) ===
        "ACTIVO",


      localidad:
        extractTag(
          domicilio,
          "localidad",
        ),


      provincia:
        extractTag(
          domicilio,
          "descripcionProvincia",
        ),

    },


    situacion_fiscal: {

      regimen_general:
        Boolean(
          regimenGeneral,
        ),


      monotributo:
        Boolean(
          monotributo,
        ),


      categoria_monotributo:
        categoriaMono
          ? {

              id:
                extractTag(
                  categoriaMono,
                  "idCategoria",
                ),

              descripcion:
                extractTag(
                  categoriaMono,
                  "descripcionCategoria",
                ),

              periodo:
                extractTag(
                  categoriaMono,
                  "periodo",
                ),

            }
          : null,

    },


    actividades:
      parseActividades(
        persona,
      ),


    impuestos:
      parseImpuestos(
        persona,
      ),

  };

}



export default {

  fetch:
    withSupabase(

      {

        auth: [
          "user",
          "secret",
        ],

      },


      async (
        req,
        ctx,
      ) => {

        try {

          if (
            req.method !==
            "POST"
          ) {

            return Response.json(

              {

                ok:
                  false,

                error:
                  "Método no permitido",

              },

              {
                status:
                  405,
              },

            );

          }


          let body: any;


          try {

            body =
              await req.json();

          } catch {

            return Response.json(

              {

                ok:
                  false,

                error:
                  "El cuerpo de la solicitud debe ser JSON",

              },

              {
                status:
                  400,
              },

            );

          }


          const cuit =
            normalizeCuit(
              body?.cuit,
            );


          if (
            !/^\d{11}$/.test(
              cuit,
            )
          ) {

            return Response.json(

              {

                ok:
                  false,

                error:
                  "El CUIT debe contener 11 dígitos",

              },

              {
                status:
                  400,
              },

            );

          }


          const cuitRepresentada =
            normalizeCuit(
              Deno.env.get(
                "ARCA_CUIT",
              ),
            );


          if (
            !/^\d{11}$/.test(
              cuitRepresentada,
            )
          ) {

            throw new Error(
              "ARCA_CUIT no está configurado correctamente",
            );

          }


          const ticket =
            await obtenerTicket(
              ctx.supabaseAdmin,
            );


          const respuestaArca =
            await consultarPersona(

              cuit,

              cuitRepresentada,

              ticket.token,

              ticket.sign,

            );


          const resultado =
            interpretarPersona(
              respuestaArca,
              cuit,
            );


          const personaResultado =
            "persona" in resultado
              ? resultado.persona
              : null;


          /*
           * Solamente asociamos el CUIT al perfil
           * cuando:
           *
           * 1. La llamada pertenece a un usuario
           *    autenticado de AluConecta.
           *
           * 2. ARCA encontró una constancia válida.
           *
           * 3. El CUIT está ACTIVO.
           *
           * Las llamadas realizadas con una secret key
           * sirven para pruebas administrativas, pero
           * nunca modifican un perfil.
           */
          if (
            ctx.authMode ===
              "user" &&
            resultado.verificado ===
              true &&
            personaResultado
              ?.cuit_activo ===
              true
          ) {

            const perfilId =
              ctx.userClaims?.id;


            if (
              !perfilId
            ) {

              throw new Error(
                "No se pudo identificar al usuario autenticado",
              );

            }


            const {
              data:
                perfilActualizado,
              error:
                guardarError,
            } =
              await ctx
                .supabaseAdmin

                .from(
                  "perfiles",
                )

                .update({

                  cuit:
                    cuit,

                  cuit_validado:
                    true,

                  denominacion_arca:
                    personaResultado
                      .denominacion ??
                    null,

                  cuit_validado_at:
                    new Date()
                      .toISOString(),

                })

                .eq(
                  "id",
                  perfilId,
                )

                .select(
                  "id",
                )

                .maybeSingle();


            if (
              guardarError
            ) {

              throw new Error(
                `ARCA validó el CUIT pero no se pudo guardar en el perfil: ${guardarError.message}`,
              );

            }


            if (
              !perfilActualizado
            ) {

              throw new Error(
                "ARCA validó el CUIT pero no se encontró el perfil del usuario",
              );

            }

          }


          return Response.json(
            resultado,
          );

        } catch (
          error
        ) {

          const message =
            error instanceof Error
              ? error.message
              : "Error desconocido";


          console.error(
            "verificar-cuit-arca:",
            message,
          );


          return Response.json(

            {

              ok:
                false,

              error:
                "No fue posible completar la verificación con ARCA",

              detalle:
                message,

            },

            {
              status:
                502,
            },

          );

        }

      },

    ),

};
