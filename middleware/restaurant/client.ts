import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { client } from "../../services/mongo";

const restaurantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [name] = req.subdomains.slice(-1);
    req.headers.name = name.toLowerCase();

    // List all databases
    const adminDb = client.db().admin();
    const { databases } = await adminDb.listDatabases();

    // Check if the specified database exists
    const databaseExists = databases.some((db) => db.name === req.headers.name);

    if (!databaseExists) {
      return res.status(403).send("Unauthorized");
    }
    //@ts-ignore
    const db = client.db(name);
    const collections = await db.collections();
    if (collections.length <= 3)
      return res.status(404).send({ msg: "no restaurant found" });

    next();
  } catch (e) {
    console.error(e);
    res.status(403).send("Unauthorized");
  }
};

export default restaurantMiddleware;
