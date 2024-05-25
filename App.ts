import express from "express";
import config from "./config";
import cors from "cors";
import mongoose from "mongoose";
import initializeCloudinary from "./services/cloudinary";
import initialiseFirebaseAdmin from "./services/firebase";
import initializeClient from "./services/mongo";
class App {
  private app: express.Application;
  private port: number;
  constructor(controllers: any, port: number) {
    this.app = express();
    this.port = port;
    this.initializeMiddlewares();
    this.initializeControllers(controllers);
  }
  private initializeMiddlewares() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(cors());
    initializeClient();
    initializeCloudinary();
    initialiseFirebaseAdmin();
  }
  private initializeControllers(controllers: any) {
    controllers.forEach(
      ({ subdomain, controller }: { subdomain: string; controller: any }) => {
        // this.app.use("/api/", controller.router);
        this.app.use((req, res, next) => {
          if (
            subdomain === req.subdomains.slice(-1)[0] ||
            (subdomain === "client" &&
              req.subdomains.length > 0 &&
              req.subdomains.slice(-1)[0] !== "admin" &&
              req.subdomains.slice(-1)[0] !== "example")
          ) {
            controller.router(req, res, next);
          } else {
            next();
          }
        });
      }
    );
  }
  public listen() {
    this.app.listen(this.port, () => {
      console.log(`App listening on the port ${this.port}`);
    });
  }
}

export default App;
