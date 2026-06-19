import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import bcrypt from 'bcryptjs';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    // 1. Authorize requesting user is an admin
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 2. Handle GET (List customers)
    if (req.method === 'GET') {
      const customers = await User.find({ role: 'customer' })
        .select('-passwordHash -pushSubscription')
        .sort({ createdAt: -1 });
      return res.status(200).json({ customers });
    }

    // 3. Handle POST (Create customer)
    if (req.method === 'POST') {
      const { name, phone, password, age, gender, heightCm, weightKg, startDate } = req.body;

      if (!name || !phone || !password) {
        return res.status(400).json({ error: 'Name, phone, and password are required' });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ phone });
      if (existingUser) {
        return res.status(400).json({ error: 'A user with this phone number already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const customer = await User.create({
        name,
        phone,
        passwordHash,
        role: 'customer',
        age: age ? Number(age) : undefined,
        gender,
        heightCm: heightCm ? Number(heightCm) : undefined,
        weightKg: weightKg ? Number(weightKg) : undefined,
        startDate: startDate ? new Date(startDate) : new Date(),
      });

      // return created user (without password hash)
      const createdObj = customer.toObject();
      delete createdObj.passwordHash;

      return res.status(201).json({ customer: createdObj });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[admin-customers]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
