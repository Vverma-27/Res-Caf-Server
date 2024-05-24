import { NextFunction, Request, Response } from "express";
import admin from "firebase-admin";
import { client } from "../../services/mongo";

const subdomainMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const host = req.headers.host.split(":")[0]; // Split to remove port if present
  console.log("🚀 ~ host:", host);
  //   console.log(req.headers.authtoken);
  const subdomains = host.split(".").slice(0, -2); // Extract subdomains (e.g., [howdy, example, local] -> [howdy])
  console.log("🚀 ~ subdomains:", subdomains);
  req.mySubdomains = subdomains;
  next();
};

export default subdomainMiddleware;
