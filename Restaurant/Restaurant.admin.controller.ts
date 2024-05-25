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
import sharp from "sharp";
import authMiddleware from "../middleware/auth";
import { MongoClient, ObjectId } from "mongodb";
import config from "../config";
import { client } from "../services/mongo";
import { ICategory, IDish } from "./Restaurant.interfaces";
import restaurantMiddleware from "../middleware/restaurant/admin";
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    files: 20, // Maximum number of files allowed
    fileSize: 2 * 1024 * 1024, // Maximum file size (in bytes), here it's set to 2MB
  },
});
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
    this.router.get(
      `${this.route}/status`,
      authMiddleware,
      restaurantMiddleware,
      this.getStatus
    );
    // this.router.put(
    //   `${this.route}/menu`,
    //   upload.array("images", 20),
    //   this.handleMenuUpdate
    // );
    this.router.post(`${this.route}/verification`, this.handleWebhook);
    // this.router.post(
    //   `${this.route}/menu`,
    //   upload.single("menu"),
    //   this.handleMenuUpload
    // );
  }

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
      const menu = menuRes.reduce((acc, category) => {
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
        const dishInsertPromises: Promise<ObjectId>[] = categoryDishes.map(
          async (dish: IDish, index) => {
            if (imagesUploaded.includes(dish.name)) {
              //@ts-ignore
              const imageBuffer = req.files[index].buffer;
              dish.image = await this.uploadImageToCloudinary(
                imageBuffer,
                `${name}_dishes`,
                `${categoryName}_dish_${dish.name}`
              );
            }
            const { insertedId } = await dishesCollection.insertOne(dish);
            return insertedId;
          }
        );

        const dishInsertResults = await Promise.all(dishInsertPromises);
        // Convert dish IDs from strings to MongoDB ObjectIDs
        const dishIds = dishInsertResults.map((result) => new ObjectId(result));

        const category: ICategory = {
          name: categoryName,
          dishes: dishIds,
        };

        return categoriesCollection.insertOne(category);
      });

      await Promise.all(categoryPromises);

      if (!draft) await db.createCollection("clients");

      res.json({ status: 3 });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
}
export default RestaurantController;
