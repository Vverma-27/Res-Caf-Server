import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { client } from "../../services/mongo";

const restaurantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { uid } = req.headers;
    console.log("🚀 ~ uid:", uid);
    const restaurant = await client
      .db("restaurants")
      .collection("restaurants")
      .findOne({ uids: { $in: [uid] } });
    if (!restaurant) {
      return res.status(403).send("Unauthorized");
    }
    req.headers.name = restaurant.name.toLowerCase();
    next();
  } catch (e) {
    console.error(e);
    res.status(403).send("Unauthorized");
  }
};

export default restaurantMiddleware;
