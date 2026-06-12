/**
 * signzen-api.js
 * Integración con la API de SignZen — Plantillas REMAX Argentina.
 *
 * Soporta 1, 2 o 3 firmantes usando las plantillas remax1p / remax2p / remax3p.
 *
 * Este archivo corre en el BROWSER. No contiene credenciales.
 * Las llamadas a SignZen se delegan al proxy n8n (flow 2),
 * que agrega las credenciales de forma segura en el servidor.
 */

'use strict';

/* ── Configuración ─────────────────────────────────────────────────── */

/** URL del webhook proxy en n8n (Flow 2). Ajustar con el dominio real. */
const N8N_PROXY_URL = 'https://square-regular-honeybee.ngrok-free.app/webhook/remax/enviar';

const EXTERNAL_CODE = '1976';



/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Devuelve la fecha y hora actual formateada como "DD/MM/YYYY HH:MM:SS hs".
 */
function fechaActual(minutosExtra = 0) {
  const now = new Date(Date.now() + minutosExtra * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} hs`
  );
}

/**
 * Convierte un objeto File a su representación Base64 (sin el prefijo data-URI).
 *
 * @param {File} file
 * @returns {Promise<string>} Cadena Base64 pura.
 */
function archivoABase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

/* ── Construcción del body ──────────────────────────────────────────── */

/**
 * Construye el body JSON para la API de SignZen.
 *
 * @param {Array<{nombre: string, apellido: string, dni: string, email: string}>} firmantes
 * @param {string} base64Doc - Contenido del documento en Base64.
 * @returns {Object} Body listo para JSON.stringify().
 */
function construirBody(firmantes, base64Doc, tipoDocumento, nroOperacion) {
  const n           = firmantes.length;
  const groupId     = window.REMAX_GROUP_ID;
  const templateKey = `remax${n}p`;

  if (!groupId) {
    throw new Error('groupId no disponible. Verifique el parámetro en la URL.');
  }
  if (n < 1 || n > 10) {
    throw new Error(`Cantidad de firmantes no soportada: ${n}. Máximo permitido: 10.`);
  }

  /* Array de participantes — uno por firmante */
  const participants = firmantes.map((f, i) => ({
    key: `participante${i + 1}`,
    participants: [
      {
        /*
         * Nota: en el schema de SignZen "name" recibe el Apellido
         * y "surname" recibe el Nombre (convención del template REMAX).
         */
        name:    f.apellido,
        surname: f.nombre,
        email:   f.email,
        phone:   '',          // No requerido en esta demo
      },
    ],
  }));

  /* Array de formularios — uno por firmante */
  const forms = firmantes.map((f, i) => {
    const fecha = fechaActual(i + 1); // +1 min por participante
    return {
      stepKey: `participante${i + 1}`,
      formKey: 'formulario evidencias',
      fields: [
        { key: `firmante${i + 1}`, value: `Identificador Firmante ${i + 1}` },
        { key: `NomyApe${i + 1}`,  value: `Nombre y Apellido: ${f.nombre} ${f.apellido}` },
        { key: `email${i + 1}`,    value: `Email: ${f.email}` },
        { key: `fecha${i + 1}`,    value: `Fecha de Firma: ${fecha}` },
      ],
      markAsCompleted: true,
    };
  });

  return {
    groupId,
    templateKey,
    title:        `${tipoDocumento} — Op. ${nroOperacion}`,
    description:  `${tipoDocumento} — Ref. ${nroOperacion}`,
    externalCode: EXTERNAL_CODE,
    sender:       '',
    expiresAt:    '',
    participants,
    forms,
    documents: [
      {
        type:   'Base64',
        base64: base64Doc,
      },
    ],
    metadata: [
      { key: 'anexo',             value: '1'           },
      { key: 'automaticApproval', value: 'false'        },
      { key: 'tipoDocumento',     value: tipoDocumento  },
      { key: 'nroOperacion',      value: nroOperacion   },
    ],
  };
}

/* ── Función principal ──────────────────────────────────────────────── */

/**
 * Convierte el documento a Base64, arma el body y hace POST a la API de SignZen.
 *
 * @param {Array<{nombre: string, apellido: string, dni: string, email: string}>} firmantes
 * @param {File} docFile - Archivo cargado desde el input.
 * @returns {Promise<Object>} Respuesta de la API parseada como JSON.
 * @throws {Error} Si la respuesta HTTP no es 2xx.
 */
async function enviarSignZen(firmantes, docFile, tipoDocumento, nroOperacion) {
  const base64Doc = await archivoABase64(docFile);
  const body = construirBody(firmantes, base64Doc, tipoDocumento, nroOperacion);

  // Las credenciales las agrega el proxy n8n — este fetch no lleva Authorization.
  const response = await fetch(N8N_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detalle = '';
    try { detalle = await response.text(); } catch (_) { /* ignorar */ }
    throw new Error(`Error ${response.status} ${response.statusText}${detalle ? ': ' + detalle : ''}`);
  }

  return response.json();
}
