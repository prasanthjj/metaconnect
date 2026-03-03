process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

const METABASE_URL = process.env.METABASE_URL || 'https://reports.xindus.net';
const MB_USERNAME  = process.env.MB_USERNAME  || 'saurabh@xindus.net';
const MB_PASSWORD  = process.env.MB_PASSWORD  || 'gtEynUQf9T8sMH';

console.log('[startup] METABASE_URL:', METABASE_URL);
console.log('[startup] MB_USERNAME:', MB_USERNAME);
console.log('[startup] MB_PASSWORD set:', !!MB_PASSWORD);

let sessionToken = null, tokenExpiry = 0;

async function getToken() {
  console.log('[getToken] Checking token... expired?', Date.now() >= tokenExpiry);
  if (sessionToken && Date.now() < tokenExpiry) {
    console.log('[getToken] Reusing existing token');
    return sessionToken;
  }

  const loginUrl = `${METABASE_URL}/api/session`;
  console.log('[getToken] POSTing to:', loginUrl);

  let res;
  try {
    res = await fetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: MB_USERNAME, password: MB_PASSWORD }),
    });
  } catch (fetchErr) {
    console.error('[getToken] fetch() threw:', fetchErr.message);
    throw fetchErr;
  }

  console.log('[getToken] Response status:', res.status);
  const raw = await res.text();
  console.log('[getToken] Response body:', raw);

  if (!res.ok) throw new Error(`Auth failed ${res.status}: ${raw}`);

  const data = JSON.parse(raw);
  sessionToken = data.id;
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  console.log('[getToken] Token obtained:', sessionToken?.slice(0, 8) + '...');
  return sessionToken;
}

async function mb(method, path, body) {
  console.log(`[mb] ${method} ${path}`);
  const token = await getToken();
  const url = `${METABASE_URL}${path}`;
  console.log('[mb] Fetching:', url);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Metabase-Session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (fetchErr) {
    console.error('[mb] fetch() threw:', fetchErr.message);
    throw fetchErr;
  }

  console.log(`[mb] ${path} -> status ${res.status}`);
  if (!res.ok) {
    const err = await res.text();
    console.error(`[mb] Error body:`, err);
    throw new Error(`${path} -> ${res.status}: ${err}`);
  }
  return res.json();
}

app.get('/health', async (_, res) => {
  // Test if we can reach Metabase at all
  try {
    const r = await fetch(`${METABASE_URL}/api/health`);
    const text = await r.text();
    res.json({ ok: true, metabase_status: r.status, metabase_body: text.slice(0, 200) });
  } catch(e) {
    res.json({ ok: false, error: e.message, metabase_url: METABASE_URL });
  }
});

app.get('/databases', async (_, res) => {
  console.log('[route] GET /databases');
  try {
    const data = await mb('GET', '/api/database');
    res.json(data);
  } catch(e) {
    console.error('[route] /databases error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/tables', async (_, res) => {
  console.log('[route] GET /tables');
  try {
    const data = await mb('GET', '/api/table');
    res.json(data);
  } catch(e) {
    console.error('[route] /tables error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/cards', async (_, res) => {
  console.log('[route] GET /cards');
  try {
    const data = await mb('GET', '/api/card');
    res.json(data);
  } catch(e) {
    console.error('[route] /cards error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/query', async (req, res) => {
  console.log('[route] POST /query', req.body);
  try {
    const { database, sql } = req.body;
    if (!database || !sql) return res.status(400).json({ error: 'database and sql required' });
    const data = await mb('POST', '/api/dataset', {
      database, type: 'native', native: { query: sql }
    });
    res.json(data);
  } catch(e) {
    console.error('[route] /query error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[startup] Proxy listening on port ${PORT}`);
  console.log('[startup] Routes: GET /health /databases /tables /cards, POST /query');
});

