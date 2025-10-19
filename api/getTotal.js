import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_ADMIN_KEY))
  });
}

export default async function handler(req, res) {
  try {
    const db = getFirestore();
    const doc = await db.collection("donations").doc("total").get();
    const total = doc.exists ? doc.data().total || 0 : 0;
    res.status(200).json({ total });
  } catch (error) {
    console.error("Erreur getTotal:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
}
