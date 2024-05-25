import fbAdmin from "firebase-admin";
import serviceAccount from "../serviceAccountKey.json";

export default () =>
  fbAdmin.initializeApp({
    //@ts-ignore
    credential: fbAdmin.credential.cert(serviceAccount),
  });
