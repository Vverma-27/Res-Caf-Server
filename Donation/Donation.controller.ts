import express from "express";
import razorPayInstance from "../services/razorpay";
import { v4 as uuidv4 } from "uuid";
import Donation from "./Donation.model";
import crypto from "crypto";

class DonationController {
  private router: express.Router;
  private route = "/donations";
  constructor() {
    this.router = express.Router();
    this.initializeRoutes();
  }
  private initializeRoutes() {
    this.router.get(this.route, this.getAllDonations);
    this.router.post(`${this.route}/verification`, this.handleWebhook);
    this.router.post(`${this.route}`, this.createDonationRequest);
  }
  private createDonationRequest = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      //@ts-ignore
      let { amount, frequency, identifier } = req.body;
      amount = parseInt(amount);
      console.log(process.env.RAZORPAY_KEY_SECRET, process.env.RAZORPAY_KEY_ID);
      console.log(amount);
      if (frequency === "one-time") {
        const order = await razorPayInstance.orders.create({
          amount: amount * 100,
          currency: "INR",
          receipt: uuidv4(),
        });
        // const donation = await Donation.create({
        //   transactionId: order.id,
        //   amount: order.amount,
        //   type: "o",
        //   // identifier,
        // });
        res.json({
          order_id: order.id,
          amount: order.amount,
          currency: order.currency,
          // id: donation.id,
        });
        // await Donation.create({
        //   date: new Date(order.created_at),
        //   amount: order.amount / 100,
        //   receiptId: order.receipt,
        //   orderId: order.id,
        //   verified: false,
        // });
      } else {
        const plan = await razorPayInstance.plans.create({
          period: frequency,
          interval: 1,
          item: {
            name: "New plan",
            amount: amount * 100,
            currency: "INR",
          },
        });
        console.log("plan ", plan);
        const subs = await razorPayInstance.subscriptions.create({
          plan_id: plan.id,
          customer_notify: 1,
          quantity: 1,
          total_count: 1,
        });
        // const donation = await Donation.create({
        //   transactionId: subs.id,
        //   amount,
        //   type: "r",
        //   // identifier,
        // });
        res.json({
          subscription_id: subs.id,
          amount: amount,
          currency: "INR",
          // id: donation.id,
        });
        // await Donation.create({
        //   date: new Date(subs.created_at),
        //   amount: amount,
        //   subscriptionId: subs.id,
        //   verified: false,
        // });
      }
      // console.log(order);
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
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
      await Donation.create({ donation: req.body });
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
  // private verifyPayment = async (
  //   req: express.Request,
  //   res: express.Response
  // ) => {
  //   const generated_signature = crypto.createHmac(
  //     "sha256",
  //     process.env.RAZORPAY_KEY_SECRET
  //   );
  //   const donation = await Donation.findById(req.body.id);
  //   console.log(
  //     donation.transactionId,
  //     donation,
  //     donation.transactionId === req.body.razorpay_order_id,
  //     req.body.razorpay_order_id
  //   );
  //   if (donation.type === "o")
  //     generated_signature.update(
  //       donation.transactionId + "|" + req.body.razorpay_payment_id
  //     );
  //   else
  //     generated_signature.update(
  //       req.body.razorpay_payment_id + "|" + donation.transactionId
  //     );
  //   const expected = generated_signature.digest("hex");
  //   console.log(expected);
  //   // console.log(
  //   //   generated_signature.digest("hex").toString() ===
  //   //     req.body.razorpay_signature
  //   //   // generated_signature_1.digest()
  //   // );
  //   // console.log(generated_signature.digest("hex")[0]);
  //   // for (let index in req.body.razorpay_signature) {
  //   //   if (
  //   //     req.body.razorpay_signature[index] !==
  //   //     generated_signature.digest("hex")[index]
  //   //   )
  //   //     console.log(
  //   //       "not equal ",
  //   //       index,
  //   //       req.body.razorpay_signature[index],
  //   //       generated_signature.digest("hex")[index]
  //   //     );
  //   // }
  //   if (expected === req.body.razorpay_signature) {
  //     // const transaction = new Transaction({
  //     //   transactionid: req.body.transactionid,
  //     //   transactionamount: req.body.transactionamount,
  //     // })
  //     donation.verified = true;
  //     await donation.save();
  //     // await Donation.create({
  //     //   transactionId: req.body.transactionid,
  //     //   amount: req.body.transactionamount,
  //     // });
  //     return res.json({ success: true });
  //     // transaction.save(function (err, savedtransac) {
  //     //   if (err) {
  //     //     console.log(err);
  //     //     return res.status(500).send("Some Problem Occured");
  //     //   }
  //     //   res.send({ transaction: savedtransac });
  //     // });
  //     // return res.send('success');
  //   } else {
  //     return res.json({ success: false });
  //   }
  // };
  // private verifyPayment = async (req, res) => {
  //   const resp = razorPayInstance.payments.paymentVerification(
  //     {
  //       subscription_id: "sub_ID6MOhgkcoHj9I",
  //       payment_id: "pay_IDZNwZZFtnjyym",
  //       signature:
  //         "601f383334975c714c91a7d97dd723eb56520318355863dcf3821c0d07a17693",
  //     },
  //     process.env.RAZORPAY_KEY_SECRET
  //   );
  //   console.log(resp);
  //   res.json({ success: true });
  // };
  private getAllDonations = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      console.log("hello");
      const donations = await Donation.find();
      res.json({ donations });
    } catch (err) {
      console.log(err);
      res.status(500).send(err);
    }
  };
}
export default DonationController;
