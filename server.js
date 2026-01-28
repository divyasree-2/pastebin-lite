const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

[span_1](start_span)[span_2](start_span)// MongoDB Schema with TTL and View Limits[span_1](end_span)[span_2](end_span)
const pasteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  [span_3](start_span)expiresAt: { type: Date }, // Time-based expiry[span_3](end_span)
  [span_4](start_span)maxViews: { type: Number }, // View-count limit[span_4](end_span)
  currentViews: { type: Number, default: 0 }
});
const Paste = mongoose.model('Paste', pasteSchema);

mongoose.connect(process.env.MONGODB_URI);

[span_5](start_span)// 1. Health check - GET /api/healthz[span_5](end_span)
app.get('/api/healthz', async (req, res) => {
  try {
    await mongoose.connection.db.admin().ping();
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false });
  }
});

[span_6](start_span)// 2. Create a paste - POST /api/pastes[span_6](end_span)
app.post('/api/pastes', async (req, res) => {
  const { content, ttl_seconds, max_views } = req.body;
  
  if (!content || typeof content !== 'string') {
    [span_7](start_span)return res.status(400).json({ error: "Content is required" }); //[span_7](end_span)
  }

  const id = uuidv4().slice(0, 8);
  const pasteData = { id, content };

  if (ttl_seconds) {
    pasteData.expiresAt = new Date(Date.now() + ttl_seconds * 1000); [span_8](start_span)//[span_8](end_span)
  }
  if (max_views) {
    pasteData.maxViews = parseInt(max_views); [span_9](start_span)//[span_9](end_span)
  }

  const newPaste = new Paste(pasteData);
  await newPaste.save();

  const baseUrl = process.env.BASE_URL || `https://${req.get('host')}`;
  res.status(201).json({ id, url: `${baseUrl}/p/${id}` }); [span_10](start_span)//[span_10](end_span)
});

[span_11](start_span)// 3. Fetch a paste (API) - GET /api/pastes/:id[span_11](end_span)
app.get('/api/pastes/:id', async (req, res) => {
  const paste = await Paste.findOne({ id: req.params.id });
  [span_12](start_span)const now = req.headers['x-test-now-ms'] ? new Date(parseInt(req.headers['x-test-now-ms'])) : new Date(); //[span_12](end_span)

  if (!paste || 
      (paste.expiresAt && now > paste.expiresAt) || 
      (paste.maxViews && paste.currentViews >= paste.maxViews)) {
    return res.status(404).json({ error: "Paste unavailable" }); [span_13](start_span)//[span_13](end_span)
  }

  paste.currentViews += 1; [span_14](start_span)// Each fetch counts as a view[span_14](end_span)
  await paste.save();

  res.json({
    content: paste.content,
    remaining_views: paste.maxViews ? paste.maxViews - paste.currentViews : null,
    expires_at: paste.expiresAt || null
  });
});

[span_15](start_span)// 4. View a paste (HTML) - GET /p/:id[span_15](end_span)
app.get('/p/:id', async (req, res) => {
  const paste = await Paste.findOne({ id: req.params.id });
  if (!paste) return res.status(404).send("Not Found");

  [span_16](start_span)// Render content safely (simple escaping)[span_16](end_span)
  const safeContent = paste.content.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  res.send(`<html><body><pre>${safeContent}</pre></body></html>`);
});

[span_17](start_span)// Simple UI for the Home Page[span_17](end_span)
app.get('/', (req, res) => {
  res.send(`
    <h1>Pastebin Lite</h1>
    <form action="/api/pastes" method="POST">
      <textarea name="content" rows="10" cols="50" required></textarea><br>
      TTL (sec): <input type="number" name="ttl_seconds"><br>
      Max Views: <input type="number" name="max_views"><br>
      <button type="submit">Create Paste</button>
    </form>
  `);
});

app.listen(process.env.PORT || 3000);
