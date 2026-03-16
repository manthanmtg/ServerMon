import mongoose from 'mongoose';

const QuickAccessItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    href: { type: String, required: true },
    label: { type: String, required: true },
    icon: { type: String, required: true },
  },
  { _id: false }
);

const QuickAccessSettingsSchema = new mongoose.Schema({
  _id: { type: String, default: 'quick-access-settings' },
  items: { type: [QuickAccessItemSchema], default: [] },
  updatedAt: { type: Date, default: Date.now },
});

export default mongoose.models.QuickAccessSettings ||
  mongoose.model('QuickAccessSettings', QuickAccessSettingsSchema);
