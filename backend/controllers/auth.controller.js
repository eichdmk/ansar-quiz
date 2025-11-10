import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

import pool from '../plugins/db.js'

dotenv.config()

function ensureJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'Отсутствует JWT_SECRET. Добавь его в файл .env (см. backend/.env.example)',
    )
  }
}

export async function setupAdmin(request, reply) {
  const { username, password } = request.body ?? {}

  if (!username || !password) {
    return reply.code(400).send({
      message: 'Нужно передать username и password',
    })
  }

  try {
    const existingAdmin = await pool.query(
      'SELECT id FROM admin WHERE username = $1',
      [username],
    )

    if (existingAdmin.rows.length > 0) {
      return reply.code(409).send({
        message: 'Такой администратор уже существует',
      })
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 10
    const hash = await bcrypt.hash(password, saltRounds)

    const insertResult = await pool.query(
      `
        INSERT INTO admin (username, hash_password)
        VALUES ($1, $2)
        RETURNING id, username
      `,
      [username, hash],
    )

    return reply.code(201).send({
      message: 'Администратор создан',
      admin: insertResult.rows[0],
    })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      message: 'Не удалось создать администратора',
    })
  }
}

export async function login(request, reply) {
  const { username, password } = request.body ?? {}

  if (!username || !password) {
    return reply.code(400).send({
      message: 'Введите логин и пароль',
    })
  }

  try {
    const result = await pool.query(
      'SELECT id, username, hash_password FROM admin WHERE username = $1',
      [username],
    )

    if (result.rows.length === 0) {
      return reply.code(400).send({
        message: 'Неверный логин или пароль',
      })
    }

    const admin = result.rows[0]

    const isMatch = await bcrypt.compare(password, admin.hash_password)

    if (!isMatch) {
      return reply.code(400).send({
        message: 'Неверный логин или пароль',
      })
    }

    ensureJwtSecret()
    const token = jwt.sign(
      {
        id: admin.id,
        username: admin.username,
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' },
    )

    return reply.send({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
      },
    })
  } catch (error) {
    request.log.error(error)
    return reply.code(500).send({
      message: 'Сервер не смог обработать запрос',
    })
  }
}