import mongoose, {Schema} from "mongoose"

const subscriptionSchema = new Schema({
    subscriber: {
        type: Schema.Types.ObjectId, // ONE WHO IS SUBSCRIBING
        ref: "User"
    },
    channel: {
        type: Schema.Types.ObjectId, // ONE to whom 'subscriber ' is subscribing
        ref: "User"
    }
},{timestamps: true})

export const Subscription = mongoose.model("Subscription",subscriptionSchema)