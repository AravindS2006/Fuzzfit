import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/db';
export async function POST(request: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET)
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  if (await db.webhookEvent.findUnique({ where: { id: event.id } }))
    return NextResponse.json({ ok: true });
  try {
    const subscriptionEvents = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
    ];
    let subscription: Stripe.Subscription | null = null;
    if (subscriptionEvents.includes(event.type)) {
      const source = event.data.object as Stripe.Subscription;
      subscription = await stripe.subscriptions.retrieve(source.id);
    }
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const id =
        typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
      if (id) subscription = await stripe.subscriptions.retrieve(id);
    }
    await db.$transaction(async (tx) => {
      if (await tx.webhookEvent.findUnique({ where: { id: event.id } })) return;
      if (subscription) {
        const customerId =
          typeof subscription.customer === 'string'
            ? subscription.customer
            : subscription.customer.id;
        const existing = await tx.billingSubscription.findUnique({ where: { customerId } });
        if (!existing) throw new Error('Billing customer is not registered');
        await tx.billingSubscription.update({
          where: { id: existing.id },
          data: { subscriptionId: subscription.id, status: subscription.status },
        });
      }
      await tx.webhookEvent.create({ data: { id: event.id } });
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Webhook processing failed; retry required.' },
      { status: 500 },
    );
  }
}
