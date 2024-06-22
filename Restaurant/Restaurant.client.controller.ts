import express from "express";
import crypto from "crypto";
import { client } from "../services/mongo";
import { URLSearchParams } from "url";
import fetch from "node-fetch";
import restaurantMiddleware from "../middleware/restaurant/client";
import axios from "axios";
import jsSHA from "jssha";
import { ObjectId } from "mongodb";
import { Cashfree } from "cashfree-pg";

Cashfree.XClientId = process.env.CASHFREE_XCLIENT_ID;
Cashfree.XClientSecret = process.env.CASHFREE_XCLIENT_SECRET;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;

class RestaurantController {
  private router: express.Router;
  private route = "/restaurant/client";
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }
  private initializeRoutes() {
    this.router.get(`${this.route}/`, restaurantMiddleware, this.getRestaurant);
    this.router.post(`${this.route}/`, restaurantMiddleware, this.createClient);
    this.router.get(
      `${this.route}/orders`,
      restaurantMiddleware,
      this.getPastOrders
    );
    this.router.post(
      `${this.route}/payment`,
      restaurantMiddleware,
      this.makePayment
    );
    this.router.post(
      `${this.route}/payment/order`,
      restaurantMiddleware,
      this.createOrderCashfree
    );
    this.router.post(`${this.route}/payment/success`, this.paymentSuccess);
    this.router.post(`${this.route}/payment/failure`, this.paymentFail);
  }
  private getPastOrders = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      console.log("🚀 ~ RestaurantController ~ name:", name);
      const { uid } = req.cookies;
      //@ts-ignore
      const db = client.db(name);
      const collections = await db.collections();
      if (collections.length <= 3)
        return res.status(404).send({ msg: "no restaurant found" });
      const orders = await db
        .collection("orders")
        .find({ client: uid })
        .project({ list: 1 })
        .toArray();

      res.json({ orders });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  private createOrderCashfree = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      const pd = req.body;
      if (
        !pd.amount ||
        !pd.customer_id ||
        !pd.number ||
        !pd.name ||
        !pd.email ||
        !pd.txnid ||
        !pd.productinfo
      ) {
        res.send("Mandatory fields missing");
      } else {
        const request = {
          order_amount: parseFloat(parseInt(pd.amount).toFixed(2)),
          order_currency: "INR",
          order_id: `order_${name}_${pd.txnid}`,
          customer_details: {
            customer_id: pd.customer_id,
            customer_phone: pd.number,
            customer_name: pd.name,
            customer_email: pd.email,
          },
          order_meta: {
            return_url:
              "https://www.cashfree.com/devstudio/preview/pg/web/checkout?order_id={order_id}",
            notify_url:
              "https://www.cashfree.com/devstudio/preview/pg/webhooks/69734225",
          },
          // order_expiry_time: "2024-06-08T20:35:31.523Z",
          order_note: pd.productinfo,
          order_tags: {
            restaurant: name as string,
            items: pd.productinfo,
          },
        };
        const { data: order } = await Cashfree.PGCreateOrder(
          "2023-08-01",
          request
        );
        console.log("🚀 ~ RestaurantController ~ order:", order);
        res.json({ session_id: order.payment_session_id });
      }
    } catch (error) {
      console.log("Error payment:", error);
      res.status(500).send("Internal Server Error");
    }
  };
  private getRestaurant = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      console.log(req.cookies);
      console.log("🚀 ~ RestaurantController ~ name:", name);
      //@ts-ignore
      const db = client.db(name);
      const collections = await db.collections();
      if (collections.length <= 3)
        return res.status(404).send({ msg: "no restaurant found" });
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
      // console.log("cpplies, ", req.cookies);
      // if (!req.cookies.uid)
      //   res.cookie("uid", "abdvsbshwhjw", {
      //     maxAge: 31536000000,
      //     httpOnly: true,
      //     secure: process.env.NODE_ENV === "production",
      //     sameSite: "strict",
      //   });
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
        !req.body.email ||
        !req.body.udf1 ||
        !req.body.udf2
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
          pd.udf1 +
          "|" +
          pd.udf2 +
          "|" +
          "||||||||" +
          process.env.PAYU_SALT; // live or test salt

        // Create a SHA-512 hash using the crypto library
        var sha = new jsSHA("SHA-512", "TEXT"); //encryption taking place
        sha.update(hashString);
        var hash = sha.getHash("HEX"); //hashvalue converted to hexvalue
        res.json({ hash: hash }); // Hash value is sent as response
      }
    } catch (error) {
      console.log("Error payment:", error);
      res.status(500).send("Internal Server Error");
    }
  };
  private createClient = async (req, res) => {
    try {
      if (!req.body.name || !req.body.number || !req.body.email) {
        return res.status(400).send("Mandatory fields missing");
      }

      const { name, email, number } = req.body;
      const db = client.db(req.headers.name);

      let user;
      const uid = req.cookies.uid;

      if (uid) {
        // Check if user exists by uid
        user = await db.collection("clients").findOne({ _id: uid });
      }

      if (!user) {
        // Check if user exists by number or email
        user = await db
          .collection("clients")
          .findOne({ $or: [{ email }, { number }] });
      }

      if (user) {
        // Update user details if changed
        const updateFields: {
          email?: string;
          name?: string;
          number?: string;
        } = {};
        if (user.name !== name) updateFields.name = name;
        if (user.email !== email) updateFields.email = email;
        if (user.number !== number) updateFields.number = number;

        if (Object.keys(updateFields).length > 0) {
          await db
            .collection("clients")
            .updateOne({ _id: user._id }, { $set: updateFields });
        }

        // Set the cookie if it wasn't already set
        if (!uid) {
          res.cookie("uid", user._id.toString(), {
            maxAge: 9999999,
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
          });
        }

        return res.json({ id: user._id });
      }

      // Create new user if not found
      const insertRes = await db
        .collection("clients")
        .insertOne({ name, email, number, orders: [] });
      console.log(
        "🚀 ~ RestaurantController ~ createClient= ~ insertRes:",
        insertRes
      );

      res.cookie("uid", insertRes.insertedId.toString(), {
        maxAge: 9999999,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      return res.json({ id: insertRes.insertedId });
    } catch (error) {
      console.log("Error creating client:", error);
      res.status(500).send("Internal Server Error");
    }
  };

  private paymentSuccess = async (req, res) => {
    const {
      mihpayid,
      status,
      txnid,
      amount,
      hash,
      firstname,
      lastname,
      productinfo,
      mode,
      udf1,
      udf2,
      phone,
    } = req.body;

    // Verify hash
    const hashString = `${process.env.PAYU_SALT}|${status}|||||||||${udf2}|${udf1}|${req.body.email}|${req.body.firstname}|${req.body.productinfo}|${amount}|${txnid}|${process.env.PAYU_KEY}`;
    const expectedHash = crypto
      .createHash("sha512")
      .update(hashString)
      .digest("hex");

    console.log(req.body);

    if (hash === expectedHash) {
      console.log("success");

      try {
        const db = client.db(udf2);
        await db
          .collection("clients")
          .findOneAndUpdate({ _id: udf1 }, { $addToSet: { orders: mihpayid } });
        // }

        // Insert order
        const newOrder = {
          _id: mihpayid,
          status,
          txnid,
          amount,
          list: productinfo,
          mode,
          client: udf1,
        };
        const insertOrderResult = await db
          .collection("orders")
          .insertOne(newOrder);
        // Payment successful
        res.json({ success: true, message: "Payment successful" });
      } catch (error) {
        console.error("Error processing payment:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal Server Error" });
      } finally {
        await client.close();
      }
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
