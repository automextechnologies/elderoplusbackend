import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const UserSchema = new mongoose.Schema({
  name: String,
  phone: String,
  role: String,
  pushSubscription: mongoose.Schema.Types.Mixed
}, { collection: 'users' });

const User = mongoose.model('User', UserSchema);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const allCustomers = await User.find({ role: 'customer' });
  console.log(`Total customers: ${allCustomers.length}`);

  const subscribedCustomers = await User.find({
    role: 'customer',
    pushSubscription: { $ne: null }
  });
  console.log(`Subscribed customers (with $ne: null): ${subscribedCustomers.length}`);

  subscribedCustomers.forEach(c => {
    console.log(`Customer: ${c.name}, phone: ${c.phone}, subscription:`, JSON.stringify(c.pushSubscription));
  });

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
