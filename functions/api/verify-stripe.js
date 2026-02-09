/**
 * Cloudflare Pages Function — Stripe Checkout Session Verification
 *
 * Verifies that a Stripe Checkout Session completed payment successfully.
 * Endpoint: POST /api/verify-stripe
 *
 * SETUP:
 * In Cloudflare Pages -> Settings -> Environment Variables, add:
 *   STRIPE_SECRET_KEY = sk_live_... (or sk_test_... for testing)
 *
 * NOTE: Uses Stripe REST API directly via fetch(). No npm packages.
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

/**
 * POST /api/verify-stripe
 *
 * Verifies a completed Stripe Checkout Session.
 * Request body: { "session_id": "cs_test_..." }
 * Response (success): { success: true, email: "...", customer_id: "cus_..." }
 * Response (failure): { success: false, error: "..." }
 */
export async function onRequestPost(context) {
  const corsHeaders = getCorsHeaders(context.request);
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders,
  };

  try {
    const stripeKey = context.env.STRIPE_SECRET_KEY;

    // --- Guard: env var must be configured ---
    if (!stripeKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment verification not configured. Missing: STRIPE_SECRET_KEY. Contact support.',
        }),
        { status: 503, headers }
      );
    }

    // --- Parse and validate request body ---
    let body;
    try {
      body = await context.request.json();
    } catch (_) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body. Expected JSON with session_id.',
        }),
        { status: 400, headers }
      );
    }

    const sessionId = (body.session_id || '').trim();

    if (!sessionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing session_id' }),
        { status: 400, headers }
      );
    }

    // --- Basic format check to avoid wasting an API call ---
    if (!sessionId.startsWith('cs_')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid session_id format. Expected a Stripe Checkout Session ID (cs_...).',
        }),
        { status: 400, headers }
      );
    }

    // --- Retrieve the Checkout Session from Stripe ---
    const stripeRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
        },
      }
    );

    const session = await stripeRes.json();

    // --- Handle Stripe-level errors ---
    if (!stripeRes.ok) {
      console.error('Stripe API error:', JSON.stringify(session));

      if (stripeRes.status === 404) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Checkout session not found. It may have expired.',
          }),
          { status: 404, headers }
        );
      }

      if (stripeRes.status === 401) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Payment verification configuration error. Contact support.',
          }),
          { status: 502, headers }
        );
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unable to verify payment. Please try again.',
        }),
        { status: 502, headers }
      );
    }

    // --- Verify metadata matches our product (optional safety check) ---
    const expectedProduct = 'evp-mini-pro';
    if (session.metadata && session.metadata.product && session.metadata.product !== expectedProduct) {
      console.error(
        `Product mismatch: expected "${expectedProduct}", got "${session.metadata.product}"`
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Session does not belong to this product.',
        }),
        { status: 403, headers }
      );
    }

    // --- Check payment status ---
    if (session.payment_status === 'paid') {
      return new Response(
        JSON.stringify({
          success: true,
          email: session.customer_details?.email || null,
          customer_id: session.customer || null,
        }),
        { status: 200, headers }
      );
    }

    // --- Payment not completed ---
    // Map Stripe's payment_status to a human-readable message
    const statusMessages = {
      unpaid: 'Payment has not been completed.',
      no_payment_required: 'No payment was required for this session.',
    };
    const message =
      statusMessages[session.payment_status] ||
      `Payment not completed (status: ${session.payment_status}).`;

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 402, headers }
    );

  } catch (err) {
    console.error('verify-stripe error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Payment verification temporarily unavailable. Please try again.',
      }),
      { status: 500, headers }
    );
  }
}

/**
 * OPTIONS /api/verify-stripe — CORS preflight
 */
export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  });
}
