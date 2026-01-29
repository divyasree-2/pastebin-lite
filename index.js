require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Schema matching Assignment Specs [cite: 59, 60]
const pasteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  content: { type: String, required: true },
  expires_at: { type: Date, default: null }, // [cite: 60]
  max_views: { type: Number, default: null },
  remaining_views: { type: Number, default: null } // [cite: 59, 63]
});

const Paste = mongoose.model('Paste', pasteSchema);

mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error(err));

// Helper: Deterministic Time Logic [cite: 78, 79, 80, 81, 82]
const getNow = (req) => {
  if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
    return new Date(parseInt(req.headers['x-test-now-ms']));
  }
  return new Date();
};

// 2. Health Check [cite: 27, 28, 34]
app.get('/api/healthz', async (req, res) => {
  try {
    const isConnected = mongoose.connection.readyState === 1;
    res.status(200).json({ ok: isConnected });
  } catch (e) {
    res.status(200).json({ ok: false });
  }
});

// 3. Create Paste [cite: 36, 44, 45, 46, 50, 51]
app.post('/api/pastes', async (req, res) => {
  const { content, ttl_seconds, max_views } = req.body;

  // Validation [cite: 44, 45, 46]
  if (!content || typeof content !== 'string' || content.trim() === "") {
    return res.status(400).json({ error: "content is required and must be non-empty" });
  }

  const id = uuidv4();
  const pasteData = {
    id,
    content,
    max_views: max_views ? parseInt(max_views) : null,
    remaining_views: max_views ? parseInt(max_views) : null
  };

  if (ttl_seconds) {
    const now = getNow(req);
    pasteData.expires_at = new Date(now.getTime() + parseInt(ttl_seconds) * 1000);
  }

  const newPaste = await Paste.create(pasteData);
  const baseUrl = process.env.BASE_URL || `http://${req.get('host')}`;

  res.status(201).json({ 
    id: newPaste.id, 
    url: `${baseUrl}/p/${newPaste.id}` 
  });
});

// 4. Fetch Paste API [cite: 55, 65, 71]
app.get('/api/pastes/:id', async (req, res) => {
  const paste = await Paste.findOne({ id: req.params.id });
  const now = getNow(req);

  // Check Availability [cite: 68, 69, 70]
  if (!paste || 
      (paste.expires_at && now > paste.expires_at) || 
      (paste.max_views !== null && paste.remaining_views <= 0)) {
    return res.status(404).json({ error: "Paste unavailable" });
  }

  // Update views [cite: 65, 114]
  if (paste.max_views !== null) {
    paste.remaining_views -= 1;
    await paste.save();
  }

  res.status(200).json({
    content: paste.content,
    remaining_views: paste.remaining_views,
    expires_at: paste.expires_at
  });
});

// 5. View HTML [cite: 74, 75, 76]
app.get('/p/:id', async (req, res) => {
  const paste = await Paste.findOne({ id: req.params.id });
  const now = getNow(req);

  if (!paste || 
      (paste.expires_at && now > paste.expires_at) || 
      (paste.max_views !== null && paste.remaining_views <= 0)) {
    return res.status(404).send("<h1>404 Not Found</h1>");
  }

  // Safe Rendering 
  const safeContent = paste.content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  res.status(200).send(`<html><body><pre>${safeContent}</pre></body></html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
