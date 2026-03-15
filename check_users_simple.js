const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: String,
  isActive: Boolean,
  totpEnabled: Boolean,
});
const User = mongoose.models.User || mongoose.model('User', UserSchema);

async function checkUsers() {
  const mongoUri = process.argv[2];
  if (!mongoUri) {
    console.error('Usage: node check_users.js <mongo_uri>');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  const users = await User.find({ isActive: true });
  console.log(
    'Available users:',
    JSON.stringify(users.map((u) => ({ username: u.username, totpEnabled: u.totpEnabled })))
  );
  process.exit(0);
}

checkUsers().catch((err) => {
  console.error(err);
  process.exit(1);
});
