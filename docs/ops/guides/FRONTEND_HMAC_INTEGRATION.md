# Frontend HMAC Integration Guide

## Overview

This document provides the frontend implementation for HMAC signature generation when submitting forms to the secured n8n webhook.

---

## HMAC Secret

**⚠️ SECURITY WARNING:** Never commit the HMAC secret to version control or expose it in client-side code that can be viewed by users.

### Recommended Approaches

1. **Server-side Proxy (RECOMMENDED)**
   - Form submits to your backend
   - Backend generates HMAC and forwards to n8n
   - Secret stays server-side only

2. **Edge Function (Alternative)**
   - Use Vercel Edge, Cloudflare Workers, or similar
   - HMAC generated at the edge
   - No secret in browser

---

## Implementation

### Option 1: Server-Side Proxy (Node.js/Express)

```javascript
// server.js - Backend proxy endpoint
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// HMAC secret from environment variable
const HMAC_SECRET = process.env.WEBHOOK_HMAC_SECRET;
const N8N_WEBHOOK_URL = 'https://n8n.zaplit.com/webhook/consultation';

// Proxy endpoint for form submission
app.post('/api/consultation', async (req, res) => {
  try {
    const payload = req.body;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Generate HMAC signature
    const signature = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    // Forward to n8n with HMAC headers
    const response = await axios.post(N8N_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to submit form'
    });
  }
});

app.listen(3000);
```

```javascript
// Frontend - Submit to your proxy
async function submitConsultationForm(formData) {
  const response = await fetch('/api/consultation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  });
  
  return response.json();
}
```

---

### Option 2: Edge Function (Vercel)

```javascript
// api/consultation.js - Vercel Edge Function
export const config = {
  runtime: 'edge',
};

import { createHmac } from 'crypto';

const HMAC_SECRET = process.env.WEBHOOK_HMAC_SECRET;
const N8N_WEBHOOK_URL = 'https://n8n.zaplit.com/webhook/consultation';

export default async function handler(request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const payload = await request.json();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Generate HMAC signature
    const signature = createHmac('sha256', HMAC_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    // Forward to n8n
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': timestamp
      },
      body: JSON.stringify(payload)
    });
    
    const data = await n8nResponse.json();
    
    return new Response(JSON.stringify(data), {
      status: n8nResponse.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

---

### Option 3: Cloudflare Worker

```javascript
// worker.js - Cloudflare Worker
const HMAC_SECRET = WEBHOOK_HMAC_SECRET; // From Cloudflare Secrets
const N8N_WEBHOOK_URL = 'https://n8n.zaplit.com/webhook/consultation';

async function generateHmac(payload, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(JSON.stringify(payload))
  );
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const payload = await request.json();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      
      // Generate HMAC signature
      const signature = await generateHmac(payload, env.WEBHOOK_HMAC_SECRET);
      
      // Forward to n8n
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': timestamp
        },
        body: JSON.stringify(payload)
      });
      
      const data = await n8nResponse.json();
      
      return new Response(JSON.stringify(data), {
        status: n8nResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};
```

---

## Environment Variables

Add to your deployment environment:

```bash
# Server-side only - never expose to client
WEBHOOK_HMAC_SECRET=<generate-with-openssl-rand-hex-32>
N8N_WEBHOOK_URL=https://n8n.zaplit.com/webhook/consultation
```

Generate a new HMAC secret:
```bash
openssl rand -hex 32
```

---

## Testing

### Test HMAC Generation

```javascript
// test-hmac.js
const crypto = require('crypto');

const secret = 'your-test-secret';
const payload = { name: 'Test User', email: 'test@example.com' };

const signature = crypto
  .createHmac('sha256', secret)
  .update(JSON.stringify(payload))
  .digest('hex');

console.log('Payload:', JSON.stringify(payload));
console.log('Signature:', signature);
console.log('Timestamp:', Math.floor(Date.now() / 1000));
```

### Test Webhook with cURL

```bash
# Generate signature
PAYLOAD='{"name":"Test User","email":"test@example.com","company":"Test Co"}'
SECRET="your-hmac-secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)
TIMESTAMP=$(date +%s)

# Send request
curl -X POST https://n8n.zaplit.com/webhook/consultation \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -H "X-Webhook-Timestamp: $TIMESTAMP" \
  -d "$PAYLOAD"
```

---

## Security Checklist

- [ ] HMAC secret stored in environment variables only
- [ ] Secret never exposed in client-side code
- [ ] HTTPS only (no HTTP fallback)
- [ ] Timestamp validation enabled (prevent replay attacks)
- [ ] Rate limiting implemented on proxy endpoint
- [ ] CORS properly configured
- [ ] Logging enabled for audit trail

---

## Migration from Unsecured Webhook

1. Deploy HMAC-enabled workflow to n8n
2. Update frontend to use proxy/edge function
3. Test in staging environment
4. Update production webhook URL if needed
5. Monitor for errors
6. Disable old unsecured workflow after verification

---

## Troubleshooting

### "Invalid HMAC signature" Error

- Verify secret matches between frontend and n8n
- Check payload is stringified consistently
- Ensure headers are being passed correctly

### "Request timestamp too old" Error

- Check system clocks are synchronized
- Increase tolerance window if needed (in workflow code)
- Verify timestamp is in seconds (not milliseconds)

### 401 Unauthorized

- Verify basic auth credentials are included
- Check credentials are configured in n8n
