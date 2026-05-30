# Руководство по сборке Electron приложения

## ✅ Что было исправлено

### 1. Динамические пути для данных
- БД и загрузки теперь хранятся в `%APPDATA%/talk/vortex-data/`
- При первом запуске автоматически создаются нужные папки
- Данные сохраняются между обновлениями приложения

### 2. Правильная конфигурация
- Создан `.env.production` с настройками для упакованного приложения
- Сервер получает пути через переменные окружения
- Prisma schema копируется в userData

### 3. Улучшенный main.ts
- Автоматическое создание структуры папок
- Копирование конфигурации при первом запуске
- Правильная передача путей серверу

---

## 🚀 Как собрать приложение

### Полная сборка (рекомендуется)
```bash
npm run build:desktop
```

Эта команда:
1. Собирает веб-интерфейс (`apps/web/dist`)
2. Компилирует сервер (`apps/server/dist`)
3. Собирает Electron приложение с установщиком

### Поэтапная сборка

```bash
# 1. Собрать веб
npm run build -w apps/web

# 2. Собрать сервер
npm run build -w apps/server

# 3. Собрать Electron
npm run build:win -w apps/desktop
```

---

## 📦 Результаты сборки

После сборки вы найдёте:

**Установщик:**
```
apps/desktop/dist-electron/Talk Setup 1.0.0.exe  (~86 MB)
```

**Распакованная версия (для тестирования):**
```
apps/desktop/dist-electron/win-unpacked/Talk.exe
```

---

## 🗂 Структура данных приложения

После установки и первого запуска:

```
%APPDATA%/talk/
└── vortex-data/
    ├── .env                    # Конфигурация (скопирована из .env.production)
    ├── database.db             # SQLite база данных
    ├── database.db-journal     # Журнал транзакций
    ├── prisma/
    │   └── schema.prisma       # Схема БД
    └── uploads/
        ├── avatars/            # Аватары пользователей
        ├── *.jpg, *.png        # Загруженные файлы
        └── ...
```

**Путь к данным:**
- Windows: `C:\Users\<Username>\AppData\Roaming\talk\vortex-data\`

---

## 🔧 Разработка

### Запуск в режиме разработки

```bash
# Терминал 1: Запустить сервер
npm run dev -w apps/server

# Терминал 2: Запустить веб
npm run dev -w apps/web

# Терминал 3: Запустить Electron
npm run dev -w apps/desktop
```

В режиме разработки:
- Electron загружает веб с `http://localhost:5173`
- Сервер запускается отдельно (не встроенный)
- Используется `.env` из `apps/server/`

---

## 🐛 Отладка

### Логи сервера

В продакшене логи сервера выводятся в консоль Electron:
- Открыть DevTools: `Ctrl+Shift+I` (если включено в main.ts)
- Логи будут в консоли

### Проверка путей

Добавьте в `apps/desktop/src/main.ts` после `startServer()`:
```typescript
console.log('User Data Path:', app.getPath('userData'));
console.log('Data Dir:', dataDir);
console.log('DB Path:', dbPath);
```

### Проблемы с БД

Если БД не создаётся:
1. Проверьте права доступа к `%APPDATA%/talk/`
2. Убедитесь что Prisma schema скопирован
3. Проверьте переменную `DATABASE_URL` в логах

---

## 📝 Изменения в коде

### apps/server/src/config.ts
```typescript
// Теперь загружает .env из пути, указанного в ENV_PATH
const envPath = process.env.ENV_PATH || path.join(__dirname, '../.env');
dotenv.config({ path: envPath });
```

### apps/server/src/shared.ts
```typescript
// Использует UPLOADS_PATH из переменных окружения
const uploadsRoot = process.env.UPLOADS_PATH || path.join(__dirname, '../uploads');
```

### apps/desktop/src/main.ts
```typescript
// Создаёт структуру папок в userData
const dataDir = path.join(app.getPath('userData'), 'vortex-data');
ensureDir(dataDir);
ensureDir(uploadsDir);

// Передаёт пути серверу через env
env: {
  ENV_PATH: envPath,
  DATABASE_URL: `file:${dbPath}`,
  UPLOADS_PATH: uploadsDir,
}
```

### apps/desktop/package.json
```json
// Копирует .env.production вместо .env
{
  "from": "../server/.env.production",
  "to": "server/.env.production"
}
```

---

## ✨ Преимущества новой структуры

1. **Данные не теряются при обновлении** - всё в userData
2. **Чистая установка** - нет мусора в Program Files
3. **Портативность** - можно скопировать папку vortex-data
4. **Безопасность** - данные в защищённой папке пользователя
5. **Стандартность** - следует best practices Electron

---

## 🎯 Следующие шаги

### Для тестирования:
1. Запустите `Talk Setup 1.0.0.exe`
2. Установите приложение
3. Создайте аккаунт
4. Проверьте что всё работает

### Для распространения:
1. Переименуйте `Talk Setup 1.0.0.exe` в `VortexMessenger-Setup.exe`
2. Опционально: подпишите exe цифровой подписью
3. Создайте релиз на GitHub
4. Добавьте инструкцию по установке

---

## 🔐 Безопасность

### Перед публикацией:

1. **Смените секреты в .env.production:**
```bash
# Генерация нового JWT_SECRET
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Генерация нового ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **Обновите .env.production:**
```env
JWT_SECRET=<новый_секрет>
ENCRYPTION_KEY=<новый_ключ>
```

3. **Пересоберите приложение:**
```bash
npm run build:desktop
```

⚠️ **ВАЖНО:** Не публикуйте приложение с дефолтными секретами!

---

## 📊 Размер приложения

- **Установщик:** ~86 MB
- **Установленное:** ~250 MB
- **База данных:** растёт с использованием
- **Загрузки:** зависит от медиа

### Оптимизация размера (опционально):

1. Удалить неиспользуемые node_modules из сборки
2. Включить asar compression
3. Использовать electron-builder compression

---

## 🆘 Частые проблемы

### "Сервер не запускается"
- Проверьте что порт 3001 свободен
- Посмотрите логи в DevTools
- Убедитесь что все файлы скопированы в resources/

### "База данных не создаётся"
- Проверьте права доступа к %APPDATA%
- Убедитесь что DATABASE_URL правильный
- Проверьте что prisma/schema.prisma скопирован

### "Не загружаются изображения"
- Проверьте что UPLOADS_PATH установлен
- Убедитесь что папка uploads создана
- Проверьте права доступа

### "Приложение не запускается"
- Установите Visual C++ Redistributable
- Проверьте антивирус (может блокировать)
- Запустите от имени администратора

---

## 📅 История изменений

**2026-04-26:**
- ✅ Исправлены пути для упакованного приложения
- ✅ Добавлена поддержка userData
- ✅ Создан .env.production
- ✅ Обновлён main.ts для правильной инициализации
- ✅ Протестирована сборка

---

## 🎉 Готово!

Ваше приложение готово к использованию. Установщик находится в:
```
apps/desktop/dist-electron/Talk Setup 1.0.0.exe
```

Запустите его и наслаждайтесь мессенджером!
