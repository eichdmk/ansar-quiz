import pool from "../plugins/db.js"
import { emitQuestion, getQuestionByIndex, getQuestionCount } from '../services/gameState.service.js'

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
                `SELECT id, name, created_at, status, current_question_index,
                        question_duration, started_at, finished_at, is_question_closed
                   FROM games
                  ORDER BY created_at DESC
                  LIMIT $1 OFFSET $2`,
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

export async function startQuiz(request, reply) {
    const gameId = Number(request.params.id)
    const { questionDuration } = request.body ?? {}

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    const duration = Number(questionDuration) || 0

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const existing = await client.query('SELECT status FROM games WHERE id = $1 FOR UPDATE', [gameId])
        if (existing.rowCount === 0) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Игра не найдена' })
            return
        }
        if (existing.rows[0].status === 'running') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Игра уже запущена' })
            return
        }

        const totalQuestions = await getQuestionCount(gameId, client)
        if (totalQuestions === 0) {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Добавьте вопросы, прежде чем запускать игру' })
            return
        }

        const updateResult = await client.query(
            `UPDATE games
             SET status = 'running', started_at = NOW(), finished_at = NULL,
                 current_question_index = 0, question_duration = $2,
                 is_question_closed = FALSE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId, duration],
        )

        const firstQuestion = await getQuestionByIndex(gameId, 0, client)

        await client.query('COMMIT')

        const game = updateResult.rows[0]

        request.server.io.emit('game:started', {
            gameId,
            index: 0,
            total: totalQuestions,
            isClosed: false,
        })

        if (firstQuestion) {
            emitQuestion(request.server.io, gameId, {
                question: firstQuestion,
                index: 0,
                total: totalQuestions,
                isClosed: false,
            })
        }

        reply.send({ message: 'Игра запущена', game })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось запустить игру' })
    } finally {
        client.release()
    }
}

export async function stopQuiz(request, reply) {
    const gameId = Number(request.params.id)

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    try {
        const updateResult = await pool.query(
            `UPDATE games
             SET status = 'finished', finished_at = NOW(), current_question_index = 0,
                 is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId],
        )

        const game = updateResult.rows[0]

        request.server.io.emit('game:stopped', { gameId })
        request.server.io.emit('game:finished', { gameId })

        reply.send({ message: 'Игра остановлена', game })
    } catch (error) {
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось остановить игру' })
    }
}

export async function advanceQuizQuestion(request, reply) {
    const gameId = Number(request.params.id)

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        const gameResult = await client.query(
            'SELECT status, current_question_index, is_question_closed FROM games WHERE id = $1 FOR UPDATE',
            [gameId],
        )
        if (gameResult.rowCount === 0) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Игра не найдена' })
            return
        }
        const game = gameResult.rows[0]
        if (game.status !== 'running') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Игра не запущена' })
            return
        }

        const totalQuestions = await getQuestionCount(gameId, client)
        const nextIndex = game.current_question_index + 1

        if (nextIndex >= totalQuestions) {
            const updateResult = await client.query(
                `UPDATE games
                   SET current_question_index = $2,
                       status = 'finished',
                       finished_at = NOW(),
                       is_question_closed = TRUE
                 WHERE id = $1
                 RETURNING id, name, created_at, status, current_question_index,
                           question_duration, started_at, finished_at, is_question_closed`,
                [gameId, nextIndex],
            )
            await client.query('COMMIT')

            request.server.io.emit('game:finished', { gameId })

            reply.send({
                message: 'Игра завершена',
                game: updateResult.rows[0],
                finished: true,
            })
            return
        }

        const updateResult = await client.query(
            `UPDATE games
               SET current_question_index = $2,
                   is_question_closed = FALSE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId, nextIndex],
        )

        const nextQuestion = await getQuestionByIndex(gameId, nextIndex, client)

        await client.query('COMMIT')

        let finished = false

        if (nextQuestion) {
            emitQuestion(request.server.io, gameId, {
                question: nextQuestion,
                index: nextIndex,
                total: totalQuestions,
                isClosed: false,
            })
        } else {
            request.server.io.emit('game:finished', { gameId })
            finished = true
        }

        reply.send({
            message: 'Переключили на следующий вопрос',
            game: updateResult.rows[0],
            finished,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось переключить вопрос' })
    } finally {
        client.release()
    }
}
