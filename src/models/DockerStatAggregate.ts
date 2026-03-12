import mongoose, { Document, Model, Schema } from 'mongoose';

interface DockerStatPoint {
    containerId: string;
    name: string;
    cpuPercent: number;
    memoryPercent: number;
    memoryUsageBytes: number;
    memoryLimitBytes: number;
    blockReadBytes: number;
    blockWriteBytes: number;
    networkInBytes: number;
    networkOutBytes: number;
}

export interface IDockerStatAggregate extends Document {
    bucketStart: Date;
    containers: DockerStatPoint[];
    createdAt: Date;
}

const DockerStatPointSchema = new Schema<DockerStatPoint>(
    {
        containerId: { type: String, required: true },
        name: { type: String, required: true },
        cpuPercent: { type: Number, required: true },
        memoryPercent: { type: Number, required: true },
        memoryUsageBytes: { type: Number, required: true },
        memoryLimitBytes: { type: Number, required: true },
        blockReadBytes: { type: Number, required: true },
        blockWriteBytes: { type: Number, required: true },
        networkInBytes: { type: Number, required: true },
        networkOutBytes: { type: Number, required: true },
    },
    { _id: false }
);

const DockerStatAggregateSchema = new Schema(
    {
        bucketStart: { type: Date, required: true, unique: true, index: true },
        containers: { type: [DockerStatPointSchema], default: [] },
    },
    { timestamps: true }
);

const DockerStatAggregate: Model<IDockerStatAggregate> =
    mongoose.models.DockerStatAggregate ||
    mongoose.model<IDockerStatAggregate>('DockerStatAggregate', DockerStatAggregateSchema);

export default DockerStatAggregate;
