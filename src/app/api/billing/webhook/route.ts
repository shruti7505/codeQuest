import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stripeEvents, users } from "@/db/schema";

export async function POST(request: NextRequest) {
  const key = process.env.STRIPE_SECRET_KEY, secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature." }, { status: 400 });
  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return NextResponse.json({ error: "Invalid signature." }, { status: 400 }); }
  try {
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(stripeEvents).values({ id: event.id }).onConflictDoNothing().returning();
      if (!inserted.length) return;
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId, plan = session.metadata?.plan;
        if (userId && plan && ["bronze", "silver", "gold"].includes(plan) && (session.payment_status === "paid" || session.payment_status === "no_payment_required")) {
          await tx.update(users).set({ plan, subscriptionStatus: "active", stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id, stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id }).where(eq(users.id, userId));
        }
      }
      if (event.type === "customer.subscription.deleted") {
        const subscription = event.data.object as Stripe.Subscription;
        await tx.update(users).set({ plan: "free", subscriptionStatus: "canceled", stripeSubscriptionId: null }).where(eq(users.stripeSubscriptionId, subscription.id));
      }
      if (event.type === "customer.subscription.updated") {
        const subscription = event.data.object as Stripe.Subscription;
        const active = ["active", "trialing"].includes(subscription.status);
        const plan = subscription.metadata.plan;
        await tx.update(users).set({ subscriptionStatus: subscription.status, ...(active && ["bronze", "silver", "gold"].includes(plan) ? { plan } : !active && ["canceled", "unpaid", "incomplete_expired"].includes(subscription.status) ? { plan: "free" } : {}) }).where(eq(users.stripeSubscriptionId, subscription.id));
      }
      if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object as Stripe.Invoice;
        const customer = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customer) await tx.update(users).set({ subscriptionStatus: "past_due" }).where(eq(users.stripeCustomerId, customer));
      }
    });
    return NextResponse.json({ received: true });
  } catch (error) { console.error("Stripe webhook", error); return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 }); }
}
