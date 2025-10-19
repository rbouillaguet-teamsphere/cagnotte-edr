import Stripe from "stripe";
import admin from "firebase-admin";
import { buffer } from 'micro';

// --- Initialisation Firebase ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    // Debug: Check the private key format
    console.log("Private key first 50 chars:", serviceAccount.private_key.substring(0, 50));
    console.log("Contains \\n:", serviceAccount.private_key.includes('\\n'));
    console.log("Contains actual newline:", serviceAccount.private_key.includes('\n'));
    
    // Fix the private key if needed
    if (serviceAccount.private_key.includes('\\n')) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      console.log("Fixed private key newlines");
    }
    
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