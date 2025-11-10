import pool from "../plugins/db.js"
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()


export async function login(request, reply) {

    const { username, password } = request.body

    if (!username || !password) {
        reply.status(400).send({ message: 'Введите логин и пароль' })
        return
    }

    try {
        let result = await pool.query('SELECT * FROM users WHERE username = $1', [username])

        if (result.rows.length === 0) {
            reply.status(400).send({ message: 'Неверные данные' })
            return
        }

        const user = result.rows[0]

        let isMatch = await bcrypt.compare(password, user.hash_password)

        if (!isMatch) {
            reply.status(400).send({ message: 'Неверные данные' })
            return
        }

        let token = jwt.sign(
            { id: user.id, name: user.username },
            process.env,
            { expiresIn: '30d' })

        reply.send(token)
    } catch (error) {
        console.log("Ошибка:", error)
        reply.status(500).send({message: 'Ошибка сервера'})
    }
}

