import express from "express";
import config from "./config";
import cors from "cors";
import mongoose from "mongoose";
import initializeCloudinary from "./services/cloudinary";
import initialiseFirebaseAdmin from "./services/firebase";
import initializeClient from "./services/mongo";
import subdomainMiddleware from "./middleware/subdomain";
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
    this.app.use(subdomainMiddleware);
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
            subdomain === req.mySubdomains[0] ||
            (subdomain === "client" &&
              req.subdomains.length > 0 &&
              req.subdomains[0] !== "admin" &&
              req.subdomains[0] !== "example")
          ) {
            // console.log(req.headers.authtoken);
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
