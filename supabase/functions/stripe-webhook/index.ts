// Supabase Edge Function — stripe-webhook/index.ts
// Deploys to: /functions/v1/stripe-webhook
// Called by Stripe after a payment is completed.
// Creates order rows and updates beat status if needed.
//
// Set Edge Function secrets:
//   STRIPE_SECRET_KEY=sk_test_...
//   STRIPE_WEBHOOK_SECRET=whsec_...
//   SUPABASE_SERVICE_ROLE_KEY=...  (from Settings → API)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")             ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature failed:", err);
    return new Response(`Webhook Error: ${err instanceof Error ? err.message : "Invalid"}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // Retrieve line items to get beat/license metadata
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { expand: ["data.price.product"] });

    for (const item of lineItems.data) {
      const product  = item.price?.product as Stripe.Product;
      const metadata = product?.metadata || {};

      if (!metadata.beat_id) continue;

      // Find buyer by email
      const { data: buyerData } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", session.client_reference_id ?? "")
        .single();

      // Insert order row
      await supabaseAdmin.from("orders").insert({
        buyer_id:     buyerData?.id || null,
        beat_id:      metadata.beat_id,
        license_id:   metadata.license_id   || null,
        producer_id:  metadata.producer_id  || null,
        amount:       (item.amount_total ?? 0) / 100,
        license_type: metadata.license_type || "unknown",
        status:       "completed",
      });

      // If exclusive license: deactivate beat
      if (metadata.license_type === "exclusive") {
        await supabaseAdmin
          .from("beats")
          .update({ status: "inactive" })
          .eq("id", metadata.beat_id);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
