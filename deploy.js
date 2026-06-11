/**
 * deploy.js
 * Construye los flows y los publica directo a n8n via REST API.
 *
 * Uso:
 *   $env:N8N_API_KEY = "tu-api-key"   # PowerShell
 *   node deploy.js          # despliega ambos flows
 *   node deploy.js 1        # solo Flow 1 (frontend)
 *   node deploy.js 2        # solo Flow 2 (proxy SignZen)
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

/* ── Config ── */
const N8N_HOST       = 'n8n.aditus.com.ar';
const WORKFLOW_ID_1  = 'nbLOcJhZavEiOxGS';   // Flow 1: Frontend
const WORKFLOW_ID_2  = 'UwXiDEBkNrMcFwbD';   // Flow 2: Proxy SignZen

/* Leer .env si existe y la var no está ya seteada */
if (!process.env.N8N_API_KEY) {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const [k, ...v] = line.trim().split('=');
      if (k && v.length) process.env[k] = v.join('=');
    }
  }
}
const API_KEY = process.env.N8N_API_KEY;

if (!API_KEY) {
  console.error('ERROR: Falta N8N_API_KEY. Ejecutá primero:');
  console.error('  $env:N8N_API_KEY = "tu-api-key"');
  process.exit(1);
}

const DIR    = __dirname;
const target = process.argv[2]; // '1', '2', o undefined (ambos)

/* ── Helper: PUT a n8n ── */
function deployFlow(workflowId, flowObj, label) {
  return new Promise((resolve, reject) => {
    // n8n rechaza campos read-only en el body del PUT
    const { id, versionId, meta, tags, active, ...payload } = flowObj;
    const body = Buffer.from(JSON.stringify(payload));
    const options = {
      hostname: N8N_HOST,
      path: `/api/v1/workflows/${workflowId}`,
      method: 'PUT',
      headers: {
        'Content-Type':   'application/json',
        'X-N8N-API-KEY':  API_KEY,
        'Content-Length': body.length,
      },
    };

    console.log(`Desplegando ${label} (${workflowId})...`);
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`  OK — HTTP ${res.statusCode}. ${label} actualizado.`);
          resolve();
        } else {
          console.error(`  ERROR — HTTP ${res.statusCode}`);
          console.error('  ' + data.slice(0, 500));
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/* ── Build Flow 1 (Frontend) ── */
function buildFlow1() {
  let html = fs.readFileSync(path.join(DIR, 'firma-documento.html'), 'utf8');
  let api  = fs.readFileSync(path.join(DIR, 'signzen-api.js'), 'utf8');

  html = html.replace(/\r\n/g, '\n');
  api  = api.replace(/\r\n/g, '\n');

  html = html.replace(
    /https:\/\/[a-z0-9-]+\.ngrok-free\.app\/webhook\/remax\/enviar/g,
    'https://n8n.aditus.com.ar/webhook/remax/enviar'
  );
  api = api.replace(
    /https:\/\/[a-z0-9-]+\.ngrok-free\.app\/webhook\/remax\/enviar/g,
    'https://n8n.aditus.com.ar/webhook/remax/enviar'
  );

  const inlineScript = `<script>\n${api}\n  </script>`;
  html = html.replace('<script src="signzen-api.js"></script>', inlineScript);

  const jsCode = `return [{ json: { html: ${JSON.stringify(html)} } }];`;

  const flow = {
    name: "REMAX — 1. Servir Frontend (HTML embebido)",
    nodes: [
      {
        parameters: { httpMethod: "GET", path: "remax", responseMode: "responseNode", options: {} },
        id: "11111111-1111-1111-1111-111111111111",
        name: "GET /remax",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [250, 300],
        webhookId: "22222222-2222-2222-2222-222222222222"
      },
      {
        parameters: { mode: "runOnceForAllItems", jsCode },
        id: "33333333-3333-3333-3333-333333333333",
        name: "HTML embebido",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [470, 300]
      },
      {
        parameters: {
          respondWith: "text",
          responseBody: "={{ $json.html }}",
          options: { responseHeaders: { entries: [
            { name: "Content-Type", value: "text/html; charset=utf-8" },
            { name: "Cache-Control", value: "no-store" }
          ]}}
        },
        id: "44444444-4444-4444-4444-444444444444",
        name: "Responder HTML",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1,
        position: [690, 300]
      }
    ],
    pinData: {},
    connections: {
      "GET /remax":    { main: [[{ node: "HTML embebido",  type: "main", index: 0 }]] },
      "HTML embebido": { main: [[{ node: "Responder HTML", type: "main", index: 0 }]] }
    },
    settings: { executionOrder: "v1" }
  };

  /* Guardar JSON local */
  fs.writeFileSync(path.join(DIR, 'n8n-flow-1-frontend.json'),
    JSON.stringify({ ...flow,
      active: false,
      versionId: "55555555-5555-5555-5555-555555555555",
      meta: { templateCredsSetupCompleted: true },
      id: "remax-frontend-flow",
      tags: []
    }, null, 2), 'utf8');

  return flow;
}

/* ── Build Flow 2 (Proxy) — se lee del JSON existente ── */
function buildFlow2() {
  const raw = fs.readFileSync(path.join(DIR, 'n8n-flow-2-proxy.json'), 'utf8');
  return JSON.parse(raw);
}

/* ── Main ── */
async function main() {
  const tasks = [];
  if (!target || target === '1') tasks.push({ id: WORKFLOW_ID_1, flow: buildFlow1(), label: 'Flow 1 (Frontend)' });
  if (!target || target === '2') tasks.push({ id: WORKFLOW_ID_2, flow: buildFlow2(), label: 'Flow 2 (Proxy SignZen)' });

  for (const t of tasks) {
    await deployFlow(t.id, t.flow, t.label);
  }
  console.log('\nDeploy completado.');
}

main().catch(e => { console.error(e.message); process.exit(1); });
