import Stripe from "stripe";
import admin from "firebase-admin";
import { buffer } from "micro";

// --- Initialisation Firebase ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // Debug (facultatif)
    console.log("Private key length:", serviceAccount.private_key.length);
    console.log("Has BEGIN:", serviceAccount.private_key.includes("BEGIN"));
    console.log("Has END:", serviceAccount.private_key.includes("END"));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase initialized successfully");
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    throw error;
  }
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("⚠️ Signature invalide:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const amount = intent.amount_received / 100;
      const name = intent.metadata?.name || "Anonyme";
      const msg = intent.metadata?.msg || "";
      const date = new Date().toISOString();

      console.log(`✅ Paiement reçu : ${amount} € par ${name}`);

      // 🔥 Transaction pour total
      const ref = db.collection("donations").doc("total");
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const current = doc.exists ? doc.data().total || 0 : 0;
        t.set(ref, { total: current + amount }, { merge: true });
      });

      // 🔥 Nouveau don individuel
      await db.collection("donations").add({
        name,
        msg,
        amount,
        date,
      });

      console.log("🔥 Total mis à jour avec succès !");
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Erreur Firestore:", err);
    return res.status(500).send("Erreur serveur");
  }
}
