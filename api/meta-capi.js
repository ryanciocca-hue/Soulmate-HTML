const https = require('https');

const PIXEL_ID = '605945393647072';
const API_VERSION = 'v18.0';

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

  if (!ACCESS_TOKEN) {
    console.error('META_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const { event_name, event_time, event_source_url, user_data, custom_data } = req.body;

    // Extract the actual client IP from x-forwarded-for (first entry is the client).
    // This preserves IPv6 addresses when users connect over IPv6.
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : req.headers['x-real-ip'] || 'unknown';

    // Build the event payload
    const eventData = {
      event_name,
      event_time: event_time || Math.floor(Date.now() / 1000),
      event_source_url,
      action_source: 'website',
      user_data: {
        client_ip_address: clientIp,
        client_user_agent: req.headers['user-agent'],
        ...user_data
      }
    };

    // Add custom_data if provided (for InitiateCheckout, Purchase, etc.)
    if (custom_data) {
      eventData.custom_data = custom_data;
    }

    const payload = JSON.stringify({
      data: [eventData],
      access_token: ACCESS_TOKEN
    });

    // Send to Meta Conversions API
    const result = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/${API_VERSION}/${PIXEL_ID}/events`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ raw: data });
          }
        });
      });

      request.on('error', reject);
      request.write(payload);
      request.end();
    });

    return res.status(200).json({ success: true, result });

  } catch (error) {
    console.error('CAPI Error:', error);
    return res.status(500).json({ error: 'Failed to send event' });
  }
}
