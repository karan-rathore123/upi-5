const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const router = express.Router();
const bodyParser = require('body-parser');

const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, WEBHOOK_SECRET, PDF_BASE_URL } = process.env;

if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
  console.warn('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET not set in env. Create .env or set in Render dashboard.');
}

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID || '',
  key_secret: RAZORPAY_KEY_SECRET || ''
});

/**
 * POST /api/razorpay/create-order
 * Body: { amount: number, currency?: 'INR', receipt?: string, notes?: object }
 * amount must be in rupees (we convert to paise)
 */
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;
    if (!amount || typeof amount !== 'number') {
      return res.status(400).json({ error: 'amount (number, in rupees) is required' });
    }

    const options = {
      amount: Math.round(amount * 100), // paise
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
      payment_capture: 1,
      notes: notes || {}
    };

    const order = await razorpay.orders.create(options);
    // return order object to frontend
    res.json({ success: true, order });
  } catch (err) {
    console.error('create-order error:', err);
    res.status(500).json({ success: false, error: 'Could not create order' });
  }
});

/**
 * POST /api/razorpay/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * This endpoint verifies the payment signature returned after payment on frontend.
 * On success, respond with final asset URL (example: download link of PDF)
 */
router.post('/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    const generated_signature = crypto
      .createHmac('sha256', RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated_signature === razorpay_signature) {
      // verification success
      // build a file / PDF download URL based on order id
      // PDF_BASE_URL is an env var you should set to the domain or S3 bucket hosting your PDFs
      // Example PDF URL: `${PDF_BASE_URL}/${razorpay_order_id}.pdf`
      const pdfUrl = PDF_BASE_URL
        ? `${PDF_BASE_URL.replace(/\/$/, '')}/${razorpay_order_id}.pdf`
        : `https://example.com/downloads/${razorpay_order_id}.pdf`;

      return res.json({ success: true, message: 'Payment verified', pdfUrl });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (err) {
    console.error('verify error:', err);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

/**
 * Raw body parser for webhook, because signature uses raw payload
 * POST /api/razorpay/webhook
 */
router.post(
  '/webhook',
  bodyParser.raw({ type: '*/*' }),
  (req, res) => {
    try {
      const secret = WEBHOOK_SECRET || '';
      const signature = req.headers['x-razorpay-signature'];
      const body = req.body; // raw Buffer

      if (!secret) {
        console.warn('WEBHOOK_SECRET not set; webhook signature cannot be verified securely.');
      }

      const expected = crypto
        .createHmac('sha256', secret)
        .update(body)
        .digest('hex');

      if (signature === expected) {
        const payload = JSON.parse(body.toString('utf8'));
        // TODO: handle webhook events (payment.captured, payment.failed, order.paid, etc)
        console.log('Verified webhook event:', payload.event);
        // example: save to DB, update order status, send notification, generate PDF, etc.

        return res.status(200).json({ ok: true });
      } else {
        console.warn('Webhook signature mismatch');
        return res.status(400).json({ ok: false, error: 'Invalid signature' });
      }
    } catch (err) {
      console.error('webhook error:', err);
      return res.status(500).json({ ok: false });
    }
  }
);

module.exports = router;
