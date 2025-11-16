import pool from "../plugins/db.js"
import { emitQuestion, getQuestionByIndex, getQuestionCount } from '../services/gameState.service.js'

const countdownTimers = new Map()

function clearCountdown(gameId) {
    const timers = countdownTimers.get(gameId)
    if (!timers) {
        return
    }
    timers.forEach((timerId) => clearTimeout(timerId))
    countdownTimers.delete(gameId)
}

function scheduleCountdown(io, gameId, { question, total, onComplete }) {
    if (!io) {
        return
    }

    const timers = []
    const countdownValues = [3, 2, 1]

    countdownValues.forEach((value, index) => {
        const timerId = setTimeout(() => {
            io.emit('game:countdown', { gameId, value })
        }, index * 1000)
        timers.push(timerId)
    })

    const finalTimer = setTimeout(() => {
        io.emit('game:countdown', { gameId, value: 0 })
        if (onComplete) {
            onComplete()
        } else {
            // Старый код для обратной совместимости
            io.emit('game:started', {
                gameId,
                index: 0,
                total,
            })
            emitQuestion(io, gameId, {
                question,
                index: 0,
                total,
                isClosed: false,
            })
        }
        countdownTimers.delete(gameId)
    }, countdownValues.length * 1000)

    timers.push(finalTimer)
    countdownTimers.set(gameId, timers)
}

export async function createQuiz(request, reply) {
    let { name } = request.body

    if (!name) {
        reply.status(400).send({ message: 'Некорректное название' })
        return
    }

    try {
        let result = await pool.query('INSERT INTO games(name) VALUES($1) RETURNING *', [name])

        // Инвалидация кэша списка игр
        const { delPattern } = await import('../services/cache.service.js')
        await delPattern('games:list:*')

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
        // Кэширование убрано, так как данные часто меняются во время игры
        // (status, current_question_index, is_question_closed)
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

        const result = {
            items: itemsResult.rows,
            total: totalResult.rows[0]?.total ?? 0,
            page,
            limit,
        }

        reply.send(result)
    } catch (error) {
        console.log('Ошибка:', error)
        reply.status(500).send({ message: 'Ошибка сервера' })
    }
}

export async function getQuizHistory(request, reply) {
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
                `SELECT g.id,
                        g.name,
                        g.created_at,
                        g.started_at,
                        g.finished_at,
                        g.question_duration,
                        g.status,
                        COALESCE(
                          (
                            SELECT COUNT(*)
                            FROM players p
                            WHERE p.game_id = g.id
                          ),
                          0
                        ) AS player_count,
                        (
                          SELECT COALESCE(
                            json_agg(
                              json_build_object(
                                'id', sub.id,
                                'username', sub.username,
                                'groupName', sub.group_name,
                                'score', sub.score
                              )
                              ORDER BY sub.score DESC, sub.joined_at ASC
                            ),
                            '[]'::json
                          )
                          FROM (
                            SELECT p.id,
                                   p.username,
                                   p.group_name,
                                   p.score,
                                   p.joined_at
                            FROM players p
                            WHERE p.game_id = g.id
                            ORDER BY p.score DESC, p.joined_at ASC
                            LIMIT 3
                          ) AS sub
                        ) AS winners
                   FROM games g
                  WHERE g.status = 'finished'
               ORDER BY g.finished_at DESC NULLS LAST,
                        g.started_at DESC NULLS LAST,
                        g.created_at DESC
                  LIMIT $1 OFFSET $2`,
                [limit, offset],
            ),
            pool.query(
                `SELECT COUNT(*)::int AS total
                   FROM games
                  WHERE status = 'finished'`,
            ),
        ])

        reply.send({
            items: itemsResult.rows.map((row) => ({
                id: row.id,
                name: row.name,
                status: row.status,
                createdAt: row.created_at,
                startedAt: row.started_at,
                finishedAt: row.finished_at,
                questionDuration: row.question_duration,
                playerCount: row.player_count ?? 0,
                winners: Array.isArray(row.winners) ? row.winners.map((winner) => ({
                    id: winner.id,
                    username: winner.username,
                    groupName: winner.groupName ?? winner.groupname ?? null,
                    score: winner.score,
                })) : [],
            })),
            total: totalResult.rows[0]?.total ?? 0,
            page,
            limit,
        })
    } catch (error) {
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось получить историю игр' })
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

        // Инвалидация кэша игры и списка игр
        const { invalidateGameCache, delPattern } = await import('../services/cache.service.js')
        await invalidateGameCache(id)
        await delPattern('games:list:*')

        reply.send(id)
    } catch (error) {
        console.log('Ошибка:', error)
        reply.status(500).send({ message: 'Ошибка сервера' })
    }
}

