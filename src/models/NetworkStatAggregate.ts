import mongoose, { Document, Model, Schema } from 'mongoose';

interface NetworkStatPoint {
    iface: string;
    rx_sec: number;
    tx_sec: number;
}

export interface INetworkStatAggregate extends Document {
    bucketStart: Date;
    interfaces: NetworkStatPoint[];
    createdAt: Date;
}

const NetworkStatPointSchema = new Schema<NetworkStatPoint>(
    {
        iface: { type: String, required: true },
        rx_sec: { type: Number, required: true },
        tx_sec: { type: Number, required: true },
    },
    { _id: false }
);

const NetworkStatAggregateSchema = new Schema(
    {
        bucketStart: { type: Date, required: true, unique: true, index: true },
        interfaces: { type: [NetworkStatPointSchema], default: [] },
    },
    { timestamps: true }
);

const NetworkStatAggregate: Model<INetworkStatAggregate> =
    mongoose.models.NetworkStatAggregate ||
    mongoose.model<INetworkStatAggregate>('NetworkStatAggregate', NetworkStatAggregateSchema);

export default NetworkStatAggregate;
