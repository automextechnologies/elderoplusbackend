import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import bcrypt from 'bcryptjs';
import { signToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ error: 'Phone and password are required' });
    }

    const cleanPhone = phone.toString().trim();
    const cleanPassword = password.toString().trim();
    const digitsOnly = cleanPhone.replace(/\D/g, '');

    let user = await User.findOne({ phone: cleanPhone }).populate('batchId').populate('packageId');
    if (!user && digitsOnly) {
      user = await User.findOne({ phone: digitsOnly }).populate('batchId').populate('packageId');
    }
    if (!user && digitsOnly) {
      user = await User.findOne({ phone: { $regex: digitsOnly, $options: 'i' } }).populate('batchId').populate('packageId');
    }

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(cleanPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ userId: user._id.toString() });

    const effectiveStartDate = user.batchId ? user.batchId.startDate : user.startDate;
    const batchName = user.batchId ? user.batchId.name : null;

    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=2592000`);
    return res.status(200).json({
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        age: user.age,
        gender: user.gender,
        heightCm: user.heightCm,
        weightKg: user.weightKg,
        startDate: effectiveStartDate,
        batchName,
        batchId: user.batchId ? user.batchId._id : null,
        packageId: user.packageId ? user.packageId._id : null,
        packageName: user.packageId ? user.packageId.name : null,
        packageItems: user.packageId ? user.packageId.items : [],
        challengeStarted: user.batchId ? true : !!user.challengeStarted,
      },
      token,
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
