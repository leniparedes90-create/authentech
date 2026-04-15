const crypto = require('crypto');

const FLOW_API_KEY    = process.env.FLOW_API_KEY    || '1F402ED2-E92D-4020-9E5F-1L9B7BD972D1';
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY || 'b6f3b96fac6ac03304212e310830f1a4f7b3dc85';
const FLOW_API_URL    = 'https://www.flow.cl/api';

function signParams(params, secret) {
  const sorted = Object.keys(params).sort().map(k => k + params[k]).join('');
  return crypto.createHmac('sha256', secret).update(sorted).digest('hex');
}

exports.handler = async (event) => {
  const token = event.queryStringParameters?.token;
  if (!token) return { statusCode: 400, body: JSON.stringify({ error: 'Missing token' }) };

  try {
    const params = { apiKey: FLOW_API_KEY, token };
    params.s = signParams(params, FLOW_SECRET_KEY);
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${FLOW_API_URL}/payment/getStatus?${qs}`);
    const data = await res.json();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
