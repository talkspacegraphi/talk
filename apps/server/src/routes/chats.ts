import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AuthRequest } from '../middleware/auth';
import { USER_SELECT, SENDER_SELECT, uploadGroupAvatar, deleteUploadedFile, encryptUploadedFile } from '../shared';
import { getOnlineUsers } from '../socket';

const router = Router();

// Compact user select for chat member lists (no bio/birthday)
const CHAT_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  isOnline: true,
  lastSeen: true,
};

// Получить все чаты пользователя
router.get('/', async (req: AuthRequest, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        members: { some: { userId: req.userId } },
      },
      include: {
        members: {
          include: { user: { select: CHAT_USER_SELECT } },
        },
        messages: {
          where: {
            isDeleted: false,
            OR: [
              { scheduledAt: null },
              { senderId: req.userId! },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
        pinnedMessages: {
          orderBy: { pinnedAt: 'desc' },
          take: 1,
          include: {
            message: {
              include: {
                sender: { select: SENDER_SELECT },
                media: true,
              },
            },
          },
        },
      },
    });

    // Get all users who blocked current user
    const blockedByUsers = await prisma.blockedUser.findMany({
      where: { blockedUserId: req.userId! },
      select: { userId: true },
    });
    const blockedBySet = new Set(blockedByUsers.map(b => b.userId));

    // Hide avatar and set offline for users who blocked current user
    const chatsWithBlockedInfo = chats.map(chat => ({
      ...chat,
      members: chat.members.map(member => {
        if (blockedBySet.has(member.user.id)) {
          return {
            ...member,
            user: {
              ...member.user,
              avatar: null,
              isOnline: false,
              lastSeen: new Date('2020-01-01'),
            },
          };
        }
        return member;
      }),
    }));

    // Batch unread counts in a single query to avoid N+1
    const chatIds = chatsWithBlockedInfo.map(c => c.id);
    let unreadCounts: Array<{ chatId: string; count: bigint }> = [];
    if (chatIds.length > 0) {
      unreadCounts = await prisma.$queryRaw<Array<{ chatId: string; count: bigint }>>(
        Prisma.sql`SELECT m."chatId", COUNT(m.id) as count FROM "Message" m
         LEFT JOIN "ReadReceipt" rr ON rr."messageId" = m.id AND rr."userId" = ${req.userId}
         WHERE m."chatId" IN (${Prisma.join(chatIds)})
         AND m."senderId" != ${req.userId} AND m."isDeleted" = false AND rr.id IS NULL
         AND m."scheduledAt" IS NULL
         GROUP BY m."chatId"`
      ).catch(() => [] as Array<{ chatId: string; count: bigint }>);
    }

    const unreadMap = new Map(unreadCounts.map(r => [r.chatId, Number(r.count)]));

    // Filter last message by clearedAt per user
    const chatsFiltered = chatsWithBlockedInfo.map((chat) => {
      const member = chat.members.find((m) => m.userId === req.userId);
      const clearedAt = member?.clearedAt;
      if (clearedAt && chat.messages.length > 0) {
        const filtered = chat.messages.filter((msg) => new Date(msg.createdAt) > new Date(clearedAt));
        return { ...chat, messages: filtered };
      }
      return chat;
    });

    const sortedChats = chatsFiltered.sort((a, b) => {
      const aPinned = a.members.find((m) => m.userId === req.userId)?.isPinned || false;
      const bPinned = b.members.find((m) => m.userId === req.userId)?.isPinned || false;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aDate = a.messages[0]?.createdAt || a.createdAt;
      const bDate = b.messages[0]?.createdAt || b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    const chatsWithUnread = sortedChats.map((chat) => ({
      ...chat,
      unreadCount: unreadMap.get(chat.id) || 0,
    }));

    res.json(chatsWithUnread);
  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать личный чат
router.post('/personal', async (req: AuthRequest, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'ID пользователя обязателен' });
      return;
    }

    const existingChat = await prisma.chat.findFirst({
      where: {
        type: 'personal',
        AND: [
          { members: { some: { userId: req.userId } } },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existingChat) {
      res.json({ ...existingChat, unreadCount: 0 });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'personal',
        members: {
          create: [{ userId: req.userId! }, { userId }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать или получить чат "Избранное" (saved messages)
router.post('/favorites', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;

    // Check if favorites chat already exists
    const existing = await prisma.chat.findFirst({
      where: {
        type: 'favorites',
        members: { some: { userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    if (existing) {
      res.json({ ...existing, unreadCount: 0 });
      return;
    }

    const chat = await prisma.chat.create({
      data: {
        type: 'favorites',
        name: null,
        members: {
          create: [{ userId, role: 'admin' }],
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create favorites chat error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать групповой чат
router.post('/group', async (req: AuthRequest, res) => {
  try {
    const { name, memberIds } = req.body;
    if (!name || !memberIds || !Array.isArray(memberIds)) {
      res.status(400).json({ error: 'Название и участники обязательны' });
      return;
    }

    // Validate group name length
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      res.status(400).json({ error: 'Название группы должно быть от 1 до 100 символов' });
      return;
    }

    // Limit max members
    if (memberIds.length > 256) {
      res.status(400).json({ error: 'Максимум 256 участников в группе' });
      return;
    }

    const allMemberIds = [...new Set([req.userId!, ...memberIds])];

    const chat = await prisma.chat.create({
      data: {
        type: 'group',
        name,
        members: {
          create: allMemberIds.map((uid) => ({
            userId: uid,
            role: uid === req.userId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
        messages: true,
      },
    });

    res.json({ ...chat, unreadCount: 0 });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить чат по ID
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const chat = await prisma.chat.findFirst({
      where: {
        id: String(req.params.id),
        members: { some: { userId: req.userId } },
      },
      include: {
        members: { include: { user: { select: CHAT_USER_SELECT } } },
      },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить группу (только админ)
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const { name } = req.body;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может редактировать группу' });
      return;
    }

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { name },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузить аватар группы (только админ)
router.post('/:id/avatar', uploadGroupAvatar.single('avatar'), encryptUploadedFile, async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не загружен' });
      return;
    }

    // Delete old avatar file
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: avatarUrl },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    console.error('Upload group avatar error:', error);
    res.status(500).json({ error: 'Ошибка загрузки аватара' });
  }
});

// Удалить аватар группы (только админ)
router.delete('/:id/avatar', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может менять аватар группы' });
      return;
    }

    // Delete file from disk
    const currentChat = await prisma.chat.findUnique({ where: { id: chatId }, select: { avatar: true } });
    if (currentChat?.avatar) deleteUploadedFile(currentChat.avatar);

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { avatar: null },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Ошибка удаления аватара' });
  }
});

// Добавить участников в группу (только админ)
router.post('/:id/members', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: 'Необходимо указать пользователей' });
      return;
    }

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может добавлять участников' });
      return;
    }

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat || chat.type !== 'group') {
      res.status(400).json({ error: 'Чат не является группой' });
      return;
    }

    for (const uid of userIds) {
      await prisma.chatMember.upsert({
        where: { chatId_userId: { chatId, userId: uid } },
        create: { chatId, userId: uid, role: 'member' },
        update: {},
      });
    }

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Ошибка добавления участников' });
  }
});

// Удалить участника из группы (только админ)
router.delete('/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const targetUserId = String(req.params.userId);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });

    if (!member || member.role !== 'admin') {
      res.status(403).json({ error: 'Только администратор может удалять участников' });
      return;
    }

    if (targetUserId === req.userId) {
      res.status(400).json({ error: 'Нельзя удалить себя из группы' });
      return;
    }

    await prisma.chatMember.delete({
      where: { chatId_userId: { chatId, userId: targetUserId } },
    });

    const updatedChat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        members: { include: { user: { select: USER_SELECT } } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, username: true, displayName: true } },
            readBy: { select: { userId: true } },
          },
        },
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Ошибка удаления участника' });
  }
});

// Очистить чат для себя
router.post('/:id/clear', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    // Delete user's links from this chat
    await prisma.sharedLink.deleteMany({
      where: {
        chatId,
        userId,
      },
    }).catch(() => {});

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { clearedAt: new Date() },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Ошибка очистки чата' });
  }
});

// Удалить чат (для текущего пользователя — выйти из чата)
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { members: true },
    });

    if (!chat) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    // Membership check
    const isMember = chat.members.some(m => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    if (chat.type === 'personal') {
      // For personal chats, delete the entire chat for both users
      const otherMember = chat.members.find(m => m.userId !== userId);

      // Delete associated links first
      await prisma.sharedLink.deleteMany({ where: { chatId } }).catch(() => {});

      // Delete the chat completely (cascade will delete members, messages, etc.)
      await prisma.chat.delete({ where: { id: chatId } });

      const io = req.app.get('io') as import('socket.io').Server | undefined;
      const onlineUsers = getOnlineUsers();

      console.log('Deleting chat:', chatId, 'by user:', userId);
      console.log('Other member:', otherMember?.userId);
      console.log('Online users:', onlineUsers ? Array.from(onlineUsers.keys()) : 'none');

      if (io && onlineUsers) {
        // Notify the user who deleted the chat
        const userSockets = onlineUsers.get(userId);
        console.log('User sockets:', userSockets ? Array.from(userSockets) : 'none');
        if (userSockets) {
          for (const sid of userSockets) {
            console.log('Emitting to user socket:', sid);
            io.to(sid).emit('chat_deleted_by_other', { chatId, deletedBy: userId, forUser: userId });
          }
        }

        // Notify other member that chat was deleted
        if (otherMember) {
          const targetSockets = onlineUsers.get(otherMember.userId);
          console.log('Target sockets:', targetSockets ? Array.from(targetSockets) : 'none');
          if (targetSockets) {
            for (const sid of targetSockets) {
              console.log('Emitting to target socket:', sid);
              io.to(sid).emit('chat_deleted_by_other', { chatId, deletedBy: userId, forUser: otherMember.userId });
            }
          }
        }
      }
    } else if (chat.members.length <= 1) {
      // Last member — delete the group entirely

      // Delete associated links first
      await prisma.sharedLink.deleteMany({ where: { chatId } }).catch(() => {});

      await prisma.chat.delete({ where: { id: chatId } });

      const io = req.app.get('io') as import('socket.io').Server | undefined;
      const onlineUsers = getOnlineUsers();

      if (io && onlineUsers) {
        const userSockets = onlineUsers.get(userId);
        if (userSockets) {
          for (const sid of userSockets) {
            io.to(sid).emit('chat_deleted_by_other', { chatId, deletedBy: userId, forUser: userId });
          }
        }
      }
    } else {
      // For groups, just remove the member
      await prisma.chatMember.delete({
        where: { chatId_userId: { chatId, userId } },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: 'Ошибка удаления чата' });
  }
});

// Закрепить / открепить чат
router.post('/:id/pin', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { isPinned: !member.isPinned },
    });

    res.json({ isPinned: !member.isPinned });
  } catch (error) {
    console.error('Pin chat error:', error);
    res.status(500).json({ error: 'Ошибка закрепления чата' });
  }
});

// Включить/выключить уведомления для чата
router.patch('/:id/mute', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.id);
    const userId = req.userId!;

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Чат не найден' });
      return;
    }

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId, userId } },
      data: { isMuted: !member.isMuted },
    });

    res.json({ isMuted: !member.isMuted });
  } catch (error) {
    console.error('Mute chat error:', error);
    res.status(500).json({ error: 'Ошибка изменения уведомлений' });
  }
});

export default router;
