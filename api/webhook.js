import Stripe from "stripe";
import admin from "firebase-admin";

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

// --- Webhook principal ---
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
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
        t.set(ref, { total: current + amount }, { merge: true }); // ✅ crée le doc s'il n'existe pas
      });
      console.log("🔥 Total mis à jour avec succès !");
    } catch (err) {
      console.error("❌ Erreur Firestore:", err);
    }
  }

  res.status(200).send("ok");
}

// --- Nécessaire pour Stripe ---
export const config = {
  api: {
    bodyParser: false,
  },
};
