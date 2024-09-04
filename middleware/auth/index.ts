import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { client } from "../../services/mongo";
import { ObjectId } from "mongodb";
import { ROLES } from "../../Restaurant/Restaurant.interfaces";

const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authToken = req.headers.authtoken as string;
    // console.log(req.headers.authtoken);
    if (!authToken) {
      return res.status(403).send("Unauthorized");
    }

    const decodedToken = await admin.auth().verifyIdToken(authToken, true);
    const { uid } = decodedToken;

    req.headers.uid = uid;
    // console.log("🚀 ~ req.headers.uid:", req.headers.uid);

    next();
  } catch (e) {
    console.error(e);
    res.status(403).send("Unauthorized");
  }
};

export const roleMiddleware =
  (requiredRole: ROLES) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const { name, uid } = req.headers;
    // console.log("🚀 ~ uid:", uid);
    const db = client.db(name as string);
    const user = await db.collection("employees").findOne({ _id: uid });
    if (!user) return res.status(404).json({ err: "User not found" });
    const { role } = user;
    if (requiredRole !== role && requiredRole === ROLES.ADMIN) {
      return res.status(403).send("Unauthorized");
    } else {
      req.headers.role = role;
      next();
    }
  };

export default authMiddleware;
