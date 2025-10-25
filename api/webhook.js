import Stripe from "stripe";
import admin from "firebase-admin";
import { buffer } from 'micro';

// --- Initialisation Firebase ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    // Debug: Check the complete private key
    console.log("Private key length:", serviceAccount.private_key.length);
    console.log("Private key starts with:", serviceAccount.private_key.substring(0, 100));
    console.log("Private key ends with:", serviceAccount.private_key.substring(serviceAccount.private_key.length - 100));
    console.log("Has BEGIN:", serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----'));
    console.log("Has END:", serviceAccount.private_key.includes('-----END PRIVATE KEY-----'));
    
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
  const intent = event.data.object;
  const amount = intent.amount_received / 100;
  const name = intent.metadata?.name || "Anonyme";
  const msg = intent.metadata?.msg || "";
  const date = new Date().toISOString();

  console.log(`✅ Paiement reçu : ${amount} € par ${name}`);

  const ref = db.collection("donations").doc("total");
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    const current = doc.exists ? doc.data().total || 0 : 0;
    t.set(ref, { total: current + amount }, { merge: true });
  });

  // 🔥 Nouveau : enregistrement du don individuel
  await db.collection("donations").add({
    name,
    msg,
    amount,
    date,
  });

  res.status(200).send("ok");
}

      console.log("🔥 Total mis à jour avec succès !");
     catch (err) {
      console.error("❌ Erreur Firestore:", err);
      return res.status(500).send("Erreur serveur");
    }
  

  res.status(200).json({ received: true });
}