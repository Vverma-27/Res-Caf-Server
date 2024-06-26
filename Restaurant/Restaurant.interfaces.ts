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
  total: number;
  clientId: mongoose.ObjectId;
  orderDetails: { dish: mongoose.ObjectId; qty: number }[];
}
