const express = require('express');
const cors = require('cors');
const path = require('path');

const scanRoutes = require('./routes/scan');
const excelRoutes = require('./routes/excel');
const leadsRoutes = require('./routes/leads');
const verifyRoutes = require('./routes/verify');
const lookupRoutes = require('./routes/lookup');
const { initDb } = require('./lib/db');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', scanRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/verify', verifyRoutes);
app.use('/api/lookup', lookupRoutes);

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  } else {
    next();
  }
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (kept alive):', reason);
});

initDb()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Lead Extractor Pro running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Database init failed:', err.message);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Lead Extractor Pro running (no DB) at http://0.0.0.0:${PORT}`);
    });
  });
