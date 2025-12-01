# Frontend Checkpoint 3

**Дата:** 01.12.2025

## Что сделано с checkpoint 2

### Интеграция авторизации с бэкендом
- [x] Переключение API с моков на реальные запросы (`api/auth.ts`)
- [x] Axios клиент с interceptor для JWT токена (`api/client.ts`)
- [x] Обработка ошибок axios в LoginPage и RegisterPage
- [x] Детализированные сообщения об ошибках ("Аккаунт не найден", "Неверный пароль")

### Настройка проксирования
- [x] API URL изменён на относительный `/api` для работы через nginx
- [x] Поддержка `VITE_API_URL` env переменной для локальной разработки

## Изменённые файлы

### `src/api/client.ts`
```typescript
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
```

### `src/api/auth.ts`
```typescript
import { apiClient } from './client'
import type { User, AuthResponse } from '@/types'

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password })
  return data
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', { name, email, password })
  return data
}

export async function getProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/profile')
  return data
}
```

### `src/pages/LoginPage.tsx` и `RegisterPage.tsx`
- Улучшена обработка ошибок axios
- Отображение сообщений об ошибках от сервера

## Структура API

```
frontend/src/api/
├── client.ts          # Axios instance + JWT interceptor
├── auth.ts            # login, register, getProfile (реальные запросы)
├── products.ts        # моки (TODO: переключить на реальные)
├── orders.ts          # моки
├── recommendations.ts # моки
└── mock-data.ts       # тестовые данные
```

## Что осталось

### Этап 3: Рекомендации
- [ ] Карусель рекомендаций на главной
- [ ] Рекомендации в корзине
- [ ] Компонент RecommendationCard

### Этап 4: Polish
- [ ] Пагинация товаров
- [ ] Адаптивная вёрстка
- [ ] Скелетоны загрузки
- [ ] Toast уведомления

### Интеграция с бэкендом
- [ ] Переключить products API на реальные запросы
- [ ] Переключить categories API на реальные запросы
- [ ] Подключить корзину к бэкенду
- [ ] Подключить заказы к бэкенду

## Запуск

### Через Docker (production-like)
```bash
docker-compose up --build
# Фронтенд: http://localhost:3000
# API проксируется через nginx
```

### Локально (development)
```bash
# Терминал 1: бэкенд
cd backend && go run cmd/server/main.go

# Терминал 2: фронтенд
cd frontend
VITE_API_URL=http://localhost:8080/api npm run dev
# Фронтенд: http://localhost:5173
```

## Тестовые данные

- **Регистрация:** любые данные (email уникальный)
- **Логин:** ранее зарегистрированный email + пароль
