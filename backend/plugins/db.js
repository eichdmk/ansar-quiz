import { Pool } from 'pg'
import dotenv from 'dotenv'


dotenv.config()


const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
})


export async function verifyDatabaseConnection() {
  try {
    await pool.query('SELECT 1')
    console.log('Подключение к PostgreSQL установлено успешно')
  } catch (error) {
    console.error('Не удалось подключиться к PostgreSQL:', error)
    throw error
  }
}


export default pool