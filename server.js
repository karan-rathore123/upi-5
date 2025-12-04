require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const razorpayRoutes = require('./routes/razorpay/razorpayRoute');

const app = express();

// IMPORTANT: Razorpay webhooks send raw body for signature verification.
// We'll mount JSON/body-parser accordingly per-route.
// For simplicity we use express.json for most endpoints and raw for webhook below.

app.use(cors());

// General JSON parser for normal API routes
app.use(express.json());

// Mount razorpay routes under /api/razorpay
app.use('/api/razorpay', razorpayRoutes);

// Basic root health-check
app.get('/', (req, res) => {
  res.send({ status: 'OK', message: 'Razorpay backend running' });
});

// Error handler (simple)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
