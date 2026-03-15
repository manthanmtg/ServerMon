import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import connectDB from '@/lib/db';
import User from '@/models/User';

export const dynamic = 'force-dynamic';

export default async function RootPage() {
  try {
    await connectDB();
    const userCount = await User.countDocuments();

    if (userCount === 0) {
      redirect('/setup');
    }
  } catch {
    redirect('/setup');
  }

  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }

  redirect('/login');
}
