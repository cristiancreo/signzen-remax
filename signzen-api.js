/**
 * signzen-api.js
 * Integración con la API de SignZen — Plantillas REMAX Argentina.
 *
 * Soporta 1, 2 o 3 firmantes usando las plantillas remax1p / remax2p / remax3p.
 *
 * NOTA DE SEGURIDAD: Las credenciales están aquí para entorno de demo.
 * En producción deben moverse a un backend o variable de entorno.
 */

'use strict';

/* ── Configuración ─────────────────────────────────────────────────── */
const SIGNZEN_URL  = 'https://signzen-process-api.signzen-demo.com.ar/api/Processes';
const SIGNZEN_USER = 'ccreo@grupolpa.com';
const SIGNZEN_PASS = '12345678';

/** Configuración por cantidad de firmantes */
const TEMPLATES = {
  1: {
    templateKey:        'remax1p',
    groupId:            'd7230a45-84f9-4572-972c-678947f70852',
    documentTemplateId: '5bf06170-954f-42ca-a18a-eecdbe87ec26',
  },
  2: {
    templateKey:        'remax2p',
    groupId:            'd7230a45-84f9-4572-972c-678947f70852', // TODO: reemplazar con el ID real de 2P
    documentTemplateId: '5bf06170-954f-42ca-a18a-eecdbe87ec26', // TODO: reemplazar con el ID real de 2P
  },
  3: {
    templateKey:        'remax3p',
    groupId:            'd7230a45-84f9-4572-972c-678947f70852', // TODO: reemplazar con el ID real de 3P
    documentTemplateId: '5bf06170-954f-42ca-a18a-eecdbe87ec26', // TODO: reemplazar con el ID real de 3P
  },
};

/* ── Helpers ────────────────────────────────────────────────────────── */

/**
 * Devuelve la fecha y hora actual formateada como "DD/MM/YYYY HH:MM:SS hs".
 */
function fechaActual() {
  const now = new Date();
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
function construirBody(firmantes, base64Doc) {
  const n        = firmantes.length;
  const template = TEMPLATES[n];

  if (!template) {
    throw new Error(`Cantidad de firmantes no soportada: ${n}. Máximo permitido: 3.`);
  }

  const { templateKey, groupId, documentTemplateId } = template;
  const fecha = fechaActual();

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
  const forms = firmantes.map((f, i) => ({
    stepKey: `participante${i + 1}`,
    formKey: 'formulario evidencias',
    fields: [
      { key: `firmante${i + 1}`, value: `Identificador Firmante ${i + 1}` },
      { key: `NomyApe${i + 1}`,  value: `Nombre y Apellido: ${f.nombre} ${f.apellido}` },
      { key: `email${i + 1}`,    value: `Email: ${f.email}` },
      { key: `fecha${i + 1}`,    value: `Fecha de Firma: ${fecha}` },
    ],
    markAsCompleted: true,
  }));

  return {
    groupId,
    templateKey,
    title:        'Firma de Documento REMAX',
    description:  'Firma de Documento REMAX',
    externalCode: EXTERNAL_CODE,
    sender:       SENDER,
    expiresAt:    EXPIRES_AT,
    participants,
    forms,
    documents: [
      {
        documentTemplateId,
        type:   'Base64',
        base64: base64Doc,
      },
    ],
    metadata: [
      { key: 'anexo',             value: '1'     },
      { key: 'automaticApproval', value: 'false' },
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
async function enviarSignZen(firmantes, docFile) {
  const base64Doc = await archivoABase64(docFile);
  const body = construirBody(firmantes, base64Doc);

  const credenciales = btoa(`${SIGNZEN_USER}:${SIGNZEN_PASS}`);

  const response = await fetch(SIGNZEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credenciales}`,
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
