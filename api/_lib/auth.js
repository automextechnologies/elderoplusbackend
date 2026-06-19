import jwt from 'jsonwebtoken';

export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(req) {
  const cookie = req.cookies?.token;
  const header = req.headers?.authorization?.replace('Bearer ', '');
  const token = cookie || header;
  if (!token) throw new Error('No token');
  return jwt.verify(token, process.env.JWT_SECRET);
}
