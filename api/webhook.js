import Stripe from "stripe";
import admin from "firebase-admin";
import { buffer } from 'micro';

// --- Initialisation Firebase ---
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// --- Initialisation Stripe ---
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --- Disable body parsing, need raw body for signature verification ---
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Webhook principal ---
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // Read the raw body as a buffer
    const buf = await buffer(req);
    
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("⚠️ Signature invalide:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // --- Traitement des événements Stripe ---
  if (event.type === "payment_intent.succeeded") {
    const amount = event.data.object.amount_received / 100;
    console.log(`✅ Paiement reçu : ${amount} €`);

    const ref = db.collection("donations").doc("total");
    
    try {
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const current = doc.exists ? doc.data().total || 0 : 0;
        t.set(ref, { total: current + amount }, { merge: true });
      });
      console.log("🔥 Total mis à jour avec succès !");
    } catch (err) {
      console.error("❌ Erreur Firestore:", err);
      return res.status(500).send("Erreur serveur");
    }
  }

  res.status(200).json({ received: true });
}