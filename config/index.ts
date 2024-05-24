import dotenv from 'dotenv';
dotenv.config();
export default {
  PORT: parseInt(process.env.PORT) || 3000,
  MONGO_USER: process.env.MONGO_INITDB_ROOT_USERNAME,
  MONGO_PASSWORD: process.env.MONGO_INITDB_ROOT_PASSWORD,
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
};
