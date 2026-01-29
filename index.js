require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');

/* ---------- App ---------- */
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ---------- Fetch (for UI -> API) ---------- */
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

/* ---------- DB ---------- */
mongoose.connect(process.env.MONGO_URI);

/* ---------- Schema ---------- */
const pasteSchema = new mongoose.Schema({
  _id: String,
  content: { type: String, required: true },
  createdAt: { type: Date, required: true },
  expiresAt: { type: Date, default: null },
  maxViews: { type: Number, default: null },
  views: { type: Number, default: 0 }
});

const Paste = mongoose.model('Paste', pasteSchema);

/* ---------- Time Helper ---------- */
function now(req) {
  if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
    return new Date(Number(req.headers['x-test-now-ms']));
  }
  return new Date();
}

/* ---------- UI : Home ---------- */
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h2>Create Paste</h2>
        <form method="POST" action="/ui/create">
          <textarea name="content" rows="10" cols="50" required></textarea><br/><br/>
          TTL seconds (optional):
          <input type="number" name="ttl_seconds" min="1"/><br/><br/>
          Max views (optional):
          <input type="number" name="max_views" min="1"/><br/><br/>
          <button type="submit">Create</button>
        </form>
      </body>
    </html>
  `);
});

/* ---------- UI : Create ---------- */
app.post('/ui/create', async (req, res) => {
  const { content, ttl_seconds, max_views } = req.body;

  const response = await fetch(`${process.env.BASE_URL}/api/pastes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      ttl_seconds: ttl_seconds || undefined,
      max_views: max_views || undefined
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return res.send(`<p>Error: ${data.error}</p>`);
  }

  res.send(`
    <p>Paste created ✅</p>
    <a href="${data.url}">${data.url}</a>
  `);
});

/* ---------- Health ---------- */
app.get('/api/healthz', async (req, res) => {
  res.status(200).json({ ok: mongoose.connection.readyState === 1 });
});

/* ---------- Create Paste API ---------- */
app.post('/api/pastes', async (req, res) => {
  const { content, ttl_seconds, max_views } = req.body;

  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Invalid content' });
  }
  if (ttl_seconds && ttl_seconds < 1) {
    return res.status(400).json({ error: 'Invalid ttl_seconds' });
  }
  if (max_views && max_views < 1) {
    return res.status(400).json({ error: 'Invalid max_views' });
  }

  const id = crypto.randomBytes(6).toString('hex');
  const createdAt = new Date();
  const expiresAt = ttl_seconds
    ? new Date(createdAt.getTime() + ttl_seconds * 1000)
    : null;

  await Paste.create({
    _id: id,
    content,
    createdAt,
    expiresAt,
    maxViews: max_views || null
  });

  res.status(201).json({
    id,
    url: `${process.env.BASE_URL}/p/${id}`
  });
});

/* ---------- Fetch Paste API ---------- */
app.get('/api/pastes/:id', async (req, res) => {
  const paste = await Paste.findById(req.params.id);
  if (!paste) return res.status(404).json({ error: 'Not found' });

  const current = now(req);

  if (paste.expiresAt && current > paste.expiresAt) {
    return res.status(404).json({ error: 'Expired' });
  }

  if (paste.maxViews && paste.views >= paste.maxViews) {
    return res.status(404).json({ error: 'View limit exceeded' });
  }

  paste.views += 1;
  await paste.save();

  res.json({
    content: paste.content,
    remaining_views: paste.maxViews
      ? paste.maxViews - paste.views
      : null,
    expires_at: paste.expiresAt
  });
});

/* ---------- View Paste HTML ---------- */
app.get('/p/:id', async (req, res) => {
  const paste = await Paste.findById(req.params.id);
  if (!paste) return res.status(404).send('Not found');

  const current = now(req);

  if (paste.expiresAt && current > paste.expiresAt) {
    return res.status(404).send('Expired');
  }

  if (paste.maxViews && paste.views >= paste.maxViews) {
    return res.status(404).send('Unavailable');
  }

  paste.views += 1;
  await paste.save();

  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <html>
      <body>
        <pre>${paste.content.replace(/</g, '&lt;')}</pre>
      </body>
    </html>
  `);
});

/* ---------- EXPORT FOR VERCEL ---------- */
module.exports = app;

