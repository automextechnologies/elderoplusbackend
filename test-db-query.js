import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const UserSchema = new mongoose.Schema({
  name: String,
  phone: String,
  passwordHash: String,
  role: String,
}, { collection: 'users' });

const User = mongoose.model('User', UserSchema);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const user = await User.findOne({ phone: '1234567890' });
  console.log('Found user 1234567890:', user);

  if (user) {
    const valid = await bcrypt.compare('password123', user.passwordHash);
    console.log('Is password123 valid for 1234567890?', valid);
    if (!valid) {
      console.log('Resetting password for 1234567890 to password123...');
      const newHash = await bcrypt.hash('password123', 10);
      user.passwordHash = newHash;
      await user.save();
      console.log('Password reset successfully!');
    }
  } else {
    console.log('User 1234567890 does not exist! Creating default customer 1234567890 / password123...');
    const newHash = await bcrypt.hash('password123', 10);
    await User.create({
      name: 'Eldro User',
      phone: '1234567890',
      passwordHash: newHash,
      role: 'customer',
      age: 65,
      gender: 'male',
      heightCm: 170,
      weightKg: 70,
      startDate: new Date(),
    });
    console.log('Created user 1234567890 successfully!');
  }

  // Also check admin user 9999999999
  const admin = await User.findOne({ phone: '9999999999' });
  if (admin) {
    const adminValid = await bcrypt.compare('admin123', admin.passwordHash);
    console.log('Is admin123 valid for 9999999999?', adminValid);
    if (!adminValid) {
      console.log('Resetting password for 9999999999 to admin123...');
      const newAdminHash = await bcrypt.hash('admin123', 10);
      admin.passwordHash = newAdminHash;
      await admin.save();
      console.log('Admin password reset successfully!');
    }
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
