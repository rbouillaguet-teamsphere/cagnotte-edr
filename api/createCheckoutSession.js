import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Méthode non autorisée");

  const { name, msg, amount } = req.body;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      success_url: `${req.headers.origin}/?success=true`,
      cancel_url: `${req.headers.origin}/?canceled=true`,
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "Don École de Rugby ROC Giffois" },
            unit_amount: amount * 100, // montant en centimes
          },
          quantity: 1,
        },
      ],
      metadata: { name, msg },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
