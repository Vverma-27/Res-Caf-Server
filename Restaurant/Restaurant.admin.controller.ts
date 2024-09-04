import express from "express";
import { v4 as uuidv4 } from "uuid";
// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas, loadImage } from "canvas";
import multer from "multer";
import crypto from "crypto";
import cloudinary from "cloudinary";
import fs from "fs";
import path from "path";
import Tesseract, { createWorker } from "tesseract.js";
import authMiddleware, { roleMiddleware } from "../middleware/auth";
import { MongoClient, ObjectId } from "mongodb";
import config from "../config";
import { client } from "../services/mongo";
import { ICategory, IDish, OrderStatus, ROLES } from "./Restaurant.interfaces";
import restaurantMiddleware from "../middleware/restaurant/admin";
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    files: 20, // Maximum number of files allowed
    fileSize: 2 * 1024 * 1024, // Maximum file size (in bytes), here it's set to 2MB
  },
});
import { Cashfree, KycDetails } from "cashfree-pg";
import admin from "firebase-admin";

Cashfree.XClientId = process.env.CASHFREE_XCLIENT_ID;
Cashfree.XClientSecret = process.env.CASHFREE_XCLIENT_SECRET;
Cashfree.XEnvironment =
  // process.env.NODE_ENV === "production"
  //   ? Cashfree.Environment.PRODUCTION
  //   :
  Cashfree.Environment.SANDBOX;
