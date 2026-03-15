import mongoose from 'mongoose';
import User from './src/models/User';
import connectDB from './src/lib/db';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function checkUsers() {
  await connectDB();
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
