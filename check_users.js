const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env.local') });

// Manually define User schema for simplicity in script
const UserSchema = new mongoose.Schema({
  username: String,
  isActive: Boolean,
  totpEnabled: Boolean,
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function checkUsers() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({ isActive: true });
  console.log(
    'Available users:',
    users.map((u) => ({ username: u.username, totpEnabled: u.totpEnabled }))
  );
  process.exit(0);
}

checkUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
