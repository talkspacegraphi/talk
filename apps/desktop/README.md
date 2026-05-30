# Vortex Messenger Desktop

Desktop приложение на базе Electron для Vortex Messenger.

## Разработка

```bash
# Запустить в режиме разработки (нужно чтобы сервер и веб были запущены)
npm run dev:desktop
```

## Сборка .exe файла

### Способ 1: Использовать готовый скрипт

```bash
# Запустить build-desktop.bat в корне проекта
build-desktop.bat
```

### Способ 2: Вручную

```bash
# 1. Собрать веб-приложение
npm run build -w apps/web

# 2. Собрать сервер
npm run build -w apps/server

# 3. Собрать Electron приложение
cd apps/desktop
npm run build:win
```

## Результат

После сборки .exe файл будет находиться в:
```
apps/desktop/dist-electron/Vortex Messenger Setup 1.0.0.exe
```

## Что включено в .exe

- Electron оболочка (GUI)
- Node.js сервер (API + WebSocket)
- Веб-интерфейс (React)
- SQLite база данных
- Все зависимости

## Размер

Примерно 150-200 МБ (включает Chromium и Node.js)

## Системные требования

- Windows 7 и выше
- 4 GB RAM
- 500 MB свободного места
