import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { USER_SELECT, SENDER_SELECT, uploadUserAvatar, deleteUploadedFile, encryptUploadedFile } from '../shared';

const router = Router();

// Поиск пользователей
router.get('/search', async (req: AuthRequest, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim().length < 3) {
      res.json([]);
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: q } },
          { displayName: { contains: q } },
        ],
        NOT: { id: req.userId },
      },
      select: USER_SELECT,
      take: 20,
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Профиль пользователя
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: String(req.params.id) },
      select: USER_SELECT,
    });

    if (!user) {
      res.status(404).json({ error: 'Пользователь не найден' });
      return;
    }

    // Check if current user is blocked by the requested user
    const blocked = await prisma.blockedUser.findFirst({
      where: {
        userId: String(req.params.id),
        blockedUserId: req.userId!,
      },
    });

    // If blocked, hide avatar and show as offline with old lastSeen
    if (blocked) {
      res.json({
        ...user,
        avatar: null,
        isOnline: false,
        lastSeen: new Date('2020-01-01'),
      });
      return;
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить аватар
router.post('/avatar', uploadUserAvatar.single('avatar'), encryptUploadedFile, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old avatar file if exists
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
    if (currentUser?.avatar) deleteUploadedFile(currentUser.avatar);

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: avatarUrl },
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// Загрузить баннер
router.post('/banner', uploadUserAvatar.single('banner'), encryptUploadedFile, async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old banner file if exists
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { banner: true } });
    if (currentUser?.banner) deleteUploadedFile(currentUser.banner);

    const bannerUrl = `/uploads/avatars/${req.file.filename}`;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { banner: bannerUrl, bannerColor: null },
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка загрузки баннера' });
  }
});

// Установить цветной баннер
router.post('/banner/color', async (req: AuthRequest, res) => {
  try {
    const { color } = req.body;

    if (!color || typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      res.status(400).json({ error: 'Некорректный цвет (формат: #RRGGBB)' });
      return;
    }

    // Delete old banner file if exists
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { banner: true } });
    if (currentUser?.banner) deleteUploadedFile(currentUser.banner);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { banner: null, bannerColor: color },
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка установки цвета баннера' });
  }
});

// Удалить баннер
router.delete('/banner', async (req: AuthRequest, res) => {
  try {
    // Delete file from disk
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { banner: true } });
    if (currentUser?.banner) deleteUploadedFile(currentUser.banner);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { banner: null, bannerColor: null },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления баннера' });
  }
});