export async function openQuiz(request, reply) {
    const gameId = Number(request.params.id)

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const existing = await client.query(
            'SELECT status FROM games WHERE id = $1 FOR UPDATE',
            [gameId],
        )

        if (existing.rowCount === 0) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Игра не найдена' })
            return
        }

        const currentStatus = existing.rows[0].status

        if (currentStatus === 'running') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Игра уже запущена' })
            return
        }

        if (currentStatus === 'finished') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Игра уже завершена' })
            return
        }

        const totalQuestions = await getQuestionCount(gameId, client)
        if (totalQuestions === 0) {
            await client.query('ROLLBACK')
            reply
                .code(409)
                .send({ message: 'Добавьте хотя бы один вопрос, прежде чем открывать комнату' })
            return
        }

        const updateResult = await client.query(
            `UPDATE games
               SET status = 'ready',
                   started_at = NULL,
                   finished_at = NULL,
                   current_question_index = 0,
                   is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId],
        )

        await client.query('COMMIT')

        clearCountdown(gameId)

        // Инвалидация кэша игры
        const { invalidateGameCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)

        request.server.io.emit('game:opened', {
            gameId,
            total: totalQuestions,
        })

        reply.send({
            message: 'Комната открыта. Игроки могут подключаться.',
            game: updateResult.rows[0],
            total: totalQuestions,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось открыть комнату' })
    } finally {
        client.release()
    }
}

export async function resetQuiz(request, reply) {
    const gameId = Number(request.params.id)

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const existing = await client.query(
            'SELECT status FROM games WHERE id = $1 FOR UPDATE',
            [gameId],
        )

        if (existing.rowCount === 0) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Игра не найдена' })
            return
        }

        const currentStatus = existing.rows[0].status

        if (currentStatus === 'running') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Сначала остановите текущую игру' })
            return
        }

        if (currentStatus === 'draft') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Комната уже закрыта' })
            return
        }

        const updateResult = await client.query(
            `UPDATE games
               SET status = 'draft',
                   started_at = NULL,
                   finished_at = NULL,
                   current_question_index = 0,
                   is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId],
        )

        await client.query('COMMIT')

        clearCountdown(gameId)

        // Инвалидация кэша игры
        const { invalidateGameCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)

        request.server.io.emit('game:closed', { gameId })

        reply.send({
            message: 'Комната закрыта. Можно начать заново.',
            game: updateResult.rows[0],
        })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось закрыть комнату' })
    } finally {
        client.release()
    }
}

