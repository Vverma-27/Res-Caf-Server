import config from "../config";
import { MongoClient } from "mongodb";

const client = new MongoClient(`mongodb+srv://${config.MONGO_USER}:${config.MONGO_PASSWORD}@cluster0.oqrrw96.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`);
const initializeClient = async () => { client.connect(); }
export { client };
export default initializeClient;