import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchGameHistory } from '../../api/games.js'
import styles from './GameHistory.module.css'

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const formatDateTime = (value) => {
  if (!value) {
    return '—'
  }
  try {
    return dateFormatter.format(new Date(value))
  } catch (error) {
    return '—'
  }
}

function GameHistory() {
  const [items, setItems] = useState([])
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 10

  const totalPages = useMemo(() => {
    if (!total) {
      return 1
    }
    return Math.max(Math.ceil(total / limit), 1)
  }, [total])

  const loadHistory = useCallback(
    async (nextPage) => {
      setStatus('loading')
      setError(null)
      try {
        const data = await fetchGameHistory({ page: nextPage, limit })
        setItems(Array.isArray(data?.items) ? data.items : [])
        setTotal(data?.total ?? 0)
        setStatus('succeeded')
      } catch (err) {
        const message =
          err.response?.data?.message ?? err.message ?? 'Не удалось получить историю игр'
        setError(message)
        setStatus('failed')
      }
    },
    [limit],
  )

  useEffect(() => {
    loadHistory(page)
  }, [loadHistory, page])

  const handleRefresh = () => {
    loadHistory(page)
  }

  const handlePrev = () => {
    if (page > 1) {
      setPage((prev) => Math.max(prev - 1, 1))
    }
  }

  const handleNext = () => {
    if (page < totalPages) {
      setPage((prev) => Math.min(prev + 1, totalPages))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>История игр</h1>
        <button type="button" className={styles.refreshButton} onClick={handleRefresh}>
          Обновить
        </button>
      </div>

      {status === 'loading' && (
        <div className={styles.state}>Загружаем историю…</div>
      )}

      {status === 'failed' && (
        <div className={styles.error}>
          <p>{error}</p>
          <button type="button" className={styles.retryButton} onClick={handleRefresh}>
            Попробовать ещё раз
          </button>
        </div>
      )}

      {status === 'succeeded' && items.length === 0 && (
        <div className={styles.state}>Завершённых игр пока нет.</div>
      )}

      {status === 'succeeded' && items.length > 0 && (
        <div className={styles.list}>
          {items.map((game) => (
            <article key={game.id} className={styles.card}>
              <header className={styles.cardHeader}>
                <div>
                  <h2 className={styles.gameName}>{game.name}</h2>
                  <span className={styles.gameMeta}>
                    Начало: {formatDateTime(game.startedAt)} · Завершение: {formatDateTime(game.finishedAt)}
                  </span>
                </div>
                <div className={styles.gameStats}>
                  <span>Участников: {game.playerCount ?? 0}</span>
                  {game.questionDuration ? (
                    <span>Время на вопрос: {game.questionDuration} сек.</span>
                  ) : null}
                </div>
              </header>

              <section className={styles.winnersSection}>
                <h3 className={styles.sectionTitle}>Победители</h3>
                {Array.isArray(game.winners) && game.winners.length > 0 ? (
                  <ul className={styles.winnersList}>
                    {game.winners.map((winner) => (
                      <li key={winner.id} className={styles.winnerItem}>
                        <span className={styles.winnerName}>{winner.username}</span>
                        {winner.groupName ? (
                          <span className={styles.winnerGroup}>{winner.groupName}</span>
                        ) : null}
                        <span className={styles.winnerScore}>{winner.score} балл(ов)</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.noWinners}>Нет данных о победителях</p>
                )}
              </section>
            </article>
          ))}
        </div>
      )}

      {status === 'succeeded' && totalPages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageButton}
            onClick={handlePrev}
            disabled={page === 1}
          >
            Назад
          </button>
          <span className={styles.pageInfo}>
            Страница {page} из {totalPages}
          </span>
          <button
            type="button"
            className={styles.pageButton}
            onClick={handleNext}
            disabled={page === totalPages}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  )
}

export default GameHistory


