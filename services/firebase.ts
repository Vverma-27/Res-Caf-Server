import fbAdmin from "firebase-admin"
import serviceAccount from '../serviceAccountKey.json';

export default () => fbAdmin.initializeApp({
    credential: fbAdmin.credential.cert(serviceAccount)
});