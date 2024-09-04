import { ObjectId } from "mongodb";
import mongoose, { Schema } from "mongoose";
export interface ICategory {
  name: string;
  _id?: ObjectId;
  dishes: ObjectId[];
}
export interface IDish {
  _id?: ObjectId;
  name: String;
  price: Number;
  description?: String;
  image?: String;
  vegan: Boolean;
}
export interface IDetails {
  name: string;
  number: string;
  email: string;
  address: string;
  contactName: string;
}
export interface IClient {
  name: string;
  number: string;
  email: string;
  orders: mongoose.ObjectId[];
}
export interface IOrder {
  _id: ObjectId;
  amount: number;
  orderDetails: Array<{ dish: string; qty: number; numSplitters: string }>;
  status: OrderStatus;
  remainingAmount: number;
  date: Date | string;
  transactions: Array<{ clientId: ObjectId; amount: number; items: string }>;
  orderIds: string[];
}
export enum OrderStatus {
  CREATED = "CREATED",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAIDINFULL = "PAIDINFULL",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}
export enum ROLES {
  ADMIN = "ADMIN",
  EMPLOYEE = "EMPLOYEE",
}
