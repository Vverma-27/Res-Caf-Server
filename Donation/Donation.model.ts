import { model, Schema } from "mongoose";
import { IDonation } from "./Donation.interfaces";

const DonationSchema = new Schema<IDonation>({
  donation: Schema.Types.Mixed,
});

const Donation = model<IDonation>("Donation", DonationSchema);

export default Donation;
