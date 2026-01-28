const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('Could not connect to MongoDB:', err));

// Health Check Endpoint
app.get('/api/healthz', (req, res) => {
  res.status(200).json({ ok: true });
});
// Simple UI for Creating a Paste
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>Create a New Paste</h1>
        <form action="/api/pastes" method="POST">
          <textarea name="content" rows="10" cols="50" placeholder="Enter your text here..." required></textarea><br><br>
          <button type="submit">Create Paste</button>
        </form>
      </body>
    </html>
  `);
});

[span_2](start_span)// View a Paste (HTML) - Requirement[span_2](end_span)
app.get('/p/:id', async (req, res) => {
  // Ikkada database nundi paste fetch chesi HTML return chese logic undali
  res.send("<h1>Paste Content will appear here</h1>"); 
});


// Port configuration
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
