import bcrypt from 'bcrypt'

import pool from '../plugins/db.js'


export async function ensureDefaultAdmin(logger) {
  const username = process.env.ADMIN_DEFAULT_USERNAME
  const password = process.env.ADMIN_DEFAULT_PASSWORD

  if (!username || !password) {
    logger?.warn(
      'Переменные ADMIN_DEFAULT_USERNAME и ADMIN_DEFAULT_PASSWORD не заданы — пропускаем автосоздание администратора',
    )
    return
  }

  const existing = await pool.query('SELECT id FROM admin LIMIT 1')
  if (existing.rows.length > 0) {
    logger?.info('Администратор уже создан — автосоздание не требуется')
    return
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
  const hash = await bcrypt.hash(password, saltRounds)

  await pool.query(
    `
      INSERT INTO admin (username, hash_password)
      VALUES ($1, $2)
    `,
    [username, hash],
  )

  logger?.info(
    'Создали администратора по данным из .env — сразу меняем пароль, если проект идёт в продакшен',
  )
}

