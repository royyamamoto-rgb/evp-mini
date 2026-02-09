/**
 * Cloudflare Pages Function — Stripe Checkout Session Creator
 *
 * Creates a one-time $4.99 Stripe Checkout Session for EVP-MINI Pro.
 * Endpoint: POST /api/create-checkout
 *
 * SETUP:
 * In Cloudflare Pages -> Settings -> Environment Variables, add:
 *   STRIPE_SECRET_KEY  = sk_live_... (or sk_test_... for testing)
 *   STRIPE_PRICE_ID    = price_...  (your Stripe Price object ID)
 *
 * NOTE: Uses Stripe REST API directly via fetch(). No npm packages.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * POST /api/create-checkout
 *
 * Creates a Stripe Checkout Session and returns the redirect URL.
 * Request body: (none required — price is server-side)
 * Response: { url: "https://checkout.stripe.com/c/pay/cs_..." }
 */
export async function onRequestPost(context) {
  const headers = {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
  };

  try {
    const stripeKey = context.env.STRIPE_SECRET_KEY;
    const priceId = context.env.STRIPE_PRICE_ID;

    // --- Guard: env vars must be configured ---
    if (!stripeKey || !priceId) {
      const missing = [];
      if (!stripeKey) missing.push('STRIPE_SECRET_KEY');
      if (!priceId) missing.push('STRIPE_PRICE_ID');

      return new Response(
        JSON.stringify({
          success: false,
          error: `Payment system not configured. Missing: ${missing.join(', ')}. Contact support.`,
        }),
        { status: 503, headers }
      );
    }

    // --- Determine base URL for success/cancel redirects ---
    // Use the Origin header from the request so it works in both
    // production (evp-mini.pages.dev) and preview deployments.
    const origin =
      context.request.headers.get('Origin') ||
      'https://evp-mini.pages.dev';

    const successUrl = `${origin}/?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?canceled=true`;

    // --- Build URL-encoded body for the Stripe API ---
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('payment_method_types[0]', 'card');
    params.append('metadata[product]', 'evp-mini-pro');

    // --- Call Stripe Checkout Sessions API ---
    const stripeRes = await fetch(
      'https://api.stripe.com/v1/checkout/sessions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );

    const session = await stripeRes.json();

    // --- Handle Stripe-level errors ---
    if (!stripeRes.ok) {
      console.error('Stripe API error:', JSON.stringify(session));

      // Surface a safe message (never leak the raw Stripe error to the client)
      const clientMessage =
        stripeRes.status === 401
          ? 'Payment configuration error. Contact support.'
          : 'Unable to create checkout session. Please try again.';

      return new Response(
        JSON.stringify({ success: false, error: clientMessage }),
        { status: 502, headers }
      );
    }

    // --- Validate that Stripe returned a usable URL ---
    if (!session.url) {
      console.error('Stripe session missing URL:', JSON.stringify(session));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Checkout session created but no redirect URL returned.',
        }),
        { status: 502, headers }
      );
    }

    // --- Success ---
    return new Response(
      JSON.stringify({ url: session.url }),
      { status: 200, headers }
    );

  } catch (err) {
    console.error('create-checkout error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Payment service temporarily unavailable. Please try again.',
      }),
      { status: 500, headers }
    );
  }
}

/**
 * OPTIONS /api/create-checkout — CORS preflight
 */
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
