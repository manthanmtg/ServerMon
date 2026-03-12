import mongoose, { Document, Model, Schema } from 'mongoose';

export type StorageUnitSystem = 'binary' | 'decimal';

export interface IDiskSettings extends Document {
    unitSystem: StorageUnitSystem;
    updatedAt: Date;
}

const DiskSettingsSchema: Schema = new Schema(
    {
        _id: { type: String, default: 'disk-settings' },
        unitSystem: { 
            type: String, 
            enum: ['binary', 'decimal'], 
            default: 'binary' 
        },
    },
    { timestamps: true }
);

const DiskSettings: Model<IDiskSettings> =
    mongoose.models.DiskSettings ||
    mongoose.model<IDiskSettings>('DiskSettings', DiskSettingsSchema);

export default DiskSettings;
