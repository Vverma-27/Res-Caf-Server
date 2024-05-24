import express from "express";
import crypto from "crypto";
import { client } from "../services/mongo";
import { URLSearchParams } from "url";
import fetch from "node-fetch";
import restaurantMiddleware from "../middleware/restaurant/client";
import axios from "axios";
import jsSHA from "jssha";

const PAYU_KEY = "SlETOD";
const PAYU_SALT = "CKKMq7FwcVcnbZ2sC7BSVTpwkpeFoUB2";
const PAYU_URL = "https://test.payu.in/_payment";
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
    this.router.post(`${this.route}/payment/response`, this.paymentResponse);
  }
  private getRestaurant = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      //@ts-ignore
      const db = client.db(name);
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
          PAYU_KEY + // live or test key
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
          PAYU_SALT; // live or test salt

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
    const hashString = `${PAYU_SALT}|${status}|||||||||||${req.body.email}|${req.body.firstname}|${req.body.productinfo}|${amount}|${txnid}|${PAYU_KEY}`;
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
  private paymentResponse = async (req, res) => {
    var pd = req.body;
    // console.log("🚀 ~ RestaurantController ~ paymentResponse= ~ pd:", pd);
    const formData = new URLSearchParams();
    formData.append("key", pd.key);
    formData.append("txnid", pd.txnid);
    formData.append("amount", pd.amount);
    formData.append("productinfo", pd.productinfo);
    formData.append("firstname", pd.firstname);
    formData.append("email", pd.email);
    formData.append("phone", pd.phone);
    formData.append("surl", pd.surl);
    formData.append("furl", pd.furl);
    formData.append("hash", pd.hash);
    formData.append("service_provider", pd.service_provider);

    console.log(
      "🚀 ~ RestaurantController ~ paymentResponse= ~ formData:",
      formData
    );
    //url for test environment is : , change it below
    try {
      const result = await axios.post(PAYU_URL, formData, {
        headers: {
          accept: "text/plain",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      res.send({ url: result.request.res.responseUrl });
    } catch (err) {
      console.log("error", err);
    }
  };
}
export default RestaurantController;
