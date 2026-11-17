import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY || !user.stripeCustomerId) return NextResponse.json({ invoices: [], configured: !!process.env.STRIPE_SECRET_KEY });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const invoices = await stripe.invoices.list({ customer: user.stripeCustomerId, limit: 20 });
    return NextResponse.json({ configured: true, invoices: invoices.data.map((invoice) => ({ id: invoice.id, number: invoice.number, amount: invoice.amount_paid, currency: invoice.currency, status: invoice.status, created: invoice.created, pdf: invoice.invoice_pdf, url: invoice.hosted_invoice_url })) });
  } catch { return NextResponse.json({ error: "Unable to load billing history." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Stripe is not configured yet. Add your Stripe keys and price IDs to enable secure checkout." }, { status: 503 });
  if (!user.email) return NextResponse.json({ error: "Create an account with an email before managing a subscription." }, { status: 400 });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const body = await request.json();
    const base = process.env.APP_URL || request.nextUrl.origin;
    if (body.action === "portal") {
      if (!user.stripeCustomerId) return NextResponse.json({ error: "There is no billing account to manage yet." }, { status: 400 });
      const portal = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: base });
      return NextResponse.json({ url: portal.url });
    }
    const prices: Record<string, string | undefined> = { bronze: process.env.STRIPE_BRONZE_PRICE_ID, silver: process.env.STRIPE_SILVER_PRICE_ID, gold: process.env.STRIPE_GOLD_PRICE_ID };
    const plan = String(body.plan || "");
    const price = prices[plan];
    console.log("Selected plan:", plan);
console.log("Price ID:", price);

if (price) {
  const stripePrice = await stripe.prices.retrieve(price);
  console.log("Price details:", {
    id: stripePrice.id,
    type: stripePrice.type,
    recurring: stripePrice.recurring,
    active: stripePrice.active,
  });
}
    if (!price) return NextResponse.json({ error: "This plan's Stripe price ID has not been configured." }, { status: 503 });
    if (user.subscriptionStatus === "active") return NextResponse.json({ error: "Use Manage billing to change your existing subscription." }, { status: 400 });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", line_items: [{ price, quantity: 1 }],
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: user.email }),
      client_reference_id: user.id, metadata: { userId: user.id, plan }, subscription_data: { metadata: { userId: user.id, plan } },
      success_url: `${base}/?billing=success`, cancel_url: `${base}/?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) { console.error("Billing", error); return NextResponse.json({ error: "Unable to start billing. Check your Stripe configuration." }, { status: 500 }); }
}
