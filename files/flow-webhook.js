const crypto = require('crypto');

const FLOW_API_KEY    = process.env.FLOW_API_KEY    || '1F402ED2-E92D-4020-9E5F-1L9B7BD972D1';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || 'b6f3b96fac6ac03304212e310830f1a4f7b3dc85';
const FLOW_API_URL    = 'https://www.flow.cl/api';
const SHEETS_URL      = process.env.SHEETS_URL || 'https://script.google.com/macros/s/AKfycbzFFp4GbgS3ykVzSOqJzbhZIOFx8i7GNBHvLHJelhJmUnzA4JPWu0e46i1ESi-RCNDJ/exec';

function signParams(params, secret) {
  const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
  return crypto.createHmac('sha256', secret).update(sorted).digest('hex');
}

async function getPaymentStatus(token) {
  const params = { apiKey: FLOW_API_KEY, token };
  params.s = signParams(params, FLOW_SECRET_KEY);
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${FLOW_API_URL}/payment/getStatus?${qs}`);
  return res.json();
}

exports.handler = async (event) => {
  // Flow sends POST with token when payment is confirmed
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const token = params.get('token');

    if (!token) {
      return { statusCode: 400, body: 'Missing token' };
    }

    // Get payment status from Flow
    const status = await getPaymentStatus(token);
    console.log('Flow webhook status:', JSON.stringify(status));

    // status.status: 1=pending, 2=paid, 3=rejected, 4=cancelled
    if (status.status === 2) {
      // Payment confirmed — notify Google Sheets
      const orderData = {
        _action: 'flow_confirmed',
        orderId: status.commerceOrder,
        token: token,
        amount: status.amount,
        currency: status.currency,
        payerEmail: status.payer,
        flowOrder: status.flowOrder,
        date: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' }),
        status: 'PAGADO'
      };

      // Notify Google Sheets (fire and forget)
      fetch(SHEETS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      }).catch(err => console.warn('Sheets notify error:', err));
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('flow-webhook error:', err);
    return { statusCode: 500, body: 'Error' };
  }
};
