import express from "express";
import config from "./config";
import cors from "cors";
import mongoose from "mongoose";
import next from "next";
//@ts-ignore
import cookieParser from "cookie-parser";
import initializeCloudinary from "./services/cloudinary";
import initialiseFirebaseAdmin from "./services/firebase";
import initializeClient from "./services/mongo";
import { Server, Socket } from "socket.io";
import { createServer } from "http";
import { DefaultEventsMap } from "socket.io/dist/typed-events";
interface CustomSocket extends Socket {
  clientName: string; // Define your custom property here
}
interface IShareReq {
  name: string;
  dish: string;
  price: number;
  image: string;
  veg: boolean;
  _id: string;
  numSplitters: number;
}

class App {
  private app: express.Application;
  private server: any;
  private io: Server<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap
  >;
  private port: number;
  constructor(controllers: any, port: number) {
    this.app = express();
    this.port = port;
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"],
      },
      transports: ["websocket", "polling"],
    });
    this.initializeMiddlewares();
    // this.initializeNext();
    this.initializeControllers(controllers);
  }
  private initializeMiddlewares() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    const corsOptions = {
      credentials: true,
      origin: (origin, callback) => {
        // Allow requests from all origins
        callback(null, true);
      },
    };
    this.app.use(cors(corsOptions));
    this.app.use(cookieParser());
    initializeClient();
    initializeCloudinary();
    initialiseFirebaseAdmin();
  }
  private async initializeControllers(controllers: any) {
    const dev = process.env.NODE_ENV !== "production";
    const nextApp = next({ dev, dir: "./client" }); // Point to the client directory
    await nextApp.prepare();
    controllers.forEach(
      ({ subdomain, controller }: { subdomain: string; controller: any }) => {
        // this.app.use("/api/", controller.router);
        this.app.use((req, res, next) => {
          // console.log(
          //   "🚀 ~ App ~ this.app.use ~ req.subdomains.slice(-2)[0]:",
          //   req.subdomains.slice(-1)[0] === "api"
          // );
          if (req.subdomains.slice(-1)[0] === "api") {
            if (
              subdomain === req.subdomains.slice(-2)[0] ||
              (subdomain === "client" &&
                req.subdomains.length > 0 &&
                req.subdomains.slice(-2)[0] !== "admin" &&
                req.subdomains.slice(-2)[0] !== "example")
            ) {
              // console.log(
              //   "🚀 ~ App ~ this.app.use ~ req.subdomains.slice(-2)[0]:",
              //   req.subdomains.slice(-1)[0] === "api"
              // );
              controller.router(req, res, next);
            } else {
              next();
            }
          } else {
            if (
              req.method === "GET" &&
              req.subdomains.slice(-1)[0] !== "admin"
            ) {
              console.log("next handle");
              return nextApp.getRequestHandler()(req, res);
            } else {
              return next();
            }
          }
        });
      }
    );
  }
  // private async initializeNext() {
  //   const dev = process.env.NODE_ENV !== "production";
  //   const nextApp = next({ dev, dir: "./client" }); // Point to the client directory
  //   await nextApp.prepare();

  //   // Define a route handler to handle all Next.js requests
  //   console.log("🚀 ~ App ~ initializeNext ~ dev:", dev);
  //   this.app.get("/", (req, res, next) => {
  //     console.log("🚀 ~ App ~ initializeNext ~ dev:", dev);
  //     if (
  //       req.method === "GET" &&
  //       req.subdomains.slice(-1)[0] !== "api" &&
  //       req.subdomains.slice(-1)[0] !== "admin"
  //     ) {
  //       return nextApp.getRequestHandler()(req, res);
  //     } else {
  //       return next();
  //     }
  //   });
  // }
  logUsersInRoom = (room: string) => {
    const clients = this.io.sockets.adapter.rooms.get(room);
    if (clients) {
      console.log(`Users in room ${room}:`);
      clients.forEach((clientId) => {
        const clientSocket = this.io.sockets.sockets.get(clientId);
        if (clientSocket) {
          console.log(`- ${clientSocket.id}`); // Access stored device info
        }
      });
    } else {
      console.log(`Room ${room} does not exist or is empty`);
    }
  };
  getSocketsInRoom = (room: string) => {
    const clients = this.io.sockets.adapter.rooms.get(room);
    const sockets = [];
    if (clients) {
      console.log(`Users in room ${room}:`);
      clients.forEach((clientId) => {
        const clientSocket = this.io.sockets.sockets.get(
          clientId
        ) as CustomSocket;
        if (clientSocket) {
          sockets.push(clientSocket.clientName);
          console.log(`- ${clientSocket.id}`);
          console.log(`  User Agent:`, clientSocket.clientName); // Access stored device info
        }
      });
    } else {
      console.log(`Room ${room} does not exist or is empty`);
    }
    return sockets;
  };
  getSocketsByName = (room: string, name: string) => {
    const clients = this.io.sockets.adapter.rooms.get(room);
    const socket = null;
    if (clients) {
      console.log(`Users in room ${room}:`);
      clients.forEach((clientId) => {
        const clientSocket = this.io.sockets.sockets.get(
          clientId
        ) as CustomSocket;
        if (clientSocket.clientName === name) {
          return socket;
        }
      });
    } else {
      console.log(`Room ${room} does not exist or is empty`);
    }
    return null;
  };
  public listen() {
    this.io.on("connection", (socket: CustomSocket) => {
      const query = socket.handshake.query as { [key: string]: string };
      const { table: tableRoom, name } = query;
      if (tableRoom) {
        const users = this.getSocketsInRoom(tableRoom);
        if (users.includes(name)) {
          console.log("🚀 ~ App ~ this.io.on ~ name:", users);
          socket.disconnect();
        }
        socket.join(tableRoom);
        socket.clientName = name;
        this.io.to(tableRoom).emit("users", this.getSocketsInRoom(tableRoom));
      } else {
        console.log("No table parameter provided in query");
      }
      socket.on("send-req", (e: IShareReq) => {
        const socketsInRoom = this.io.sockets.adapter.rooms.get(tableRoom);
        if (socketsInRoom) {
          for (const socketId of socketsInRoom) {
            const targetSocket = this.io.sockets.sockets.get(
              socketId as string
            ) as CustomSocket;
            if (targetSocket && targetSocket.clientName === e.name) {
              targetSocket.emit("share-req", { ...e, name }); // Send the request to the target socket
              break;
            }
          }
        }
      });
      socket.on("accept-req", (e: IShareReq) => {
        const socketsInRoom = this.io.sockets.adapter.rooms.get(tableRoom);
        if (socketsInRoom) {
          for (const socketId of socketsInRoom) {
            const targetSocket = this.io.sockets.sockets.get(
              socketId as string
            ) as CustomSocket;
            if (targetSocket && targetSocket.clientName === e.name) {
              targetSocket.emit("accept-req", { ...e, name }); // Send the request to the target socket
              targetSocket.broadcast.emit("update-splitters", {
                dish: e.dish,
                numSplitters: e.numSplitters + 1,
              });
              break;
            }
          }
        }
      });
      socket.on("disconnect", () => {
        this.io.to(tableRoom).emit("users", this.getSocketsInRoom(tableRoom));
        console.log("user disconnected");
      });
    });
    this.server.listen(this.port, () => {
      console.log(`App listening on the port ${this.port}`);
    });
  }
}

export default App;
