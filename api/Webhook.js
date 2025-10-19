import Stripe from "stripe";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY))
  });
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const rawBody = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });

    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("⚠️ Signature invalide:", err.message);
    return res.status(400).send(`Erreur Webhook: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded") {
    const amount = event.data.object.amount_received / 100;
    console.log(`✅ Paiement reçu : ${amount} €`);

    const db = getFirestore();
    const ref = db.collection("donations").doc("total");
    await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      const current = doc.exists ? doc.data().total || 0 : 0;
      t.set(ref, { total: current + amount });
    });
  }

  res.status(200).send("OK");
}
