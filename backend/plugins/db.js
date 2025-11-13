import { Pool } from 'pg'
import dotenv from 'dotenv'


dotenv.config()


const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 5000),
  ssl:
    process.env.DB_SSL === 'true'
      ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          ca: process.env.DB_SSL_CA,
        }
      : undefined,
})


export async function verifyDatabaseConnection() {
  const maxRetries = Number(process.env.DB_MAX_RETRIES ?? 5)
  const retryDelayMs = Number(process.env.DB_RETRY_DELAY_MS ?? 2000)

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      console.log('Подключение к PostgreSQL установлено успешно')
      return
    } catch (error) {
      const isLastAttempt = attempt === maxRetries
      console.error(
        `Не удалось подключиться к PostgreSQL (попытка ${attempt}/${maxRetries}):`,
        error,
      )
      if (isLastAttempt) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
    }
  }
}


export default pool