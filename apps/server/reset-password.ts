import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetPassword() {
  const username = 'test';
  const newPassword = 'Test123';

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  const user = await prisma.user.update({
    where: { username },
    data: { password: hashedPassword },
  });

  console.log(`✅ Пароль для пользователя "${username}" успешно изменен на: ${newPassword}`);
  console.log(`User ID: ${user.id}`);
}

resetPassword()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
