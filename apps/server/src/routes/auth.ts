import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../db';
import { config } from '../config';
import { USER_SELECT } from '../shared';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// ─── Strict registration rate limiter: 3 registrations per IP per hour ───
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // increased for dev
  message: { error: 'Слишком много регистраций с этого IP. Попробуйте через час.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
});

// In-memory cooldown: track last registration timestamp per IP (prevents rapid-fire even within rate limit)
const registrationCooldowns = new Map<string, number>();
const REGISTRATION_COOLDOWN_MS = 10 * 1000; // 10 seconds for dev (was 5 minutes)

// Cleanup stale cooldowns every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamp] of registrationCooldowns) {
    if (now - timestamp > REGISTRATION_COOLDOWN_MS * 10) {
      registrationCooldowns.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ─── Token helpers ────────────────────────────────────────────────────

function generateAccessToken(userId: string): string {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '2h' as any });
}

function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString('hex');
}

async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.jwtRefreshExpiryDays);

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });

  return token;
}

async function blacklistAccessToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (decoded?.exp) {
      const expiresAt = new Date(decoded.exp * 1000);
      // Only blacklist if not already expired
      if (expiresAt > new Date()) {
        await prisma.tokenBlacklist.upsert({
          where: { token },
          create: { token, expiresAt },
          update: {},
        });
      }
    }
  } catch {
    // Ignore decode errors
  }
}

// Cleanup expired refresh tokens and blacklisted tokens every hour
setInterval(async () => {
  try {
    await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.tokenBlacklist.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {}
}, 60 * 60 * 1000);

// Регистрация
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { username, displayName, password, bio } = req.body;

    // ── IP cooldown check ──
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const lastReg = registrationCooldowns.get(clientIp);
    if (lastReg && Date.now() - lastReg < REGISTRATION_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((REGISTRATION_COOLDOWN_MS - (Date.now() - lastReg)) / 1000);
      res.status(429).json({ error: `Подождите ${waitSeconds} сек. перед созданием нового аккаунта` });
      return;
    }

    // ── Permanent IP limit (DB-level) ──
    const accountsFromIp = await prisma.user.count({ where: { registrationIp: clientIp } });
    if (accountsFromIp >= config.maxRegistrationsPerIp) {
      res.status(403).json({ error: `Максимум ${config.maxRegistrationsPerIp} аккаунта с одного IP. Лимит исчерпан.` });
      return;
    }

    if (!username || !password) {
      res.status(400).json({ error: '❌ Заполните все обязательные поля' });
      return;
    }

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      res.status(400).json({ error: '⚠️ Username должен содержать от 3 до 20 символов (латиница, цифры, _)' });
      return;
    }

    if (password.length < config.minPasswordLength) {
      res.status(400).json({ error: `🔒 Пароль должен содержать минимум ${config.minPasswordLength} символов` });
      return;
    }

    // Password must contain at least one letter and one digit
    if (!/[a-zA-Zа-яА-Я]/.test(password) || !/\d/.test(password)) {
      res.status(400).json({ error: '🔑 Пароль должен содержать буквы и цифры' });
      return;
    }

    // Validate optional fields
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length > 50)) {
      res.status(400).json({ error: '📝 Имя не должно превышать 50 символов' });
      return;
    }
    if (bio !== undefined && (typeof bio !== 'string' || bio.length > 500)) {
      res.status(400).json({ error: '📄 Описание не должно превышать 500 символов' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (existing) {
      res.status(400).json({ error: '👤 Этот username уже занят. Попробуйте другой' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        displayName: (displayName || username).slice(0, 50),
        password: hashedPassword,
        bio: bio ? bio.slice(0, 500) : null,
        registrationIp: clientIp,
      },
      select: USER_SELECT,
    });

    const token = generateAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id);

    // Track registration for cooldown
    registrationCooldowns.set(clientIp, Date.now());

    res.json({ token, refreshToken, user: { ...user, isOnline: true } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: '❌ Введите username и пароль' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { ...USER_SELECT, password: true, isBlocked: true },
    });

    if (!user) {
      res.status(400).json({ error: '🔍 Пользователь не найден. Проверьте username' });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ error: '🚫 Аккаунт заблокирован навсегда за нарушение правил' });
      return;
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(400).json({ error: '🔐 Неверный пароль. Попробуйте снова' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { isOnline: true, lastSeen: new Date() },
    });

    const token = generateAccessToken(user.id);
    const refreshToken = await createRefreshToken(user.id);

    const { password: _, ...userWithoutPassword } = user;
    res.json({ token, refreshToken, user: { ...userWithoutPassword, isOnline: true } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Refresh access token using refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token required' });
      return;
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { select: { id: true, isBlocked: true } } },
    });

    if (!storedToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    if (storedToken.expiresAt < new Date()) {
      // Token expired, delete it
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      res.status(401).json({ error: 'Refresh token expired' });
      return;
    }

    if (storedToken.user.isBlocked) {
      // Delete all tokens for blocked user
      await prisma.refreshToken.deleteMany({ where: { userId: storedToken.userId } });
      res.status(403).json({ error: 'Account blocked' });
      return;
    }

    // Rotate: delete old refresh token and create new one (token rotation)
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const newAccessToken = generateAccessToken(storedToken.userId);
    const newRefreshToken = await createRefreshToken(storedToken.userId);

    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Logout — blacklist access token + delete refresh token
router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      await blacklistAccessToken(token);
    }

    // Delete all refresh tokens for this user
    if (req.userId) {
      await prisma.refreshToken.deleteMany({ where: { userId: req.userId } });
    }

    res.json({ message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Текущий пользователь — uses authenticateToken middleware
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: USER_SELECT,
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    res.json({ user });
  } catch {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
