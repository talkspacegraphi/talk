# Исправления мобильной версии

## Проблемы и решения

### 1. ✅ Ошибка дублирующихся ключей в SideMenu
**Проблема:** `Encountered two children with the same key`
**Решение:** Обернул каждый render-метод в div с уникальным ключом:
```tsx
<AnimatePresence mode="wait" custom={slideDir}>
  {view === 'main' && <div key="main">{renderMain()}</div>}
  {view === 'profile' && <div key="profile">{renderProfile()}</div>}
  // и т.д.
</AnimatePresence>
```

### 2. ✅ Черный экран на мобильных
**Проблема:** ChatView был скрыт за пределами экрана из-за неправильного позиционирования
**Решение:** 
- Изменил структуру: обернул Sidebar и ChatView в общий контейнер
- Правильно настроил absolute/relative позиционирование для мобильных
- Sidebar: `absolute inset-0` на мобильных, `relative` на десктопе
- ChatView: `absolute inset-0` на мобильных, `relative` на десктопе

### 3. ✅ Улучшен свайп-жест
**Проблема:** Свайп срабатывал на всем экране, мешая прокрутке сообщений
**Решение:** 
- Свайп теперь работает только в области шапки чата (класс `.chat-header`)
- Добавлена проверка `target.closest('.chat-header')` в `onTouchStart`
- Мгновенный transition во время свайпа (duration: 0)

### 4. ✅ Оптимизация производительности
- Условный transition: мгновенный при свайпе, spring при обычной анимации
- Предотвращение pull-to-refresh через `overscroll-behavior-y: contain`
- Отключен tap highlight для лучшего UX

## Структура на мобильных

```
ChatPage
└── div.flex-1.relative (контейнер)
    ├── Sidebar (absolute, z-20)
    │   └── animate: x: activeChat ? '-100%' : '0%'
    └── ChatView (absolute, z-30)
        └── animate: x: activeChat ? swipeOffset : '100%'
```

## Как работает анимация

1. **Без активного чата:**
   - Sidebar: x: 0%, opacity: 1 (видим)
   - ChatView: x: 100%, opacity: 0 (за экраном справа)

2. **С активным чатом:**
   - Sidebar: x: -100%, opacity: 0 (за экраном слева)
   - ChatView: x: 0%, opacity: 1 (видим)

3. **Во время свайпа:**
   - ChatView: x: swipeOffset (следует за пальцем)
   - opacity: Math.max(0.5, 1 - swipeOffset / 150) (затухает)

## Тестирование

1. Откройте http://localhost:5173 на телефоне
2. Нажмите на чат - должен плавно открыться
3. Свайпните вправо от шапки чата - должен закрыться
4. Нажмите кнопку "Назад" - также закроется
5. Проверьте, что прокрутка сообщений работает нормально

## Параметры анимации

```typescript
// Обычная анимация
transition={{ type: 'spring', stiffness: 300, damping: 30 }}

// Во время свайпа
transition={{ type: 'tween', duration: 0 }}
```

Все исправления применены, сервер запущен на http://localhost:5173
