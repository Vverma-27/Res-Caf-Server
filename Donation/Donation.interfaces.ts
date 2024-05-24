import mongoose, { Schema } from "mongoose";
export interface IDonation {
  _id: mongoose.Types.ObjectId;
  donation: any;
  // identifier: string;
}
