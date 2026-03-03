const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const METABASE_URL = process.env.METABASE_URL || 'https://reports.xindus.net';
const MB_USERNAME  = process.env.MB_USERNAME  || 'roshan@xindus.net';
const MB_PASSWORD  = process.env.MB_PASSWORD  || 'hPoCdfHl2lBgTn';

let sessionToken = null, tokenExpiry = 0;

async function getToken() {
  if (sessionToken && Date.now() < tokenExpiry) return sessionToken;
  const res = await fetch(`${METABASE_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: MB_USERNAME, password: MB_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const data = await res.json();
  sessionToken = data.id;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  console.log('[proxy] Token obtained');
  return sessionToken;
}

async function mb(method, path, body) {
  const token = await getToken();
  const res = await fetch(`${METABASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

app.get('/health',    async (_, res) => res.json({ ok: true, time: new Date() }));

app.get('/databases', async (_, res) => {
  try { res.json(await mb('GET', '/api/database')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/tables', async (_, res) => {
  try { res.json(await mb('GET', '/api/table')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/cards', async (_, res) => {
  try { res.json(await mb('GET', '/api/card')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/query', async (req, res) => {
  try {
    const { database, sql } = req.body;
    if (!database || !sql) return res.status(400).json({ error: 'database and sql required' });
    res.json(await mb('POST', '/api/dataset', {
      database, type: 'native', native: { query: sql }
    }));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[proxy] Running on port ${PORT}`));