export async function restartQuiz(request, reply) {
    const gameId = Number(request.params.id)

    if (Number.isNaN(gameId)) {
        reply.code(400).send({ message: 'Некорректный идентификатор игры' })
        return
    }

    const client = await pool.connect()
    try {
        await client.query('BEGIN')

        const existing = await client.query(
            'SELECT status FROM games WHERE id = $1 FOR UPDATE',
            [gameId],
        )

        if (existing.rowCount === 0) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Игра не найдена' })
            return
        }

        const currentStatus = existing.rows[0].status

        if (currentStatus === 'running') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Сначала остановите текущую игру' })
            return
        }

        const totalQuestions = await getQuestionCount(gameId, client)
        if (totalQuestions === 0) {
            await client.query('ROLLBACK')
            reply
                .code(409)
                .send({ message: 'Добавьте хотя бы один вопрос, прежде чем запускать игру снова' })
            return
        }

        const resetPlayers = await client.query(
            `UPDATE players
               SET score = 0
             WHERE game_id = $1
             RETURNING id, username, group_name, game_id, score, joined_at`,
            [gameId],
        )

        const updateGame = await client.query(
            `UPDATE games
               SET status = 'ready',
                   started_at = NULL,
                   finished_at = NULL,
                   current_question_index = 0,
                   is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId],
        )

        await client.query('COMMIT')

        clearCountdown(gameId)

        // Инвалидация кэша игры и игроков (score обновлен)
        const { invalidateGameCache, invalidatePlayerCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)
        await invalidatePlayerCache(gameId)

        const io = request.server.io
        const game = updateGame.rows[0]

        if (io) {
            io.emit('game:closed', { gameId })

            resetPlayers.rows.forEach((player) => {
                io.emit('player:scoreUpdated', {
                    id: player.id,
                    username: player.username,
                    groupName: player.group_name,
                    gameId: player.game_id,
                    score: player.score,
                    joinedAt: player.joined_at,
                })
            })

            io.emit('game:opened', {
                gameId,
                total: totalQuestions,
            })
        }

        reply.send({
            message: 'Игра перезапущена. Комната снова открыта.',
            game,
            total: totalQuestions,
            playersReset: resetPlayers.rowCount,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось перезапустить игру' })
    } finally {
        client.release()
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
        if (existing.rows[0].status === 'finished') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Игра уже завершена' })
            return
        }
        if (existing.rows[0].status !== 'ready') {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Сначала откройте комнату для игроков' })
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
                 is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId, duration],
        )

        const firstQuestion = await getQuestionByIndex(gameId, 0, client)

        await client.query('COMMIT')

        const game = updateResult.rows[0]

        clearCountdown(gameId)

        // Инвалидация кэша игры
        const { invalidateGameCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)

        if (firstQuestion) {
            // Отправляем первый вопрос в preview для админа (без отсчета)
            request.server.io.emit('game:questionPreview', {
                gameId,
                question: firstQuestion,
                index: 0,
                total: totalQuestions,
            })
            request.server.io.emit('game:started', {
                gameId,
                index: 0,
                total: totalQuestions,
            })
        } else {
            request.server.io.emit('game:started', {
                gameId,
                index: 0,
                total: totalQuestions,
            })
        }

        reply.send({ message: 'Игра запущена. Первый вопрос готов к старту', game, preview: Boolean(firstQuestion) })
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
        clearCountdown(gameId)

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

        // Инвалидация кэша игры
        const { invalidateGameCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)

        request.server.io.emit('game:stopped', { gameId })
        request.server.io.emit('game:finished', { gameId })

        reply.send({ message: 'Игра остановлена', game })
    } catch (error) {
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось остановить игру' })
    }
}

export async function startQuestion(request, reply) {
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

        if (!game.is_question_closed) {
            await client.query('ROLLBACK')
            reply.code(409).send({ message: 'Вопрос уже запущен' })
            return
        }

        const currentQuestion = await getQuestionByIndex(gameId, game.current_question_index, client)

        if (!currentQuestion) {
            await client.query('ROLLBACK')
            reply.code(404).send({ message: 'Текущий вопрос не найден' })
            return
        }

        const totalQuestions = await getQuestionCount(gameId, client)

        await client.query('COMMIT')

        // Запускаем отсчет
        clearCountdown(gameId)
        scheduleCountdown(request.server.io, gameId, {
            question: currentQuestion,
            total: totalQuestions,
            onComplete: async () => {
                // После отсчета обновляем состояние вопроса и отправляем событие
                const updateClient = await pool.connect()
                try {
                    await updateClient.query('BEGIN')
                    await updateClient.query(
                        'UPDATE games SET is_question_closed = FALSE WHERE id = $1',
                        [gameId],
                    )
                    await updateClient.query('COMMIT')
                } catch (error) {
                    await updateClient.query('ROLLBACK')
                    console.error('Error updating question state:', error)
                } finally {
                    updateClient.release()
                }
                
                // Отправляем событие что вопрос готов к ответу
                request.server.io.emit('game:questionReady', {
                    gameId,
                    question: currentQuestion,
                    index: game.current_question_index,
                    total: totalQuestions,
                })
                
                // Инвалидация кэша при старте вопроса
                const { invalidateGameCache } = await import('../services/cache.service.js')
                await invalidateGameCache(gameId)
            },
        })

        reply.send({
            message: 'Запуск вопроса. Отсчёт начат',
            gameId,
        })
    } catch (error) {
        await client.query('ROLLBACK')
        request.log.error(error)
        reply.code(500).send({ message: 'Не удалось запустить вопрос' })
    } finally {
        client.release()
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

            // Инвалидация кэша игры
            const { invalidateGameCache } = await import('../services/cache.service.js')
            await invalidateGameCache(gameId)

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
                   is_question_closed = TRUE
             WHERE id = $1
             RETURNING id, name, created_at, status, current_question_index,
                       question_duration, started_at, finished_at, is_question_closed`,
            [gameId, nextIndex],
        )

        const nextQuestion = await getQuestionByIndex(gameId, nextIndex, client)

        // Очищаем очередь для всех вопросов этой игры (очередь должна быть только для текущего активного вопроса)
        await client.query('DELETE FROM answer_queue WHERE game_id = $1', [gameId])

        await client.query('COMMIT')

        // Инвалидация кэша
        const { invalidateGameCache } = await import('../services/cache.service.js')
        await invalidateGameCache(gameId)

        let finished = false

        if (nextQuestion) {
            // Отправляем событие preview для админа, вопрос не показывается ученикам
            request.server.io.emit('game:questionPreview', {
                gameId,
                question: nextQuestion,
                index: nextIndex,
                total: totalQuestions,
            })
            // Уведомляем игроков что вопрос закрыт и нужно ждать следующий
            request.server.io.emit('game:questionClosed', {
                gameId,
                questionId: null, // Старый вопрос закрыт
                winner: null,
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
