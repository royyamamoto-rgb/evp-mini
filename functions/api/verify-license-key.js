/**
 * Cloudflare Pages Function — License Key Verification
 *
 * Verifies a license key by looking it up as a Stripe customer email
 * or Stripe payment intent. Supports manual key entry for users who
 * purchased Pro but lost their session.
 *
 * Endpoint: POST /api/verify-license-key
 *
 * Accepts:
 *   - Stripe Checkout Session IDs (cs_...)
 *   - Customer email addresses (re-verifies against Stripe)
 *
 * SETUP:
 * In Cloudflare Pages -> Settings -> Environment Variables, add:
 *   STRIPE_SECRET_KEY = sk_live_... (or sk_test_... for testing)
 */

const ALLOWED_ORIGINS = [
  'https://evp-mini.pages.dev',
  'http://localhost:8788',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestPost(context) {
  const corsHeaders = getCorsHeaders(context.request);
  const headers = { 'Content-Type': 'application/json', ...corsHeaders };

  try {
    const stripeKey = context.env.STRIPE_SECRET_KEY;

    if (!stripeKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Verification not configured. Contact support.' }),
        { status: 503, headers }
      );
    }

    let body;
    try {
      body = await context.request.json();
    } catch (_) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request.' }),
        { status: 400, headers }
      );
    }

    const key = (body.license_key || '').trim();

    if (!key) {
      return new Response(
        JSON.stringify({ success: false, error: 'Please enter your license key or purchase email.' }),
        { status: 400, headers }
      );
    }

    // --- Strategy 1: If it looks like a Stripe session ID, verify directly ---
    if (key.startsWith('cs_')) {
      const stripeRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(key)}`,
        { headers: { 'Authorization': `Bearer ${stripeKey}` } }
      );
      const session = await stripeRes.json();

      if (stripeRes.ok && session.payment_status === 'paid') {
        return new Response(
          JSON.stringify({
            success: true,
            email: session.customer_details?.email || null,
            customer_id: session.customer || null,
          }),
          { status: 200, headers }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Session not found or payment incomplete.' }),
        { status: 404, headers }
      );
    }

    // --- Strategy 2: If it looks like an email, search Stripe customers ---
    if (key.includes('@') && key.includes('.')) {
      const searchParams = new URLSearchParams();
      searchParams.append('query', `email:"${key}"`);
      searchParams.append('limit', '1');

      const searchRes = await fetch(
        `https://api.stripe.com/v1/customers/search?${searchParams.toString()}`,
        { headers: { 'Authorization': `Bearer ${stripeKey}` } }
      );
      const searchData = await searchRes.json();

      if (searchRes.ok && searchData.data && searchData.data.length > 0) {
        const customer = searchData.data[0];

        // Verify they have a successful payment for evp-mini-pro
        const paymentsParams = new URLSearchParams();
        paymentsParams.append('customer', customer.id);
        paymentsParams.append('limit', '10');

        const paymentsRes = await fetch(
          `https://api.stripe.com/v1/checkout/sessions?${paymentsParams.toString()}`,
          { headers: { 'Authorization': `Bearer ${stripeKey}` } }
        );
        const paymentsData = await paymentsRes.json();

        if (paymentsRes.ok && paymentsData.data) {
          const paidSession = paymentsData.data.find(
            s => s.payment_status === 'paid'
          );

          if (paidSession) {
            return new Response(
              JSON.stringify({
                success: true,
                email: customer.email,
                customer_id: customer.id,
              }),
              { status: 200, headers }
            );
          }
        }
      }

      return new Response(
        JSON.stringify({ success: false, error: 'No purchase found for this email. Check the email used at checkout.' }),
        { status: 404, headers }
      );
    }

    // --- Strategy 3: Unknown format ---
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Enter the email address you used at checkout, or your Stripe session ID from the confirmation email.',
      }),
      { status: 400, headers }
    );

  } catch (err) {
    console.error('verify-license-key error:', err);
    return new Response(
      JSON.stringify({ success: false, error: 'Verification temporarily unavailable. Please try again.' }),
      { status: 500, headers }
    );
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
}
