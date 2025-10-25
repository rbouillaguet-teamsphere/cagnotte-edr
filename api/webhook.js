import Stripe from "stripe";
import admin from "firebase-admin";
import { buffer } from "micro";

// --- Initialisation Firebase ---
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase initialized successfully");
}

const db = admin.firestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Méthode non autorisée");
  }

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("⚠️ Signature invalide:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // --- Paiement réussi ---
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object;
      const amount = intent.amount_received / 100;

      const ref = db.collection("donations").doc("total");
      await db.runTransaction(async (t) => {
        const doc = await t.get(ref);
        const current = doc.exists ? doc.data().total || 0 : 0;
        t.set(ref, { total: current + amount }, { merge: true });
      });

      console.log(`✅ Total mis à jour : +${amount} €`);
    }

    // --- Session Checkout complétée ---
    else if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const amount = session.amount_total / 100;
      const name = session.metadata?.name || "Anonyme";
      const msg = session.metadata?.msg || "";
      const date = new Date().toISOString();

      await db.collection("donations").add({
        name,
        msg,
        amount,
        date,
      });

      console.log(`💛 Nouveau don enregistré : ${name} (${amount} €)`);
    }

    else {
      console.log(`ℹ️ Événement ignoré : ${event.type}`);
    }

    res.status(200).send("ok");
  } catch (err) {
    console.error("❌ Erreur Firestore:", err);
    res.status(500).send("Erreur serveur");
  }
}
