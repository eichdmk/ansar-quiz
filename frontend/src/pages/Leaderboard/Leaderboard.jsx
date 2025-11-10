import { useEffect, useMemo, useState } from 'react'
import { useSocket } from '../../app/SocketProvider.jsx'
import { fetchPlayers } from '../../api/players.js'
import { fetchGames } from '../../api/games.js'
import styles from './Leaderboard.module.css'

function Leaderboard() {
  const socket = useSocket()

  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [gamesError, setGamesError] = useState(null)

  const [selectedGameId, setSelectedGameId] = useState(null)
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting')

  useEffect(() => {
    setGamesLoading(true)
    fetchGames({ limit: 50 })
      .then((data) => {
        const items = data.items ?? []
        setGames(items)
        setGamesError(null)
        if (!selectedGameId && items.length > 0) {
          setSelectedGameId(items[0].id)
          if (items[0].status === 'running' && items[0].is_question_closed) {
            setGameStatus('closed')
          } else {
            setGameStatus(items[0].status ?? 'waiting')
          }
        }
      })
      .catch((err) => {
        setGamesError(err?.message ?? 'Не удалось загрузить список игр')
      })
      .finally(() => setGamesLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedGameId) {
      return () => {}
    }

    const toNumber = (value) => {
      const parsed = Number(value)
      return Number.isNaN(parsed) ? null : parsed
    }

    const isSameGame = (gameId) => {
      const payloadGameId = toNumber(gameId)
      const currentId = toNumber(selectedGameId)
      if (payloadGameId === null || currentId === null) {
        return false
      }
      return payloadGameId === currentId
    }

    const handlePlayerJoined = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setPlayers((prev) => {
        if (prev.some((item) => item.id === payload.id)) {
          return prev
        }
        return [...prev, payload]
      })
    }

    const handlePlayerLeft = (payload) => {
      setPlayers((prev) => prev.filter((player) => player.id !== payload.id))
    }

    const handleScoreUpdated = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setPlayers((prev) =>
        prev
          .map((player) =>
            player.id === payload.id ? { ...player, score: payload.score } : player,
          )
          .sort((a, b) => b.score - a.score),
      )
    }

    const handleQuestionOpened = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('running')
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, is_question_closed: false }
            : game,
        ),
      )
    }

    const handleQuestionClosed = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('closed')
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, is_question_closed: true }
            : game,
        ),
      )
    }

    const handleGameStarted = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('running')
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'running' }
            : game,
        ),
      )
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, is_question_closed: false }
            : game,
        ),
      )
    }

    const handleGameStopped = (payload) => {
      if (payload.gameId !== selectedGameId) {
        return
      }
      setGameStatus('finished')
      setGames((prev) =>
        prev.map((game) =>
          game.id === payload.gameId
            ? { ...game, status: 'finished', is_question_closed: true }
            : game,
        ),
      )
    }

    const handleGameFinished = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('finished')
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'finished', is_question_closed: true }
            : game,
        ),
      )
    }

    socket.on('player:joined', handlePlayerJoined)
    socket.on('player:left', handlePlayerLeft)
    socket.on('player:scoreUpdated', handleScoreUpdated)
    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:questionClosed', handleQuestionClosed)
    socket.on('game:started', handleGameStarted)
    socket.on('game:stopped', handleGameStopped)
    socket.on('game:finished', handleGameFinished)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('player:joined', handlePlayerJoined)
      socket.off('player:left', handlePlayerLeft)
      socket.off('player:scoreUpdated', handleScoreUpdated)
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:questionClosed', handleQuestionClosed)
      socket.off('game:started', handleGameStarted)
      socket.off('game:stopped', handleGameStopped)
      socket.off('game:finished', handleGameFinished)
    }
  }, [socket, selectedGameId])

  useEffect(() => {
    if (!selectedGameId) {
      setPlayers([])
      return
    }
    setLoading(true)
    fetchPlayers(selectedGameId)
      .then((data) => {
        const list = data.items ?? []
        setPlayers([...list].sort((a, b) => b.score - a.score))
        setError(null)
      })
      .catch((err) => {
        setError(err?.message ?? 'Не удалось загрузить участников')
      })
      .finally(() => setLoading(false))
  }, [selectedGameId])

  useEffect(() => {
    if (!selectedGameId) {
      return
    }
    const game = games.find((item) => item.id === selectedGameId)
    if (game) {
      if (game.status === 'running' && game.is_question_closed) {
        setGameStatus('closed')
      } else {
        setGameStatus(game.status ?? 'waiting')
      }
    } else {
      setGameStatus('waiting')
    }
  }, [games, selectedGameId])

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score)
  }, [players])

  return (
    <div className={styles.page}>
      <div className={styles.board}>
        <div className={styles.headerRow}>
          <h1>Таблица лидеров</h1>
          <div className={styles.gameSelector}>
            <label htmlFor="game-select">Выберите игру:</label>
            <select
              id="game-select"
              value={selectedGameId || ''}
              onChange={(e) => setSelectedGameId(Number(e.target.value) || null)}
              disabled={gamesLoading || !games.length}
            >
              <option value="" disabled>
                {gamesLoading ? 'Загрузка игр…' : '— выберите игру —'}
              </option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  #{game.id} • {game.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {gamesError && <div className={styles.stateBox}>{gamesError}</div>}
        {!gamesLoading && !gamesError && games.length === 0 && (
          <div className={styles.stateBox}>Пока нет созданных игр</div>
        )}
        {!selectedGameId && !gamesLoading && games.length > 0 && (
          <div className={styles.stateBox}>Выберите игру из списка выше</div>
        )}

        {gameStatus === 'finished' && (
          <div className={styles.stateBanner}>Игра завершена</div>
        )}
        {gameStatus === 'closed' && (
          <div className={styles.stateBanner}>Ожидаем следующий вопрос…</div>
        )}

        {selectedGameId && loading && <div className={styles.stateBox}>Загружаем участников…</div>}
        {selectedGameId && error && !loading && <div className={styles.stateBox}>{error}</div>}
        {selectedGameId && !loading && !error && sortedPlayers.length === 0 && (
          <div className={styles.stateBox}>Пока нет участников</div>
        )}

        {selectedGameId && !loading && !error && sortedPlayers.length > 0 && (
          <div className={styles.tablePlaceholder}>
            <div className={styles.tableHeader}>
              <span>#</span>
              <span>Игрок</span>
              <span>Группа</span>
              <span>Баллы</span>
            </div>
            {sortedPlayers.map((player, index) => (
              <div key={player.id} className={styles.tableRow}>
                <span>{index + 1}</span>
                <span>{player.username}</span>
                <span>{player.groupName || '—'}</span>
                <span>{player.score ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Leaderboard

