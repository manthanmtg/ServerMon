import mongoose, { Schema, Document, Model } from 'mongoose';
import { z } from 'zod';

// Zod Schema for User Validation (Source of Truth)
export const UserZodSchema = z.object({
    username: z.string().min(3).max(20).trim(),
    passwordHash: z.string(),
    role: z.enum(['admin', 'user']).default('user'),
    totpSecret: z.string().optional(),
    totpEnabled: z.boolean().default(false),
    isActive: z.boolean().default(true),
    lastLoginAt: z.date().optional(),
    createdBy: z.string().optional(), // Admin ID who created this user
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export type IUserDTO = z.infer<typeof UserZodSchema>;

// Mongoose Interface
export interface IUser extends Document, Omit<IUserDTO, 'createdAt' | 'updatedAt'> {
    _id: mongoose.Types.ObjectId;
}

const UserSchema: Schema = new Schema(
    {
        username: { type: String, required: true, unique: true, index: true },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: ['admin', 'user'], default: 'user' },
        totpSecret: { type: String },
        totpEnabled: { type: Boolean, default: false },
        isActive: { type: Boolean, default: true },
        lastLoginAt: { type: Date },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    {
        timestamps: true,
    }
);

// Prevent re-compiling the model in development (Next.js HMR)
const User: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
