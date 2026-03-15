import mongoose, { Document, Model, Schema } from 'mongoose';

export interface FileBrowserShortcut {
  id: string;
  label: string;
  path: string;
}

export interface IFileBrowserSettings extends Document {
  shortcuts: FileBrowserShortcut[];
  defaultPath: string;
  editorMaxBytes: number;
  previewMaxBytes: number;
  updatedAt: Date;
}

const FileBrowserShortcutSchema = new Schema<FileBrowserShortcut>(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    path: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const FileBrowserSettingsSchema: Schema = new Schema(
  {
    _id: { type: String, default: 'file-browser-settings' },
    shortcuts: {
      type: [FileBrowserShortcutSchema],
      default: [],
    },
    defaultPath: { type: String, default: '' },
    editorMaxBytes: { type: Number, default: 1024 * 1024, min: 32768, max: 10 * 1024 * 1024 },
    previewMaxBytes: { type: Number, default: 512 * 1024, min: 32768, max: 10 * 1024 * 1024 },
  },
  { timestamps: true }
);

const FileBrowserSettings: Model<IFileBrowserSettings> =
  mongoose.models.FileBrowserSettings ||
  mongoose.model<IFileBrowserSettings>('FileBrowserSettings', FileBrowserSettingsSchema);

export default FileBrowserSettings;
