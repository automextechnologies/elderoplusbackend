import { connectDB } from '../_lib/mongodb.js';
import User from '../_lib/models/User.js';
import Package from '../_lib/models/Package.js';
import { verifyToken } from '../_lib/auth.js';
import { handleCors } from '../_lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  await connectDB();

  try {
    const { userId } = verifyToken(req);
    const requestingUser = await User.findById(userId);
    if (!requestingUser || requestingUser.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden. Admin access required.' });
    }

    // 1. Handle GET (List packages)
    if (req.method === 'GET') {
      const packages = await Package.find().sort({ createdAt: -1 });
      const packagesWithCount = await Promise.all(packages.map(async (p) => {
        const count = await User.countDocuments({ packageId: p._id, role: 'customer' });
        return {
          ...p.toObject(),
          customerCount: count
        };
      }));
      return res.status(200).json({ packages: packagesWithCount });
    }

    // 2. Handle POST (Create package)
    if (req.method === 'POST') {
      const { name, description, items, price } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Package Name is required' });
      }

      // Check if package already exists
      const existingPackage = await Package.findOne({ name });
      if (existingPackage) {
        return res.status(400).json({ error: 'A package with this name already exists' });
      }

      const parsedItems = Array.isArray(items) ? items : (items ? items.split(',').map(i => i.trim()).filter(Boolean) : []);

      const newPackage = await Package.create({
        name,
        description,
        items: parsedItems,
        price: price ? Number(price) : 0
      });

      return res.status(201).json({ package: { ...newPackage.toObject(), customerCount: 0 } });
    }

    // 3. Handle PUT (Edit package)
    if (req.method === 'PUT') {
      const { id, name, description, items, price } = req.body;
      if (!id) {
        return res.status(400).json({ error: 'Package ID is required' });
      }
      if (!name) {
        return res.status(400).json({ error: 'Package Name is required' });
      }

      const packageToUpdate = await Package.findById(id);
      if (!packageToUpdate) {
        return res.status(404).json({ error: 'Package not found' });
      }

      // Check for duplicate name
      if (name !== packageToUpdate.name) {
        const duplicate = await Package.findOne({ name });
        if (duplicate) {
          return res.status(400).json({ error: 'A package with this name already exists' });
        }
      }

      const parsedItems = Array.isArray(items) ? items : (items ? items.split(',').map(i => i.trim()).filter(Boolean) : []);

      packageToUpdate.name = name;
      packageToUpdate.description = description;
      packageToUpdate.items = parsedItems;
      packageToUpdate.price = price ? Number(price) : 0;

      await packageToUpdate.save();

      const count = await User.countDocuments({ packageId: packageToUpdate._id, role: 'customer' });
      return res.status(200).json({ package: { ...packageToUpdate.toObject(), customerCount: count } });
    }

    // 4. Handle DELETE (Delete package)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Package ID is required' });
      }

      const packageToDelete = await Package.findById(id);
      if (!packageToDelete) {
        return res.status(404).json({ error: 'Package not found' });
      }

      // Nullify packageId for all users assigned to this package
      await User.updateMany({ packageId: id }, { packageId: null });

      await Package.deleteOne({ _id: id });
      return res.status(200).json({ message: 'Package deleted successfully' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err.message === 'No token' || err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    console.error('[packages]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