class RestaurantController {
  private router: express.Router;
  private route = "/restaurant";
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }
  private initializeRoutes() {
    this.router.post(
      `${this.route}/new`,
      authMiddleware,
      this.createNewRestaurant
    );
    this.router.post(
      `${this.route}/menu`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      upload.array("images", 30),
      this.addMenu
    );
    this.router.post(
      `${this.route}/details`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.addDetails
    );
    this.router.delete(
      `${this.route}/category/:id`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.deleteCategory
    );
    this.router.delete(
      `${this.route}/dish/:catId/:dishId`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.deleteDish
    );
    this.router.put(
      `${this.route}/dish/unavailable/:catId/:dishId`,
      authMiddleware,
      restaurantMiddleware,
      this.setDishUnavailable
    );
    this.router.get(
      `${this.route}/status`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.EMPLOYEE),
      this.getStatus
    );
    this.router.get(
      `${this.route}/orders`,
      authMiddleware,
      restaurantMiddleware,
      this.getOrders
    );
    this.router.put(
      `${this.route}/completed/orders/:id`,
      authMiddleware,
      restaurantMiddleware,
      this.setOrderCompleted
    );
    this.router.get(
      `${this.route}/orders/total`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getNumOrders
    );
    this.router.get(
      `${this.route}/orders/dishes`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getDishesByFrequency
    );
    this.router.get(
      `${this.route}/orders/percentages/:type`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getPercentagesOfType
    );
    this.router.get(
      `${this.route}/sales/avg`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getAverageSales
    );
    this.router.get(
      `${this.route}/stats/:timespan`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getStatsByTimespan
    );
    this.router.get(
      `${this.route}/clients`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getClients
    );
    this.router.get(
      `${this.route}/clients/total`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getNumClients
    );
    this.router.get(
      `${this.route}/employees`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getEmployees
    );
    this.router.post(
      `${this.route}/employees`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.createEmployee
    );
    this.router.patch(
      `${this.route}/employees/disable/:id`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.toggleIsActiveEmployee
    );
    this.router.get(
      `${this.route}/employee`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.EMPLOYEE),
      this.getCurrentEmployee
    );
    // this.router.put(
    //   `${this.route}/employees/:id`,
    //   authMiddleware,
    //   restaurantMiddleware,
    //   roleMiddleware(ROLES.ADMIN),
    //   this.updateEmployee
    // );
    // this.router.put(
    //   `${this.route}/menu`,
    //   upload.array("images", 20),
    //   this.handleMenuUpdate
    // );
    this.router.post(
      `${this.route}/bank`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.createVendor
    );
    this.router.get(
      `${this.route}/bank`,
      authMiddleware,
      restaurantMiddleware,
      roleMiddleware(ROLES.ADMIN),
      this.getVendor
    );
    this.router.post(`${this.route}/verification`, this.handleWebhook);
    // this.router.post(
    //   `${this.route}/menu`,
    //   upload.single("menu"),
    //   this.handleMenuUpload
    // );
  }

  private getOrders = async (req: express.Request, res: express.Response) => {
    const { name } = req.headers;
    const db = client.db(name as string);
    const orders = await db
      .collection("orders")
      .aggregate([
        {
          $unwind: "$orderDetails", // Unwind orderDetails array to process each element
        },
        {
          $lookup: {
            from: "dishes", // The collection to join with
            localField: "orderDetails.dish", // The field from the orders collection
            foreignField: "_id", // The field from the dishes collection
            as: "dishInfo", // The name of the new array field to add
          },
        },
        {
          $unwind: "$dishInfo", // Unwind the dishInfo array (since it's a single match, not an array)
        },
        {
          $set: {
            "orderDetails.dish": "$dishInfo", // Replace the dish ID with the full dish object
          },
        },
        {
          $group: {
            _id: "$_id", // Group by the original order ID (keeping each order separate)
            orderID: { $first: "$_id" },
            amount: { $first: "$amount" },
            status: { $first: "$status" },
            date: { $first: "$date" },
            remainingAmount: { $first: "$remainingAmount" },
            table: { $first: "$table" },
            orderDetails: { $push: "$orderDetails" }, // Reconstruct the orderDetails array
          },
        },
        {
          $match: {
            status: { $ne: OrderStatus.COMPLETED },
          },
        },
        {
          $project: {
            orderID: 1, // Keep orderID field
            amount: 1,
            status: 1,
            _id: 0,
            date: 1,
            remainingAmount: 1,
            table: 1,
            orderDetails: 1, // Keep orderDetails array
          },
        },
      ])
      .toArray(); // Convert the cursor to an array
    return res.json({ orders });
  };

  private getCurrentEmployee = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name, uid } = req.headers;
    const db = client.db(name as string);
    const employee = await db
      .collection("employees")
      //@ts-ignore
      .findOne({ _id: uid }, { projection: { name: 1, email: 1 } });
    return res.json({ employee });
  };

  private getPercentagesOfType = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name } = req.headers;
    const { type } = req.params;
    const db = client.db(name as string);

    // Determine the field to group by based on the type parameter
    let groupByField: any;
    let nameField: any;

    if (type === "dish") {
      groupByField = "$orderDetails.dish";
      nameField = "$dishInfo.name";
    } else if (type === "category") {
      groupByField = "$dishInfo.category";
      nameField = "$dishInfo.category";
    } else if (type === "veg") {
      groupByField = "$dishInfo.veg";
      nameField = "$dishInfo.veg";
    } else {
      return res.status(400).json({ error: "Invalid type parameter" });
    }

    const result = await db
      .collection("orders")
      .aggregate([
        // Unwind the orderDetails array to process each dish individually
        {
          $unwind: "$orderDetails",
        },
        // Lookup to get the full dish information
        {
          $lookup: {
            from: "dishes",
            localField: "orderDetails.dish",
            foreignField: "_id",
            as: "dishInfo",
          },
        },
        {
          $unwind: "$dishInfo",
        },
        // Group by the relevant field based on the type
        {
          $group: {
            _id: {
              typeField: groupByField,
              name: nameField, // Keep the name field in the group key
            },
            count: { $sum: "$orderDetails.qty" },
          },
        },
        // Calculate the total number of dishes ordered
        {
          $group: {
            _id: null,
            totalDishes: { $sum: "$count" },
            items: {
              $push: {
                name: "$_id.name", // Extract the name from the previous group key
                count: "$count",
                typeField: "$_id.typeField",
              },
            },
          },
        },
        {
          $unwind: "$items",
        },
        // Calculate the percentage for each type
        {
          $project: {
            label: "$items.name",
            value: "$items.count",
          },
        },
        // Sort by percentage in descending order
        {
          $sort: { value: -1 },
        },
      ])
      .toArray();

    return res.json({ result });
  };

  private getDishesByFrequency = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      const db = client.db(name as string);

      // Determine the date range based on the timespan

      // Define the aggregation pipeline
      const aggregationPipeline = [
        // Unwind the orderDetails array to process each dish individually
        {
          $unwind: "$orderDetails",
        },
        // Group by the dish ID to count how many times each dish appears in orders
        {
          $group: {
            _id: "$orderDetails.dish",
            count: { $sum: 1 },
          },
        },
        // Sort by count in descending order to get the most frequent dishes
        {
          $sort: { count: -1 },
        },
        // Group top 5 dishes and remaining ones into 'Others'
        {
          $facet: {
            topDishes: [{ $limit: 5 }],
            others: [
              { $skip: 5 },
              {
                $group: {
                  _id: "Others",
                  count: { $sum: "$count" },
                },
              },
            ],
          },
        },
        // Merge top dishes and others into a single array
        {
          $project: {
            data: { $concatArrays: ["$topDishes", "$others"] },
          },
        },
        // Unwind the data array to convert it into documents
        {
          $unwind: "$data",
        },
        // Replace _id field with dish name (for top dishes) or "Others"
        {
          $lookup: {
            from: "dishes",
            localField: "data._id",
            foreignField: "_id",
            as: "dishInfo",
          },
        },
        {
          $unwind: {
            path: "$dishInfo",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            label: {
              $ifNull: ["$dishInfo.name", "Others"],
            },
            value: "$data.count",
          },
        },
      ];

      // Execute the aggregation pipeline
      const aggregationResult = await db
        .collection("orders")
        .aggregate(aggregationPipeline)
        .toArray();
      console.log(
        "🚀 ~ RestaurantController ~ aggregationResult:",
        aggregationResult
      );

      // Handle cases with no orders or no dishes
      if (aggregationResult.length === 0) {
        return res.json({ result: [] });
      }

      return res.json({ result: aggregationResult });
    } catch (error) {
      console.error("Aggregation Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  private getStatsByTimespan = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name } = req.headers;
    const { timespan } = req.params;
    const db = client.db(name as string);

    // Determine the date range and group by expression based on the timespan
    let groupByFormat: string;
    let componentsCount: number;

    const currentDate = new Date();
    let startDate: Date;

    if (timespan === "weekly") {
      startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      groupByFormat = "%Y-%m-%d"; // Group by day
      componentsCount = 7;
    } else if (timespan === "monthly") {
      startDate = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      groupByFormat = "%Y-%m-%d"; // Group by day
      componentsCount = 30;
    } else if (timespan === "yearly") {
      startDate = new Date(currentDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      groupByFormat = "%Y-%m"; // Group by month
      componentsCount = 12;
    } else {
      return res.status(400).json({ error: "Invalid timespan" });
    }

    const result = await db
      .collection("orders")
      .aggregate([
        {
          $addFields: {
            // Convert string dates to Date objects
            dateObject: {
              $dateFromString: {
                dateString: "$date",
                format: "%Y-%m-%dT%H:%M:%S%z", // Adjust format as per your date string format
              },
            },
          },
        },
        {
          $match: {
            dateObject: { $gte: startDate }, // Filter orders by the start date
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: groupByFormat, date: "$dateObject" }, // Group by the determined format
            },
            total: { $sum: { $toDouble: "$amount" } }, // Sum the amounts for each group
            count: { $sum: 1 }, // Count the number of orders in each group
          },
        },
        {
          $sort: { _id: 1 }, // Sort by the grouped field (date)
        },
      ])
      .toArray();

    // Prepare the components array
    const components = new Array(componentsCount).fill(0);
    const numOrders = new Array(componentsCount).fill(0);

    result.forEach((item) => {
      const index =
        timespan === "yearly"
          ? new Date(item._id + "-01").getMonth() // Extract month index for yearly
          : new Date(item._id).getDate() - 1; // Extract day index for weekly/monthly

      components[index] = item.total;
      numOrders[index] = item.count;
    });

    // Calculate the total sales
    const total = result.reduce((acc, curr) => acc + curr.total, 0);

    return res.json({ total, components, numOrders });
  };

  private getAverageSales = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name } = req.headers;
    const db = client.db(name as string);
    const result = await db
      .collection("orders")
      .aggregate([
        {
          $group: {
            _id: null, // Group all documents together
            average: { $avg: { $toDouble: "$amount" } }, // Convert string to double and then calculate the average
          },
        },
      ])
      .toArray();

    // Check if result is not empty and return the average, or handle the case where no orders exist
    const average = result.length > 0 ? result[0].average : 0;

    return res.json({ average });
  };

  private getNumClients = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name } = req.headers;
    const db = client.db(name as string);
    const total = await db.collection("clients").countDocuments();
    return res.json({ total });
  };

  private getNumOrders = async (
    req: express.Request,
    res: express.Response
  ) => {
    const { name } = req.headers;
    const db = client.db(name as string);
    const total = await db
      .collection("orders")
      .countDocuments({ status: OrderStatus.COMPLETED });
    return res.json({ total });
  };

  private setOrderCompleted = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { id } = req.params; // Extract the id from req.params
      const { name } = req.headers;
      const db = client.db(name as string);

      // Update the status of the order
      const result = await db.collection("orders").findOneAndUpdate(
        { _id: new ObjectId(id) }, // Ensure the id is an ObjectId
        { $set: { status: OrderStatus.COMPLETED } }, // Use $set to update fields
        { returnDocument: "after" } // Optional: return the updated document
      );
      if (!result) {
        return res
          .status(404)
          .json({ success: false, message: "Order not found" });
      }

      return res.json({ success: true });
    } catch (error) {
      console.log("🚀 ~ RestaurantController ~ error:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  private uploadImageToCloudinary = async (
    buffer: Buffer,
    folder: string,
    imageName: string
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.v2.uploader.upload_stream(
        { folder: folder.toLowerCase(), public_id: imageName.toLowerCase() },
        (error, result) => {
          if (error) reject(`${error}`);
          else resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    });
  };
  private handleWebhook = async (
    req: express.Request,
    res: express.Response
  ) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    const generated_signature = crypto.createHmac(
      "sha256",
      process.env.RAZORPAY_WEBHOOK_SECRET
    );
    generated_signature.update(JSON.stringify(req.body));
    const expected_signature = req.headers[`x-razorpay-signature`];
    const digest = generated_signature.digest("hex");
    if (expected_signature === digest) {
      // await Restaurant.create({ restaurant: req.body });
    }
    res.json({ status: "ok" });
    // if(expected_signature===digest){

    // }
    // console.log()
    // const response = validateWebhookSignature(
    //   JSON.stringify(req.body),
    //   webhookSignature,
    //   webhookSecret
    // );
  };
  private getEmployees = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      //@ts-ignore
      const db = client.db(name);
      const { page, limit } = req.query;
      const employees = await db
        .collection("employees")
        .find({ role: { $ne: ROLES.ADMIN } }) // Filter out documents where role is "ADMIN"
        .skip(parseInt(page as string) * parseInt(limit as string)) // Skip documents for pagination
        .limit(parseInt(limit as string)) // Limit the number of documents returned
        .toArray(); // Convert the result to an array (optional, depending on how you want to handle the data)
      return res.json({ employees });
    } catch (error) {
      console.log(error);
      res.status(500).send(error);
    }
  };
  private toggleIsActiveEmployee = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      const { id } = req.params;
      //@ts-ignore
      const db = client.db(name);
      const employee = await db
        .collection("employees")
        //@ts-ignore
        .updateOne({ _id: id }, { $set: { active: req.body.active } });
      return res.json({ employee });
    } catch (error) {
      console.log(error);
      res.status(500).send(error);
    }
  };
  private createEmployee = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { name } = req.headers;
      const { name: empName, email, role, password } = req.body;
      const fbUser = await admin.auth().createUser({
        email,
        password,
      });
      //@ts-ignore
      const db = client.db(name);
      const employee = await db.collection("employees").insertOne({
        name: empName,
        email,
        role,
        password,
        active: true,
        //@ts-ignore
        _id: fbUser.uid,
      });
      await db
        .collection("restaurant")
        .findOneAndUpdate({ name }, { uids: { $push: fbUser.uid } });
      return res.json({ employee });
    } catch (error) {
      console.log(error);
      res.status(500).send(error);
    }
  };
  private createVendor = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { upi, details: payMethodDetails } = req.body;
      const { name } = req.headers;
      console.log("🚀 ~ RestaurantController ~ name:", name);
      //@ts-ignore
      const db = client.db(name);
      const details = await db.collection("details").findOne();
      console.log("🚀 ~ RestaurantController ~ details:", details);
      const payMethod = upi
        ? { bank: { ...payMethodDetails.details } }
        : { upi: { ...payMethodDetails.details } };
      console.log("🚀 ~ RestaurantController ~ payMethod:", payMethod);
      // const response = await Cashfree.PGESCreateVendors("2022-09-01", "", "", {
      //   vendor_id: details._id.toString(),
      //   status: "ACTIVE",
      //   name: name as string,
      //   email: details.email,
      //   phone: details.number,
      //   verify_account: true,
      //   dashboard_access: false,
      //   schedule_option: 2,
      //   ...payMethod,
      //   kyc_details: [
      //     {
      //       account_type: "Proprietorship",
      //       business_type: "Jewellery",
      //       uidai: 655675523712,
      //       gst: "29AAICP2912R1ZR",
      //       cin: "L00000Aa0000AaA000000",
      //       pan: "ABCPV1234D",
      //       passport_number: "L6892603",
      //     },
      //   ],
      // });
      const data = await fetch(
        "https://sandbox.cashfree.com/pg/easy-split/vendors",
        {
          method: "POST",
          body: JSON.stringify({
            vendor_id: details._id.toString(),
            status: "ACTIVE",
            name: name as string,
            email: details.email,
            phone: details.number,
            verify_account: true,
            dashboard_access: false,
            schedule_option: 2,
            ...payMethod,
            kyc_details: {
              account_type: "Proprietorship",
              business_type: "Jewellery",
              uidai: "655675523712",
              gst: "29AAICP2912R1ZR",
              pan: "ABCPV1234D",
            },
          }),
          headers: {
            "x-api-version": "2022-09-01",
            "x-client-id": process.env.CASHFREE_XCLIENT_ID,
            "x-client-secret": process.env.CASHFREE_XCLIENT_SECRET,
            "Content-Type": "application/json",
          },
        }
      );
      const response = await data.json();

      if (response.vendor_id) {
        details.vendor_id = response.vendor_id;
        await db
          .collection("details")
          .updateOne(
            { _id: details._id },
            { $set: { vendor_id: response.vendor_id } }
          );
        console.log(
          "🚀 ~ RestaurantController ~ Updated details with vendor_id:",
          details.vendor_id
        );
      }
      res.json({ response: response });
    } catch (error) {
      console.log("🚀 ~ RestaurantController ~ error:", error);
    }
  };
  private getVendor = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
      console.log("🚀 ~ RestaurantController ~ name:", name);
      //@ts-ignore
      const db = client.db(name);
      const details = await db.collection("details").findOne();
      if (!details.vendor_id)
        return res.json({ response: "No vendor_id found", code: 404 });
      const data = await fetch(
        `https://sandbox.cashfree.com/pg/easy-split/vendors/${details.vendor_id}`,
        {
          method: "GET",
          headers: {
            "x-api-version": "2022-09-01",
            "x-client-id": process.env.CASHFREE_XCLIENT_ID,
            "x-client-secret": process.env.CASHFREE_XCLIENT_SECRET,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("🚀 ~ RestaurantController ~ data:", data);
      const response = await data.json();
      console.log("🚀 ~ RestaurantController ~ response:", response);
      res.json({ response: response, code: 200 });
    } catch (error) {
      console.log("🚀 ~ RestaurantController ~ error:", error);
    }
  };
  private createDatabase = async (databaseName: string) => {
    try {
      // Connect to MongoDB Atlas
      await client.db(databaseName.toLowerCase()).createCollection("details");

      console.log(`Database '${databaseName}' created successfully`);
    } catch (error) {
      console.error("Error creating database:", error);
    }
  };
  private createNewRestaurant = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      await this.createDatabase(req.body.name);
      await client
        .db("restaurants")
        .collection("restaurants")
        .insertOne({
          uids: [req.headers.uid],
          name: req.body.name,
        });
      await client
        .db(req.body.name.toLowerCase())
        .collection("employees")
        .insertOne({
          //@ts-ignore
          _id: req.headers.uid,
          name: req.body.personName,
          email: req.body.email,
          role: ROLES.ADMIN,
          active: true,
        });
      await client
        .db(req.body.name.toLowerCase())
        .collection("details")
        .insertOne({
          contactName: req.body.personName,
          email: req.body.email,
        });
      res.json({ status: 1 });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  private getStatus = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
      //@ts-ignore
      const db = client.db(name);
      const collections = await db.collections();
      let details;
      let menuRes;
      if (collections.length >= 3) {
        details = await db.collection("details").findOne();
        console.log(
          "🚀 ~ RestaurantController ~ getStatus= ~ details:",
          details
        );
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
      }
      const menu = menuRes?.reduce((acc, category) => {
        acc[category.name] = {
          _id: category._id,
          dishes: category.dishes,
        };
        return acc;
      }, {});
      console.log(req.headers.role);
      res.json({
        status: collections.length === 2 ? 1 : collections.length === 4 ? 2 : 3,
        menu,
        details,
        role: req.headers.role,
      });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private getClients = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
      const { page, limit } = req.query;
      //@ts-ignore
      const db = client.db(name);
      const collections = await db.collections();
      let clientsRes;
      if (collections.length >= 3) {
        clientsRes = await db
          .collection("clients")
          .aggregate([
            {
              $lookup: {
                from: "orders",
                localField: "orders",
                foreignField: "_id",
                as: "orders",
              },
            },
            {
              $unwind: "$orders",
            },
            {
              $match: {
                "orders.status": { $eq: OrderStatus.COMPLETED },
              },
            },
            {
              $unwind: "$orders.orderDetails",
            },
            {
              $lookup: {
                from: "dishes",
                localField: "orders.orderDetails.dish",
                foreignField: "_id",
                as: "dishDetails",
              },
            },
            {
              $unwind: "$dishDetails",
            },
            {
              $group: {
                _id: {
                  clientId: "$_id",
                  dishId: "$orders.orderDetails.dish",
                },
                clientName: { $first: "$name" },
                clientEmail: { $first: "$email" },
                clientNumber: { $first: "$number" },
                dishName: { $first: "$dishDetails.name" },
                timesOrdered: { $sum: "$orders.orderDetails.qty" },
                orderAmounts: { $first: { $toDouble: "$orders.amount" } }, // Capture the order amount
              },
            },
            {
              $group: {
                _id: "$_id.clientId",
                clientName: { $first: "$clientName" },
                clientEmail: { $first: "$clientEmail" },
                clientNumber: { $first: "$clientNumber" },
                amountSpent: { $sum: "$orderAmounts" }, // Sum the order amounts for the client
                dishes: {
                  $push: {
                    dishName: "$dishName",
                    timesOrdered: "$timesOrdered",
                  },
                },
              },
            },
            {
              $project: {
                clientId: "$_id",
                clientEmail: 1,
                clientNumber: 1,
                clientName: 1,
                amountSpent: 1,
                dishes: 1,
              },
            },
            {
              $sort: { clientId: 1 },
            },
            {
              $skip: parseInt(page as string) * parseInt(limit as string),
            },
            { $limit: parseInt(limit as string) },
          ])
          .toArray();
      }
      res.json({
        clients: clientsRes,
      });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private addDetails = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
      if (
        !req.body.name ||
        !req.body.number ||
        !req.body.address ||
        (name as string).toLowerCase() !== req.body.name.toLowerCase()
      ) {
        return res.status(400).send({ msg: "incorrect fields" });
      }
      //@ts-ignore
      const db = client.db(name);
      console.log("🚀 ~ RestaurantController ~ addDetails= ~ db:", db);
      await db.collection("details").findOneAndUpdate(
        {},
        {
          $set: {
            name: req.body.name,
            number: req.body.number,
            address: req.body.address,
          },
        }
      );
      await db.createCollection("categories");
      await db.createCollection("dishes");
      res.json({ status: 2 });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  // private objectIdFromString = (inputId: number | string): ObjectId => {
  //   return typeof inputId === "number"
  //     ? ObjectId.createFromHexString(inputId.toString())
  //     : new ObjectId(inputId);
  // };
  isEqualExceptImage = (dish1: IDish, dish2: IDish): boolean => {
    const { image: image1, ...rest1 } = dish1;
    const { image: image2, ...rest2 } = dish2;
    return JSON.stringify(rest1) === JSON.stringify(rest2);
  };
  private extractCloudinaryPublicId = (url: string): string | null => {
    // Use a regex pattern to match the folder name and public ID
    const regex = /\/(?:[^\/]+\/)*([^\/]+\/[^\/]+?)\.[^\/]+$/;
    const match = url.match(regex);
    return match ? decodeURIComponent(match[1]) : null;
  };
  private handleDeleteDish = async (id: string, name: string) => {
    //@ts-ignore
    const db = client.db(name);
    //@ts-ignore
    const dish = await db.collection("dishes").findOneAndDelete({ _id: id });
    // console.log(
    //   "🚀 ~ RestaurantController ~ privatehandleDeleteDish ~ dish:",
    //   dish
    // );
    const imageUrl = dish.image;
    if (imageUrl) {
      const publicId = this.extractCloudinaryPublicId(imageUrl);
      console.log(
        "🚀 ~ RestaurantController ~ privatehandleDeleteDish ~ publicId:",
        publicId
      );

      // Delete the image from Cloudinary
      if (publicId) {
        const res = await cloudinary.v2.uploader.destroy(publicId);
        console.log(
          "🚀 ~ RestaurantController ~ privatehandleDeleteDish ~ res:",
          res
        );
      }
    }
  };
  private deleteDish = async (req: express.Request, res: express.Response) => {
    try {
      const { catId, dishId } = req.params;
      const { name } = req.headers;

      if (!catId || !dishId)
        return res.status(400).json({ msg: "catId or dishId is missing" });

      await this.handleDeleteDish(dishId, name as string);

      //@ts-ignore
      const db = client.db(name);
      await db.collection("categories").updateOne(
        { _id: new ObjectId(catId) },
        //@ts-ignore
        { $pull: { dishes: dishId } }
      );

      res.json({ msg: "deleted" });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private setDishUnavailable = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { catId, dishId } = req.params;
      const { available } = req.body;
      const { name } = req.headers;

      if (!catId || !dishId)
        return res.status(400).json({ msg: "catId or dishId is missing" });
      //@ts-ignore
      const db = client.db(name);
      const dish = await db.collection("dishes").findOneAndUpdate(
        //@ts-ignore
        { _id: dishId },
        { $set: { unavailable: !available } },
        { returnDocument: "after" }
      );

      res.json({ msg: "updated", dish });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private deleteCategory = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      const { id } = req.params;
      // console.log("🚀 ~ RestaurantController ~ id:", req.body);
      const { name } = req.headers;
      if (!id) return res.status(400).json({ msg: "no id sent" });
      //@ts-ignore
      const db = client.db(name);
      const category = await db
        .collection("categories")
        .findOneAndDelete({ _id: new ObjectId(id) });
      console.log("🚀 ~ RestaurantController ~ category:", category);
      // await category.dishes.forEach(async (id) => {
      //   this.handleDeleteDish(id, name as string);
      // });
      await Promise.all(
        category.dishes.map((id) => this.handleDeleteDish(id, name as string))
      );
      res.json({ msg: "deleted" });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
  private addMenu = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
      const {
        menu: rawMenu,
        draft,
        imagesUploaded: rawImagesUploaded,
      } = req.body;
      const menu = JSON.parse(rawMenu);
      const imagesUploaded = JSON.parse(rawImagesUploaded);
      console.log("🚀 ~ RestaurantController ~ addMenu= ~ draft:", draft);
      console.log(
        "🚀 ~ RestaurantController ~ addMenu= ~ imagesUploaded:",
        imagesUploaded
      );
      console.log("🚀 ~ RestaurantController ~ addMenu= ~ menu:", menu);
      if (!menu) return res.status(400);
      //@ts-ignore
      const db = client.db(name);
      const dishesCollection = db.collection("dishes");
      const categoriesCollection = db.collection("categories");
      const categoryPromises = Object.keys(menu).map(async (categoryName) => {
        const categoryDishes = menu[categoryName].dishes;

        const dishInsertPromises = categoryDishes.map(async (dish: IDish) => {
          // Check if dish already exists
          const existingDish = await dishesCollection.findOne({
            _id: dish._id,
          });

          if (imagesUploaded.includes(dish.name)) {
            const imageIndex = imagesUploaded.indexOf(dish.name);
            const imageBuffer = req.files[imageIndex].buffer;
            dish.image = await this.uploadImageToCloudinary(
              imageBuffer,
              `${name}_dishes`,
              `${categoryName}_dish_${dish.name}`
            );
          }

          // Check if dish exists and has changed
          if (
            existingDish &&
            //@ts-ignore
            !this.isEqualExceptImage(existingDish, dish)
          ) {
            // Update existing dish
            console.log(
              "🚀 ~ RestaurantController ~ dishInsertPromises ~ existingDish:",
              existingDish
            );
            await dishesCollection.updateOne(
              { _id: existingDish._id },
              { $set: { ...dish, category: categoryName } }
            );
            return existingDish._id;
          } else if (!existingDish) {
            // Insert new dish
            const { insertedId } = await dishesCollection.insertOne({
              ...dish,
              category: categoryName,
            });
            return insertedId;
          } else {
            // Skip update if dish exists and hasn't changed
            return existingDish._id;
          }
        });

        const dishInsertResults = await Promise.all(dishInsertPromises);
        const dishIds = dishInsertResults.map((result) => result);

        // Check if category already exists
        const existingCategory = await categoriesCollection.findOne({
          name: categoryName,
        });

        if (existingCategory) {
          // Check if category has changed
          const categoryDishesChanged =
            JSON.stringify(existingCategory.dishes) !== JSON.stringify(dishIds);
          if (categoryDishesChanged) {
            console.log(
              "🚀 ~ RestaurantController ~ categoryPromises ~ existingCategory:",
              existingCategory,
              JSON.stringify(existingCategory.dishes),
              JSON.stringify(dishIds)
            );
            // Update existing category
            await categoriesCollection.updateOne(
              { _id: existingCategory._id },
              { $set: { dishes: dishIds } }
            );
          }
        } else {
          // Insert new category
          const category: ICategory = {
            name: categoryName,
            dishes: dishIds,
          };
          await categoriesCollection.insertOne(category);
        }
      });

      await Promise.all(categoryPromises);

      if (draft == "false") {
        await Promise.all([
          db.createCollection("clients"),
          db.createCollection("orders"),
        ]);
      }

      res.json({ status: draft === "false" ? 4 : 3 });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  // private addMenu = async (req: express.Request, res: express.Response) => {
  //   try {
  //     const { name } = req.headers;
  //     const {
  //       menu: rawMenu,
  //       draft,
  //       imagesUploaded: rawImagesUploaded,
  //     } = req.body;
  //     const menu = JSON.parse(rawMenu);
  //     const imagesUploaded = JSON.parse(rawImagesUploaded);

  //     console.log("🚀 ~ RestaurantController ~ addMenu= ~ draft:", draft);
  //     console.log(
  //       "🚀 ~ RestaurantController ~ addMenu= ~ imagesUploaded:",
  //       imagesUploaded
  //     );
  //     console.log("🚀 ~ RestaurantController ~ addMenu= ~ menu:", menu);

  //     if (!menu) return res.status(400);

  //     //@ts-ignore
  //     const db = client.db(name);
  //     const dishesCollection = db.collection("dishes");
  //     const categoriesCollection = db.collection("categories");

  //     const categoryPromises = Object.keys(menu).map(async (categoryName) => {
  //       const categoryDishes = menu[categoryName].dishes;
  //       let index = 0;
  //       const dishInsertPromises: Promise<ObjectId>[] = categoryDishes.map(
  //         async (dish: IDish) => {
  //           if (imagesUploaded.includes(dish.name)) {
  //             const imageBuffer = req.files[index].buffer;
  //             dish.image = await this.uploadImageToCloudinary(
  //               imageBuffer,
  //               `${name}_dishes`,
  //               `${categoryName}_dish_${dish.name}`
  //             );
  //             index += 1;
  //           }
  //           const { insertedId } = await dishesCollection.insertOne(dish);
  //           return insertedId;
  //         }
  //       );

  //       const dishInsertResults = await Promise.all(dishInsertPromises);
  //       // Convert dish IDs from strings to MongoDB ObjectIDs
  //       const dishIds = dishInsertResults.map((result) => new ObjectId(result));

  //       const category: ICategory = {
  //         name: categoryName,
  //         dishes: dishIds,
  //       };

  //       return categoriesCollection.insertOne(category);
  //     });

  //     await Promise.all(categoryPromises);

  //     if (!draft) await db.createCollection("clients");

  //     res.json({ status: 3 });
  //   } catch (err) {
  //     console.log(err);
  //     res.status(500).send(err);
  //   }
  // };
}
export default RestaurantController;
