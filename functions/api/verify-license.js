/**
 * Cloudflare Pages Function — Gumroad License Verification
 *
 * Validates license keys against Gumroad's API.
 * Endpoint: POST /api/verify-license
 *
 * SETUP:
 * 1. Create your product on Gumroad (https://gumroad.com)
 * 2. Enable "Generate a unique license key per sale" in product settings
 * 3. In Cloudflare Pages → Settings → Environment Variables, add:
 *    GUMROAD_PRODUCT_ID = your Gumroad product permalink (e.g. "evp-mini-pro")
 */

export async function onRequestPost(context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await context.request.json();
    const licenseKey = (body.license_key || '').trim();

    if (!licenseKey) {
      return new Response(JSON.stringify({ success: false, error: 'Missing license key' }), {
        status: 400, headers
      });
    }

    const productId = context.env.GUMROAD_PRODUCT_ID;
    if (!productId) {
      // Gumroad not configured yet — return helpful error
      return new Response(JSON.stringify({
        success: false,
        error: 'License verification not configured. Contact support.'
      }), { status: 503, headers });
    }

    // Call Gumroad License Verification API
    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        product_id: productId,
        license_key: licenseKey,
        increment_uses_count: 'true'
      })
    });

    const data = await gumroadRes.json();

    if (data.success === true) {
      return new Response(JSON.stringify({
        success: true,
        email: data.purchase?.email || null,
        uses: data.uses || 1
      }), { headers });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Invalid license key. Check your purchase confirmation email.'
    }), { status: 401, headers });

  } catch (e) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Verification temporarily unavailable. Try again.'
    }), { status: 500, headers });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
