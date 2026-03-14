import mongoose from 'mongoose';

const BrandSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'brand-settings' },
    pageTitle: { type: String, default: 'ServerMon' },
    logoBase64: { type: String, default: '' }, // Data URI or base64 string
    updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.BrandSettings || mongoose.model('BrandSettings', BrandSettingsSchema);
