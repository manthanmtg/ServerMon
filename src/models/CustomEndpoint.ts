import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

export const CustomEndpointZodSchema = z.object({
    name: z.string().min(1).max(100).trim(),
    slug: z.string().min(1).max(100).trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().max(500).optional(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    endpointType: z.enum(['script', 'logic', 'webhook']),
    scriptLang: z.enum(['python', 'bash', 'node']).optional(),
    scriptContent: z.string().max(100_000).optional(),
    logicConfig: z.object({
        requestSchema: z.string().max(50_000).optional(),
        responseMapping: z.string().max(50_000).optional(),
        handlerCode: z.string().max(100_000).optional(),
    }).optional(),
    webhookConfig: z.object({
        targetUrl: z.string().url(),
        method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
        forwardHeaders: z.boolean().optional(),
        transformBody: z.string().max(50_000).optional(),
    }).optional(),
    envVars: z.record(z.string(), z.string()).optional(),
    auth: z.enum(['public', 'token']).default('public'),
    tags: z.array(z.string().max(50)).max(20).default([]),
    enabled: z.boolean().default(true),
    timeout: z.number().min(1000).max(120_000).default(30_000),
    responseHeaders: z.record(z.string(), z.string()).optional(),
});

export type ICustomEndpointDTO = z.infer<typeof CustomEndpointZodSchema>;

export interface ICustomEndpointToken {
    _id: mongoose.Types.ObjectId;
    name: string;
    hashedToken: string;
    prefix: string;
    createdAt: Date;
    lastUsedAt?: Date;
    expiresAt?: Date;
}

export interface ICustomEndpoint extends Document, Omit<ICustomEndpointDTO, 'tags'> {
    _id: mongoose.Types.ObjectId;
    tokens: ICustomEndpointToken[];
    tags: string[];
    lastExecutedAt?: Date;
    executionCount: number;
    lastStatus?: number;
}

const TokenSubSchema = new Schema(
    {
        name: { type: String, required: true },
        hashedToken: { type: String, required: true },
        prefix: { type: String, required: true },
        lastUsedAt: { type: Date },
        expiresAt: { type: Date },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

const CustomEndpointSchema: Schema = new Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, index: true, trim: true },
        description: { type: String, trim: true },
        method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], required: true },
        endpointType: { type: String, enum: ['script', 'logic', 'webhook'], required: true },
        scriptLang: { type: String, enum: ['python', 'bash', 'node'] },
        scriptContent: { type: String },
        logicConfig: {
            requestSchema: { type: String },
            responseMapping: { type: String },
            handlerCode: { type: String },
        },
        webhookConfig: {
            targetUrl: { type: String },
            method: { type: String, enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            forwardHeaders: { type: Boolean },
            transformBody: { type: String },
        },
        envVars: { type: Map, of: String },
        auth: { type: String, enum: ['public', 'token'], default: 'public' },
        tokens: [TokenSubSchema],
        tags: [{ type: String, trim: true }],
        enabled: { type: Boolean, default: true },
        timeout: { type: Number, default: 30_000, min: 1000, max: 120_000 },
        responseHeaders: { type: Map, of: String },
        lastExecutedAt: { type: Date },
        executionCount: { type: Number, default: 0 },
        lastStatus: { type: Number },
    },
    {
        timestamps: true,
    }
);

const CustomEndpoint: Model<ICustomEndpoint> =
    mongoose.models.CustomEndpoint || mongoose.model<ICustomEndpoint>('CustomEndpoint', CustomEndpointSchema);

export default CustomEndpoint;
