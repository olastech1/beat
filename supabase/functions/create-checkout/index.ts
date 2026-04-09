// Supabase Edge Function — create-checkout/index.ts
// Deploys to: /functions/v1/create-checkout
// Creates a Stripe Checkout Session and returns the redirect URL.
//
// Set Edge Function secrets in Supabase Dashboard → Edge Functions → Secrets:
//   STRIPE_SECRET_KEY=sk_test_...
//   STRIPE_PUBLISHABLE_KEY=pk_test_...

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { items, customer_email, success_url, cancel_url } = await req.json();

    if (!items || items.length === 0) {
      throw new Error("No items in cart");
    }

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
  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
