import { redirect } from 'next/navigation';
import connectDB from '@/lib/db';
import User from '@/models/User';

export default async function IndexPage() {
  await connectDB();

  // Check if system is initialized
  const userCount = await User.countDocuments();

  if (userCount === 0) {
    redirect('/setup');
  } else {
    redirect('/dashboard');
  }
}
