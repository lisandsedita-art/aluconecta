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
        /^<!CDATA\[([\s\S]*)\]>$/,
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
              /^<!CDATA\[([\s\S]*)\]>$/,
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


 
