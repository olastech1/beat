// Supabase Edge Function — create-checkout/index.ts
// Deploys to: /functions/v1/create-checkout
// Creates a Stripe Checkout Session and returns the redirect URL.
//
// The Stripe secret key can come from:
//   1. Environment variable STRIPE_SECRET_KEY (recommended for production)
//   2. Request body field `stripe_secret_key` (fallback, set via admin panel)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { items, customer_email, success_url, cancel_url, stripe_secret_key } = body;

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

    // Resolve Stripe secret key: env var takes priority, then request body fallback
    const sk = Deno.env.get("STRIPE_SECRET_KEY") || stripe_secret_key || "";
    if (!sk || sk === "sk_test_YOUR_SECRET_KEY") {
      throw new Error("Stripe secret key not configured. Set it in Admin → Settings → Stripe Integration, or as an Edge Function secret.");
    }

    const stripe = new Stripe(sk, {
      apiVersion: "2024-06-20",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Build Stripe line items
    const lineItems = items.map((item: {
      name: string; amount: number; currency: string;
      quantity: number; metadata: Record<string,string>;
    }) => ({
      price_data: {
        currency:     item.currency || "usd",
        unit_amount:  item.amount,
        product_data: {
          name:     item.name,
          metadata: item.metadata,
        },
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items:           lineItems,
      mode:                 "payment",
      customer_email:       customer_email || undefined,
      success_url:          success_url + "&session_id={CHECKOUT_SESSION_ID}",
      cancel_url:           cancel_url,
      metadata:             { source: "beatmarket" },
    });

    return new Response(
      JSON.stringify({ session_id: session.id, url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("create-checkout error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
