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
import authMiddleware from "../middleware/auth";
import { MongoClient, ObjectId } from "mongodb";
import config from "../config";
import { client } from "../services/mongo";
import { ICategory, IDish, OrderStatus } from "./Restaurant.interfaces";
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
      upload.array("images", 30),
      this.addMenu
    );
    this.router.post(
      `${this.route}/details`,
      authMiddleware,
      restaurantMiddleware,
      this.addDetails
    );
    this.router.delete(
      `${this.route}/category/:id`,
      authMiddleware,
      restaurantMiddleware,
      this.deleteCategory
    );
    this.router.delete(
      `${this.route}/dish/:catId/:dishId`,
      authMiddleware,
      restaurantMiddleware,
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
      this.getStatus
    );
    this.router.get(
      `${this.route}/orders`,
      authMiddleware,
      restaurantMiddleware,
      this.getOrders
    );
    this.router.get(
      `${this.route}/clients`,
      authMiddleware,
      restaurantMiddleware,
      this.getClients
    );
    // this.router.put(
    //   `${this.route}/menu`,
    //   upload.array("images", 20),
    //   this.handleMenuUpdate
    // );
    this.router.post(
      `${this.route}/bank`,
      authMiddleware,
      restaurantMiddleware,
      this.createVendor
    );
    this.router.get(
      `${this.route}/bank`,
      authMiddleware,
      restaurantMiddleware,
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
      res.json({ response: response });
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
        .insertOne({ uid: req.headers.uid, name: req.body.name });
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
      res.json({
        status: collections.length === 1 ? 1 : collections.length === 3 ? 2 : 3,
        menu,
        details,
      });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };

  private getClients = async (req: express.Request, res: express.Response) => {
    try {
      const { name } = req.headers;
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
        !req.body.email ||
        !req.body.contactName ||
        !req.body.number ||
        !req.body.address ||
        name !== req.body.name
      ) {
        return res.status(400).send({ msg: "incorrect fields" });
      }
      //@ts-ignore
      const db = client.db(name);
      console.log("🚀 ~ RestaurantController ~ addDetails= ~ db:", db);
      await db.collection("details").insertOne({
        name: req.body.name,
        email: req.body.email,
        contactName: req.body.contactName,
        number: req.body.number,
        address: req.body.address,
      });
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
              { $set: dish }
            );
            return existingDish._id;
          } else if (!existingDish) {
            // Insert new dish
            const { insertedId } = await dishesCollection.insertOne(dish);
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
