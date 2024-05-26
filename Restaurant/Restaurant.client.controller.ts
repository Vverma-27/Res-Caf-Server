import express from "express";
import crypto from "crypto";
import { client } from "../services/mongo";
import { URLSearchParams } from "url";
import fetch from "node-fetch";
import restaurantMiddleware from "../middleware/restaurant/client";
import axios from "axios";
import jsSHA from "jssha";

class RestaurantController {
  private router: express.Router;
  private route = "/restaurant/client";
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }
  private initializeRoutes() {
    this.router.get(`${this.route}/`, restaurantMiddleware, this.getRestaurant);
    this.router.post(
      `${this.route}/payment`,
      restaurantMiddleware,
      this.makePayment
    );
    this.router.post(`${this.route}/payment/success`, this.paymentSuccess);
    this.router.post(`${this.route}/payment/failure`, this.paymentFail);
  }
  private getRestaurant = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      console.log("🚀 ~ RestaurantController ~ name:", name);
      //@ts-ignore
      const db = client.db(name);
      const collections = await db.collections();
      if (collections.length <= 3)
        return res.status(404).json({ msg: "no restaurant found" });
      let menuRes;
      menuRes = await db
        .collection("categories")
        .aggregate([
          {
            $lookup: {
              from: "dishes",
              localField: "dishes",
              foreignField: "_id",
              as: "dishes",
            },
          },
        ])
        .toArray();
      const menu = menuRes.reduce((acc, category) => {
        acc[category.name] = {
          _id: category._id,
          dishes: category.dishes,
        };
        return acc;
      }, {});
      res.json({ menu, name });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  private makePayment = async (req, res) => {
    try {
      if (
        !req.body.txnid ||
        !req.body.amount ||
        !req.body.productinfo ||
        !req.body.firstname ||
        !req.body.email
      ) {
        res.send("Mandatory fields missing");
      } else {
        const pd = req.body;
        const hashString =
          process.env.PAYU_KEY + // live or test key
          "|" +
          pd.txnid +
          "|" +
          pd.amount +
          "|" +
          pd.productinfo +
          "|" +
          pd.firstname +
          "|" +
          pd.email +
          "|" +
          "||||||||||" +
          process.env.PAYU_SALT; // live or test salt

        // Create a SHA-512 hash using the crypto library
        var sha = new jsSHA("SHA-512", "TEXT"); //encryption taking place
        sha.update(hashString);
        var hash = sha.getHash("HEX"); //hashvalue converted to hexvalue
        res.send({ hash: hash }); // Hash value is sent as response
      }
    } catch (error) {
      console.log("Error payment:", error);
      res.status(500).send("Internal Server Error");
    }
  };
  private paymentSuccess = async (req, res) => {
    const { status, txnid, amount, hash } = req.body;

    // Verify hash
    const hashString = `${process.env.PAYU_SALT}|${status}|||||||||||${req.body.email}|${req.body.firstname}|${req.body.productinfo}|${amount}|${txnid}|${process.env.PAYU_KEY}`;
    const expectedHash = crypto
      .createHash("sha512")
      .update(hashString)
      .digest("hex");
    console.log(req.body);
    if (hash === expectedHash) {
      console.log("success");
      // Payment successful
      res.json({ success: true, message: "Payment successful" });
    } else {
      // Invalid hash
      res.json({ success: false, message: "Invalid hash" });
    }
  };
  private paymentFail = async (req, res) => {
    try {
      console.log(req.body);
      res.json({ status: "failed" });
    } catch (error) {}
  };
}
export default RestaurantController;