// Установить украшение аватара
router.post('/avatar/decoration', async (req: AuthRequest, res) => {
  try {
    const { decoration } = req.body;

    const validDecorations = ['none', 'headphones', 'roses', 'crown', 'halo', 'fire', 'sparkles', 'hearts', 'stars'];

    if (!decoration || !validDecorations.includes(decoration)) {
      res.status(400).json({ error: 'Некорректное украшение' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatarDecoration: decoration === 'none' ? null : decoration },
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка установки украшения' });
  }
});

// Удалить аватар
router.delete('/avatar', async (req: AuthRequest, res) => {
  try {
    // Delete file from disk
    const currentUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { avatar: true } });
    if (currentUser?.avatar) deleteUploadedFile(currentUser.avatar);

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { avatar: null },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// Обновить профиль (username НЕ меняется!)
router.put('/profile', async (req: AuthRequest, res) => {
  try {
    const { displayName, bio, birthday } = req.body;

    // Validate field lengths
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.length === 0 || displayName.length > 50)) {
      res.status(400).json({ error: 'Имя должно быть от 1 до 50 символов' });
      return;
    }
    if (bio !== undefined && bio !== null && (typeof bio !== 'string' || bio.length > 500)) {
      res.status(400).json({ error: 'Био должно быть не длиннее 500 символов' });
      return;
    }
    if (birthday !== undefined && birthday !== null) {
      if (typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday) || isNaN(Date.parse(birthday))) {
        res.status(400).json({ error: 'Некорректный формат даты рождения (YYYY-MM-DD)' });
        return;
      }
    }

    const updateData: Record<string, string | null> = {};
    if (displayName !== undefined) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (birthday !== undefined) updateData.birthday = birthday;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Поиск сообщений
router.get('/messages/search', async (req: AuthRequest, res) => {
  try {
    const { q, chatId } = req.query;
    if (!q || typeof q !== 'string') {
      res.json([]);
      return;
    }

    const where: Record<string, unknown> = {
      content: { contains: q },
      isDeleted: false,
    };

    if (chatId) {
      where.chatId = chatId;
      const member = await prisma.chatMember.findUnique({
        where: { chatId_userId: { chatId: chatId as string, userId: req.userId! } },
      });
      if (member?.clearedAt) {
        where.createdAt = { gt: member.clearedAt };
      }
    } else {
      where.chat = {
        members: { some: { userId: req.userId } },
      };
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: { select: SENDER_SELECT },
        chat: {
          select: {
            id: true,
            name: true,
            type: true,
            members: {
              include: {
                user: { select: { id: true, username: true, displayName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // For global search (no chatId filter), filter out messages before clearedAt per chat
    let filtered = messages;
    if (!chatId) {
      const memberships = await prisma.chatMember.findMany({
        where: { userId: req.userId! },
        select: { chatId: true, clearedAt: true },
      });
      const clearedMap = new Map<string, Date>();
      for (const m of memberships) {
        if (m.clearedAt) clearedMap.set(m.chatId, m.clearedAt);
      }
      if (clearedMap.size > 0) {
        filtered = messages.filter((msg) => {
          const cleared = clearedMap.get(msg.chatId);
          if (!cleared) return true;
          return new Date(msg.createdAt) > new Date(cleared);
        });
      }
    }

    res.json(filtered);
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить настройки приватности
router.put('/settings', async (req: AuthRequest, res) => {
  try {
    const { hideStoryViews } = req.body;

    const updateData: Record<string, boolean> = {};
    if (typeof hideStoryViews === 'boolean') updateData.hideStoryViews = hideStoryViews;

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: updateData,
      select: USER_SELECT,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сохранения настроек' });
  }
});

// Заблокировать пользователя
router.post('/block', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;

    if (!userId || userId === req.userId) {
      res.status(400).json({ error: 'Некорректный ID пользователя' });
      return;
    }

    await prisma.blockedUser.create({
      data: {
        userId: req.userId!,
        blockedUserId: userId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Ошибка блокировки пользователя' });
  }
});

// Разблокировать пользователя
router.post('/unblock', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      res.status(400).json({ error: 'Некорректный ID пользователя' });
      return;
    }

    await prisma.blockedUser.deleteMany({
      where: {
        userId: req.userId!,
        blockedUserId: userId,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ error: 'Ошибка разблокировки пользователя' });
  }
});

// Получить список заблокированных пользователей
router.get('/blocked', async (req: AuthRequest, res) => {
  try {
    const blocked = await prisma.blockedUser.findMany({
      where: { userId: req.userId },
      include: {
        blockedUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
          },
        },
      },
    });

    res.json(blocked.map(b => b.blockedUser));
  } catch (error) {
    console.error('Get blocked users error:', error);
    res.status(500).json({ error: 'Ошибка получения списка' });
  }
});

// Проверить заблокирован ли пользователь
router.get('/blocked/:userId', async (req: AuthRequest, res) => {
  try {
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const blocked = await prisma.blockedUser.findUnique({
      where: {
        userId_blockedUserId: {
          userId: req.userId!,
          blockedUserId: targetUserId,
        },
      },
    });

    res.json({ blocked: !!blocked });
  } catch (error) {
    console.error('Check blocked user error:', error);
    res.status(500).json({ error: 'Ошибка проверки' });
  }
});

// Получить ссылки из чата с пользователем
router.get('/:userId/links', async (req: AuthRequest, res) => {
  try {
    const targetUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
    const currentUserId = req.userId!;

    // Find personal chat between these two users
    const chat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        members: {
          every: {
            OR: [
              { userId: currentUserId },
              { userId: targetUserId },
            ],
          },
        },
      },
      select: { id: true },
    });

    if (!chat) {
      res.json([]);
      return;
    }

    // Get all links from this chat
    const links = await prisma.sharedLink.findMany({
      where: { chatId: chat.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(links);
  } catch (error) {
    console.error('Get user links error:', error);
    res.status(500).json({ error: 'Ошибка получения ссылок' });
  }
});

export default router;
