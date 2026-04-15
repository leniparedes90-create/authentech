const crypto = require('crypto');

const FLOW_API_KEY    = process.env.FLOW_API_KEY    || '1F402ED2-E92D-4020-9E5F-1L9B7BD972D1';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || 'b6f3b96fac6ac03304212e310830f1a4f7b3dc85';
const FLOW_API_URL    = 'https://www.flow.cl/api';

// Build HMAC-SHA256 signature required by Flow
function signParams(params, secret) {
  const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
  return crypto.createHmac('sha256', secret).update(sorted).digest('hex');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const { orderId, amount, currency, email, subject, customerName } = body;

    if (!orderId || !amount || !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan datos requeridos' })
      };
    }

    const siteUrl = process.env.URL || 'https://authentechpe.com';

    const params = {
      apiKey:          FLOW_API_KEY,
      commerceOrder:   orderId,
      subject:         subject || 'AuthenTech — Software Premium',
      currency:        currency || 'USD',
      amount:          String(Math.round(parseFloat(amount) * 100) / 100),
      email:           email,
      urlConfirmation: `${siteUrl}/.netlify/functions/flow-webhook`,
      urlReturn:       `${siteUrl}/checkout/gracias?order=${orderId}`,
      optional:        JSON.stringify({ customerName: customerName || '' }),
    };

    params.s = signParams(params, FLOW_SECRET_KEY);

    // Send to Flow API
    const formBody = Object.entries(params)
      .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
      .join('&');

    const response = await fetch(`${FLOW_API_URL}/payment/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody
    });

    const data = await response.json();

    if (!data.token || !data.url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: data.message || 'Error creando orden en Flow', raw: data })
      };
    }

    // Return payment URL to redirect customer
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        paymentUrl: `${data.url}?token=${data.token}`,
        token: data.token,
        orderId: orderId
      })
    };

  } catch (err) {
    console.error('flow-create error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Error interno', detail: err.message })
    };
  }
};
