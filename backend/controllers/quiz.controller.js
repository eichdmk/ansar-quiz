import pool from "../plugins/db.js"

export async function createQuiz(request, reply) {
    let { name } = request.body

    if (!name) {
        reply.status(400).send({ message: 'Некорректное название' })
        return
    }

    try {
        let result = await pool.query('INSERT INTO games(name) VALUES($1) RETURNING *', [name])

        reply.status(201).send(result.rows[0])

    } catch (error) {
        console.log("Ошибка:", error)
        reply.status(500).send({ message: 'Ошибка сервера' })
    }
}

export async function getQuizzes(request, reply) {
    let { page = 1, limit = 10 } = request.query

    page = parseInt(page, 10)
    limit = parseInt(limit, 10)

    if (Number.isNaN(page) || page < 1 || Number.isNaN(limit) || limit < 1) {
        reply.status(400).send({ message: 'Некорректные параметры пагинации' })
        return
    }

    const offset = (page - 1) * limit

    try {
        const [itemsResult, totalResult] = await Promise.all([
            pool.query(
                'SELECT id, name, created_at FROM games ORDER BY created_at DESC LIMIT $1 OFFSET $2',
                [limit, offset]
            ),
            pool.query('SELECT COUNT(*)::int AS total FROM games'),
        ])

        reply.send({
            items: itemsResult.rows,
            total: totalResult.rows[0]?.total ?? 0,
            page,
            limit,
        })
    } catch (error) {
        console.log('Ошибка:', error)
        reply.status(500).send({ message: 'Ошибка сервера' })
    }
}


export async function deleteQuiz(request, reply) {
    let id = parseInt(request.params.id)

    try {

        let result = await pool.query("SELECT * FROM games WHERE id = $1", [id])

        if (result.rows.length === 0) {
            reply.status(404).send({ error: 'Такой игры не существует' })
            return
        }

        await pool.query("DELETE FROM games WHERE id = $1", [id])

        reply.send(id)
    } catch (error) {
        console.log('Ошибка:', error)
        reply.status(500).send({ message: 'Ошибка сервера' })
    }
}
