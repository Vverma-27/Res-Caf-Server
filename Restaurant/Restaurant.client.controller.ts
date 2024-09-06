import express from "express";
import crypto from "crypto";
import { client } from "../services/mongo";
import restaurantMiddleware from "../middleware/restaurant/client";
// import jsSHA from "jssha";
import { Cashfree } from "cashfree-pg";
import { ObjectId } from "mongodb";
import { IOrder, OrderStatus } from "./Restaurant.interfaces";
import { app } from "../index";

Cashfree.XClientId = process.env.CASHFREE_XCLIENT_ID;
Cashfree.XClientSecret = process.env.CASHFREE_XCLIENT_SECRET;
Cashfree.XEnvironment = Cashfree.Environment.SANDBOX;
// process.env.NODE_ENV === "production"
//   ? Cashfree.Environment.PRODUCTION
//   :

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
    this.router.get(
      `${this.route}/order/details/:orderID`,
      restaurantMiddleware,
      this.getOrderDetails
    );
    // this.router.post(
    //   `${this.route}/payment`,
    //   restaurantMiddleware,
    //   this.makePayment
    // );
    this.router.post(
      `${this.route}/payment/order`,
      restaurantMiddleware,
      this.createOrderCashfree
    );
    this.router.post(`${this.route}/payment/success`, this.paymentSuccess);
    this.router.post(`${this.route}/verify`, this.verifyPayment);
    this.router.post(`${this.route}/payment/failure`, this.paymentFail);
  }
  // private getDishesFromOrders = async (uid: string, name: string) => {
  //   try {
  //     //@ts-ignore
  //     const db = client.db(name);
  //     // Fetch orders with orderDetails
  //     const orders = await db
  //       .collection("clients")
  //       .aggregate([
  //         { $match: { _id: new ObjectId(uid) } },
  //         { $project: { orders: 1 } },
  //       ])
  //       .toArray();

  //     // Extract dish ObjectIDs
  //     const dishObjectIds = orders.flatMap((order) =>
  //       order.orderDetails.map((detail) => detail.dish)
  //     );

  //     return dishes;
  //   } catch (err) {
  //     console.error(err);
  //     throw new Error("Failed to get dishes from orders");
  //   }
  // };
  private getTransactionsByClientId = async (
    clientId: string,
    name: string
  ) => {
    const db = client.db(name);
    const clientsCollection = db.collection("clients");
    const ordersCollection = db.collection<IOrder>("orders");

    // Step 1: Find the client by clientId and get their order IDs
    const clientObject = await clientsCollection.findOne({
      _id: new ObjectId(clientId),
    });

    if (
      !clientObject ||
      !clientObject.orders ||
      clientObject.orders.length === 0
    ) {
      return [];
    }

    // Step 2: Find the relevant orders from the orders collection
    const items = await ordersCollection
      .aggregate([
        {
          $match: {
            _id: { $in: clientObject.orders }, // Match orders based on client orders array
          },
        },
        {
          $unwind: "$transactions", // Unwind transactions to process each one separately
        },
        {
          $match: {
            "transactions.clientId": new ObjectId(clientId), // Match transactions by clientId
          },
        },
        {
          $group: {
            _id: null,
            items: { $push: "$transactions.items" }, // Collect all items (comma-separated dish ObjectIds)
          },
        },
        {
          $project: {
            _id: 0,
            items: 1,
          },
        },
      ])
      .toArray();

    // Step 3: Process the items string to extract unique dish ObjectIds
    console.log("🚀 ~ RestaurantController ~ items:", items);
    const dishIds = items
      .flatMap((dishString) => dishString.split(",")) // Split the comma-separated string
      .map((dishId) => dishId.trim()); // Remove any extra whitespace
    console.log("🚀 ~ RestaurantController ~ dishIds:", dishIds);

    const uniqueDishObjectIds = Array.from(
      new Set(dishIds.map((dishId) => new ObjectId(dishId)))
    );

    return uniqueDishObjectIds;
  };

  private getPastOrders = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { uid } = req.cookies;
      const db = client.db(req.headers.name as string);

      // Fetch unique dish ObjectIds for the client
      const uniqueDishObjectIds = await this.getTransactionsByClientId(
        uid,
        req.headers.name as string
      );
      console.log(
        "🚀 ~ RestaurantController ~ uniqueDishObjectIds:",
        uniqueDishObjectIds
      );

      if (uniqueDishObjectIds.length === 0) {
        return res.status(404).send({ msg: "No dishes found for this client" });
      }

      // Step 4: Fetch dish details using the unique dish ObjectIds
      const dishes = await db
        .collection("dishes")
        .find({ _id: { $in: uniqueDishObjectIds } })
        .toArray();

      res.json({ orders: dishes });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private getOrderDetails = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { orderID } = req.params;
      const db = client.db(req.headers.name as string);

      const order = await db
        .collection("orders")
        .aggregate([
          { $match: { _id: new ObjectId(orderID) } }, // Match the order with the specific orderID

          // Lookup and populate transactions
          {
            $lookup: {
              from: "clients", // Assuming the clients collection contains client information
              localField: "transactions.clientId",
              foreignField: "_id",
              as: "client",
            },
          },
          {
            $set: {
              transactions: {
                $map: {
                  input: "$transactions",
                  as: "trans",
                  in: {
                    name: {
                      $arrayElemAt: [
                        "$client.name",
                        {
                          $indexOfArray: [
                            "$transactions.clientId",
                            "$$trans.clientId",
                          ],
                        },
                      ],
                    },
                    amount: "$$trans.amount",
                  },
                },
              },
            },
          },

          // Lookup and populate orderDetails
          {
            $lookup: {
              from: "dishes", // Assuming the dishes collection contains dish information
              localField: "orderDetails.dish",
              foreignField: "_id",
              as: "dishes",
            },
          },
          {
            $set: {
              orderDetails: {
                $map: {
                  input: "$orderDetails",
                  as: "detail",
                  in: {
                    dish: {
                      $arrayElemAt: [
                        "$dishes",
                        {
                          $indexOfArray: [
                            "$orderDetails.dish",
                            "$$detail.dish",
                          ],
                        },
                      ],
                    },
                    qty: "$$detail.qty",
                    numSplitters: "$$detail.numSplitters",
                  },
                },
              },
            },
          },

          // Project the required fields
          {
            $project: {
              "transactions.clientId": 0,
              client: 0,
              orderIds: 0,
              dishes: 0, // Hiding intermediate lookup array
            },
          },
        ])

        .toArray();
      // console.log("🚀 ~ RestaurantController ~ order:", order);

      if (order.length === 0) {
        return res.status(404).send({ msg: "Order not found" });
      }

      res.json({ order: order[0] });
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
        !pd.productinfo ||
        !pd.amountPayable ||
        !pd.transactionOrder ||
        (pd.throughLink && !pd.orderID) ||
        !pd.table
      ) {
        res.json({ error: "Mandatory fields missing" });
      } else {
        const orderObj = {
          amount: pd.amount,
          status: OrderStatus.CREATED,
          table: pd.table,
        };
        let insertedOrderID: ObjectId;
        if (!pd.throughLink) {
          const db = client.db(name as string);
          const result = await db.collection("orders").insertOne(orderObj);
          insertedOrderID = result.insertedId;
        }
        const request = {
          order_amount: parseFloat(parseInt(pd.amountPayable).toFixed(2)),
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
              process.env.NODE_ENV === "production"
                ? `https://${name}.resandcaf.online/success?orderID=${
                    pd.throughLink ? pd.orderID : insertedOrderID?.toString()
                  }&remaining=${pd.amount - pd.amountPayable > 0}&table=${
                    pd.table
                  }`
                : `http://${name}.example.localhost:3001/success?orderID=${
                    pd.throughLink ? pd.orderID : insertedOrderID?.toString()
                  }&remaining=${pd.amount - pd.amountPayable > 0}&table=${
                    pd.table
                  }`,
            notify_url:
              process.env.NODE_ENV === "production"
                ? `https://${name}.api.resandcaf.online/restaurant/client/verify?orderID=${
                    pd.throughLink ? pd.orderID : insertedOrderID?.toString()
                  }&table=${pd.table}`
                : `https://www.cashfree.com/devstudio/preview/pg/webhooks/58294087`,
          },
          order_note: pd.productinfo,
          order_tags: {
            restaurant: name as string,
            items: pd.productinfo,
            transactionOrder: pd.transactionOrder,
            throughLink: `${pd.throughLink}`,
            orderID: pd.throughLink ? pd.orderID : insertedOrderID?.toString(),
            remainingAmount: `${pd.amount - pd.amountPayable}`,
            table: pd.table,
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
      const { name: restaurantName } = await db.collection("details").findOne();
      // const collections = await db.collections();
      // if (collections.length <= 3)
      //   return res.status(404).send({ msg: "no restaurant found" });
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
      //     secure: false,
      //     sameSite: "none",
      //     // sameSite: "strict",
      //   });
      res.json({ menu, name: restaurantName });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  // private makePayment = async (req, res) => {
  //   try {
  //     if (
  //       !req.body.txnid ||
  //       !req.body.amount ||
  //       !req.body.productinfo ||
  //       !req.body.firstname ||
  //       !req.body.email ||
  //       !req.body.udf1 ||
  //       !req.body.udf2
  //     ) {
  //       res.send("Mandatory fields missing");
  //     } else {
  //       const pd = req.body;
  //       const hashString =
  //         process.env.PAYU_KEY + // live or test key
  //         "|" +
  //         pd.txnid +
  //         "|" +
  //         pd.amount +
  //         "|" +
  //         pd.productinfo +
  //         "|" +
  //         pd.firstname +
  //         "|" +
  //         pd.email +
  //         "|" +
  //         pd.udf1 +
  //         "|" +
  //         pd.udf2 +
  //         "|" +
  //         "||||||||" +
  //         process.env.PAYU_SALT; // live or test salt

  //       // Create a SHA-512 hash using the crypto library
  //       var sha = new jsSHA("SHA-512", "TEXT"); //encryption taking place
  //       sha.update(hashString);
  //       var hash = sha.getHash("HEX"); //hashvalue converted to hexvalue
  //       res.json({ hash: hash }); // Hash value is sent as response
  //     }
  //   } catch (error) {
  //     console.log("Error payment:", error);
  //     res.status(500).send("Internal Server Error");
  //   }
  // };
  private createClient = async (req, res) => {
    try {
      if (!req.body.name || !req.body.number || !req.body.email) {
        return res.status(400).send("Mandatory fields missing");
      }

      const { name, email, number } = req.body;
      const db = client.db(req.headers.name);

      let user;
      const uid = req.cookies.uid;
      // console.log("🚀 ~ RestaurantController ~ createClient= ~ uid:", uid);

      // if (uid) {
      //   // Check if user exists by uid
      //   user = await db.collection("clients").findOne({ _id: uid });
      // }

      // if (!user) {
      // Check if user exists by number or email
      user = await db
        .collection("clients")
        .findOne({ $or: [{ email }, { number }] });
      // }

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
          console.log("setting uid in cookie");
          res.cookie("uid", user._id.toString(), {
            expires: new Date(Date.now() + 31536000000),
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            // sameSite: "strict",
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
        expires: new Date(Date.now() + 31536000000),
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

  private verifyPayment = async (req, res) => {
    const verify = (ts, rawBody) => {
      const body = req.headers["x-webhook-timestamp"] + req.rawBody;
      const secretKey = process.env.CASHFREE_XCLIENT_SECRET;
      let genSignature = crypto
        .createHmac("sha256", secretKey)
        .update(body)
        .digest("base64");
      return genSignature;
    };
    try {
      // console.log(req.body);
      console.log(req.rawBody);
      console.log(
        verify(req.headers["x-webhook-timestamp"], req.rawBody),
        req.headers["x-webhook-signature"]
      );
      const response = Cashfree.PGVerifyWebhookSignature(
        req.headers["x-webhook-signature"],
        req.rawBody,
        req.headers["x-webhook-timestamp"]
      );
      console.log(
        "🚀 ~ RestaurantController ~ verifyPayment= ~ response:",
        response
      );
      if (response.object) {
        const { data, event_time } = req.body;
        console.log("🚀 ~ RestaurantController ~ verifyPayment= ~ data:", data);
        const orderDetails = data.order.order_tags.items.split(",").map((e) => {
          const [num, dishId, numSplitters] = e.split(":");
          return {
            dish: dishId,
            qty: parseInt(num),
            numSplitters: parseInt(numSplitters),
          };
        });
        const orderObj = {
          amount: data.order.order_amount,
          orderID: data.order.order_id,
          date: event_time,
          clientId: new ObjectId(`${data.customer_details.customer_id}`),
          orderDetails,
        };
        const {
          restaurant,
          orderID,
          remainingAmount,
          throughLink,
          table,
          transactionOrder,
        } = data.order.order_tags;
        const db = client.db(restaurant);
        const existingOrder = await db.collection<IOrder>("orders").findOne({
          _id: new ObjectId(orderID as string),
          orderIds: { $in: [data.order.order_id] },
        });

        if (existingOrder) {
          console.log("Order ID already exists. Skipping update.");
          res.status(200).send({ message: "Order ID already processed" });
          return;
        }

        if (+remainingAmount > 0) {
          orderObj["remainingAmount"] = +remainingAmount;
          orderObj["status"] = OrderStatus.PARTIALLY_PAID;
        } else if (+remainingAmount <= 0) {
          orderObj["remainingAmount"] = 0;
          orderObj["status"] = OrderStatus.PAIDINFULL;
        }
        if (!JSON.parse(throughLink)) {
          const updatedOrder = db.collection<IOrder>("orders").findOneAndUpdate(
            { _id: new ObjectId(orderID as string) },
            {
              $set: {
                orderDetails,
                status: orderObj["status"],
                remainingAmount: orderObj["remainingAmount"],
                date: orderObj.date,
              },
              $push: {
                transactions: {
                  clientId: new ObjectId(
                    `${data.customer_details.customer_id}`
                  ),
                  amount: data.order.order_amount,
                  items: transactionOrder,
                },
                orderIds: data.order.order_id,
              },
            },
            { returnDocument: "after" }
          );
          const aggregatedResult = db
            .collection<IOrder>("orders")
            .aggregate([
              {
                $match: { _id: new ObjectId(orderID as string) }, // Match the specific updated document
              },
              {
                $unwind: "$orderDetails", // Unwind orderDetails array
              },
              {
                $lookup: {
                  from: "dishes", // Join with dishes collection
                  localField: "orderDetails.dish",
                  foreignField: "_id",
                  as: "dishInfo",
                },
              },
              {
                $unwind: "$dishInfo", // Unwind dishInfo array
              },
              {
                $set: {
                  "orderDetails.dish": "$dishInfo", // Replace dish ID with full dish object
                },
              },
              {
                $group: {
                  _id: "$_id", // Group by order ID
                  orderID: { $first: "$_id" },
                  amount: { $first: "$amount" },
                  status: { $first: "$status" },
                  date: { $first: "$date" },
                  remainingAmount: { $first: "$remainingAmount" },
                  table: { $first: "$table" },
                  orderDetails: { $push: "$orderDetails" }, // Reconstruct orderDetails array
                },
              },
              {
                $match: {
                  status: { $ne: OrderStatus.COMPLETED }, // Filter out completed orders
                },
              },
              {
                $project: {
                  orderID: 1,
                  amount: 1,
                  status: 1,
                  _id: 0,
                  date: 1,
                  remainingAmount: 1,
                  table: 1,
                  orderDetails: 1,
                },
              },
            ])
            .toArray();
          const [updated, aggregated] = await Promise.all([
            updatedOrder,
            aggregatedResult,
          ]);
          app.io
            .of(`admin-resandcaf-${restaurant}`)
            .emit("new-order", aggregated[0]);
        } else {
          await db.collection<IOrder>("orders").findOneAndUpdate(
            { _id: new ObjectId(orderID as string) },
            {
              $set: {
                status: orderObj["status"],
                remainingAmount: orderObj["remainingAmount"],
              },
              $push: {
                transactions: {
                  clientId: new ObjectId(
                    `${data.customer_details.customer_id}`
                  ),
                  amount: data.order.order_amount,
                  items: transactionOrder,
                },
                orderIds: data.order.order_id,
              },
            }
          );
          app.io.of(`admin-resandcaf-${restaurant}`).emit("order-transaction", {
            orderID,
            remainingAmount: orderObj["remainingAmount"],
          });
        }
        // const result = await db.collection("orders").insertOne(orderObj);
        const { vendor_id } = await db.collection("details").findOne();

        // Check if the order was inserted successfully
        if (orderID) {
          // Update the client by adding the order ID to the orders array
          await db.collection("clients").findOneAndUpdate(
            { _id: new ObjectId(`${data.customer_details.customer_id}`) },
            //@ts-ignore
            { $push: { orders: new ObjectId(orderID as string) } }
          );
        }
        setTimeout(async () => {
          const res = await fetch(
            `https://sandbox.cashfree.com/pg/easy-split/orders/${data.order.order_id}/split`,
            {
              method: "POST",
              body: JSON.stringify({
                split: [
                  {
                    vendor_id,
                    percentage: 90.0,
                  },
                ],
                disable_split: true,
              }),
              headers: {
                "x-api-version": "2023-08-01",
                "x-client-id": process.env.CASHFREE_XCLIENT_ID,
                "x-client-secret": process.env.CASHFREE_XCLIENT_SECRET,
                "Content-Type": "application/json",
              },
            }
          );
          const d = await res.json();
          console.log("Response d:", d);
        }, 120000);
      }
      res.status(200);
    } catch (err) {
      console.log(err.message);
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
