// import mongoose, { model, Schema } from "mongoose";
// import {
//   ICategory,
//   IClient,
//   IDetails,
//   IDish,
//   IOrder,
// } from "./Restaurant.interfaces";

// // const RestaurantSchema = new Schema<IRestaurant>({
// // menu: [{
// //   name: { type: String, required: true, unique: true },
// //   dishes: [{
// //     name: { type: String, required: true, unique: true },
// //     price: { type: Number, required: true },
// //     description: { type: String },
// //     img: { type: String }
// //   }]
// // }],
// //   name: { type: String, required: true, unique: true }
// // });

// // const Restaurant = model<IRestaurant>("Restaurant", RestaurantSchema);

// // export default Restaurant;

// const DetailsSchema = new Schema<IDetails>({
//   name: { type: String, required: true, unique: true },
//   email: { type: String, required: true, unique: true },
//   contactName: { type: String, required: true, unique: true },
//   number: { type: String, required: true, unique: true },
//   address: { type: String, required: true, unique: true },
// });

// const CategoriesSchema = new Schema<ICategory>({
//   name: { type: String, required: true, unique: true },
//   dishes: [
//     { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
//   ],
// });

// const DishSchema = new Schema<IDish>({
//   name: { type: String, required: true, unique: true },
//   price: { type: Number, required: true },
//   description: { type: String },
//   image: { type: String },
//   vegan: { type: Boolean, required: true },
// });

// const ClientSchema = new Schema<IClient>({
//   name: { type: String, required: true, unique: true },
//   number: { type: String, required: true, unique: true },
//   email: { type: String, required: true, unique: true },
//   orders: [{ type: mongoose.Schema.Types.ObjectId, required: true }],
// });

// const OrderSchema = new Schema<IOrder>({
//   total: { type: Number, required: true, unique: true },
//   clientId: {
//     type: mongoose.Schema.Types.ObjectId,
//     required: true,
//     unique: true,
//   },
//   orderDetails: [
//     {
//       dish: {
//         type: mongoose.Schema.Types.ObjectId,
//         required: true,
//         unique: true,
//       },
//       qty: { type: Number, required: true },
//     },
//   ],
// });

// const Details = mongoose.model<IDetails>("Details", DetailsSchema);
// const Clients = mongoose.model<IClient>("Clients", ClientSchema);
// const Categories = mongoose.model<ICategory>("Categories", CategoriesSchema);
// const Dish = mongoose.model<IDish>("Dish", DishSchema);
// const Order = mongoose.model<IOrder>("OrderSchema", OrderSchema);

// export { Details, Clients, Categories, Dish, Order };
