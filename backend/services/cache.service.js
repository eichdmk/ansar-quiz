import { createClient } from 'redis'
import dotenv from 'dotenv'

dotenv.config()

let redisClient = null
let isConnected = false

const DEFAULT_TTL = Number(process.env.CACHE_TTL) || 300 // 5 минут по умолчанию

/**
 * Инициализация Redis клиента
 */
export async function initRedis() {
  try {
    const client = createClient({
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error('Redis: Превышено количество попыток переподключения')
            return new Error('Превышено количество попыток переподключения')
          }
          return Math.min(retries * 100, 3000)
        },
      },
      password: process.env.REDIS_PASSWORD || undefined,
    })

    client.on('error', (err) => {
      console.error('Redis Client Error:', err)
      isConnected = false
    })

    client.on('connect', () => {
      console.log('Redis: Подключение...')
    })

    client.on('ready', () => {
      console.log('Redis: Подключено успешно')
      isConnected = true
    })

    client.on('reconnecting', () => {
      console.log('Redis: Переподключение...')
      isConnected = false
    })

    await client.connect()
    redisClient = client
    return client
  } catch (error) {
    console.error('Redis: Ошибка инициализации:', error)
    isConnected = false
    return null
  }
}

/**
 * Получить значение из кэша
 */
export async function get(key) {
  if (!redisClient || !isConnected) {
    return null
  }

  try {
    const value = await redisClient.get(key)
    if (value) {
      return JSON.parse(value)
    }
    return null
  } catch (error) {
    console.error(`Redis: Ошибка получения ключа ${key}:`, error)
    return null
  }
}

/**
 * Установить значение в кэш
 */
export async function set(key, value, ttl = DEFAULT_TTL) {
  if (!redisClient || !isConnected) {
    return false
  }

  try {
    const serialized = JSON.stringify(value)
    if (ttl > 0) {
      await redisClient.setEx(key, ttl, serialized)
    } else {
      await redisClient.set(key, serialized)
    }
    return true
  } catch (error) {
    console.error(`Redis: Ошибка установки ключа ${key}:`, error)
    return false
  }
}

/**
 * Удалить ключ из кэша
 */
export async function del(key) {
  if (!redisClient || !isConnected) {
    return false
  }

  try {
    await redisClient.del(key)
    return true
  } catch (error) {
    console.error(`Redis: Ошибка удаления ключа ${key}:`, error)
    return false
  }
}

/**
 * Удалить все ключи по паттерну
 */
export async function delPattern(pattern) {
  if (!redisClient || !isConnected) {
    return false
  }

  try {
    const keys = await redisClient.keys(pattern)
    if (keys.length > 0) {
      await redisClient.del(keys)
    }
    return true
  } catch (error) {
    console.error(`Redis: Ошибка удаления по паттерну ${pattern}:`, error)
    return false
  }
}

/**
 * Инвалидация кэша для игры
 */
export async function invalidateGameCache(gameId) {
  await Promise.all([
    delPattern(`game:${gameId}:*`),
    delPattern(`players:${gameId}:*`),
    delPattern(`questions:${gameId}:*`),
    delPattern(`queue:${gameId}:*`),
    delPattern('games:list:*'),
  ])
}

/**
 * Инвалидация кэша для игрока
 */
export async function invalidatePlayerCache(gameId, playerId = null) {
  await delPattern(`players:${gameId}:*`)
  if (playerId) {
    await delPattern(`player:${playerId}:*`)
  }
}

/**
 * Инвалидация кэша для вопроса
 */
export async function invalidateQuestionCache(gameId, questionId = null) {
  // Удаляем точный ключ questions:${gameId} и все ключи с паттерном questions:${gameId}:*
  await del(`questions:${gameId}`)
  await delPattern(`questions:${gameId}:*`)
  if (questionId) {
    await delPattern(`question:${questionId}:*`)
  }
}

/**
 * Инвалидация кэша для очереди
 */
export async function invalidateQueueCache(gameId, questionId = null) {
  if (questionId) {
    await del(`queue:${gameId}:${questionId}`)
  } else {
    await delPattern(`queue:${gameId}:*`)
  }
}

/**
 * Обертка для кэширования функции
 */
export async function cached(key, fn, ttl = DEFAULT_TTL) {
  // Пытаемся получить из кэша
  const cached = await get(key)
  if (cached !== null) {
    return cached
  }

  // Если нет в кэше, выполняем функцию
  const result = await fn()

  // Сохраняем результат в кэш
  if (result !== null && result !== undefined) {
    await set(key, result, ttl)
  }

  return result
}

/**
 * Закрыть соединение с Redis
 */
export async function closeRedis() {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit()
      console.log('Redis: Соединение закрыто')
    } catch (error) {
      console.error('Redis: Ошибка закрытия соединения:', error)
    }
  }
}

export default {
  initRedis,
  get,
  set,
  del,
  delPattern,
  invalidateGameCache,
  invalidatePlayerCache,
  invalidateQuestionCache,
  invalidateQueueCache,
  cached,
  closeRedis,
}

