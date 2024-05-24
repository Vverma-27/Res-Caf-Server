import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { client } from "../../services/mongo";

const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authToken = req.headers.authtoken as string;
    console.log(req.headers.authtoken);
    if (!authToken) {
      return res.status(403).send("Unauthorized");
    }

    const decodedToken = await admin.auth().verifyIdToken(authToken, true);
    const { uid } = decodedToken;

    req.headers.uid = uid;
    console.log("🚀 ~ req.headers.uid:", req.headers.uid);

    next();
  } catch (e) {
    console.error(e);
    res.status(403).send("Unauthorized");
  }
};

export default authMiddleware;
