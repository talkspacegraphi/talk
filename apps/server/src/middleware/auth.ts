import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: string;
}

// Token blacklist check is done lazily (import from db to avoid circular deps)
let _prisma: any = null;
async function getPrisma() {
  if (!_prisma) {
    const mod = await import('../db');
    _prisma = mod.prisma;
  }
  return _prisma;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };

    // Check if token is blacklisted (for logout) — async but fire-and-forget check
    getPrisma()
      .then((prisma: any) => prisma.tokenBlacklist.findUnique({ where: { token } }))
      .then((blacklisted: any) => {
        if (blacklisted) {
          res.status(401).json({ error: 'Token has been revoked' });
          return;
        }
        req.userId = decoded.userId;
        next();
      })
      .catch(() => {
        // If DB check fails, allow the request
        req.userId = decoded.userId;
        next();
      });
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
    return;
  }
}
