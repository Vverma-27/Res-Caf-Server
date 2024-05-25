import fbAdmin from "firebase-admin";
// import serviceAccount from "../serviceAccountKey.json";
const serviceAccount = JSON.parse(
  Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON_CONTENT,
    "base64"
  ).toString("utf-8")
);
export default () =>
  fbAdmin.initializeApp({
    //@ts-ignore
    credential: fbAdmin.credential.cert(serviceAccount),
  });
