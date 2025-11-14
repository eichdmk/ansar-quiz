import { useEffect, useMemo, useRef, useState } from 'react'
import { useSocket } from '../../app/SocketProvider.jsx'
import { fetchPlayers } from '../../api/players.js'
import { fetchGames } from '../../api/games.js'
import resolveImageUrl from '../../utils/resolveImageUrl.js'
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
  const [countdownValue, setCountdownValue] = useState(null)
  const [lastQuestionWinner, setLastQuestionWinner] = useState(null)
  const [queue, setQueue] = useState([])

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
      setCountdownValue(null)
      setLastQuestionWinner(null)
      setQueue([])
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
      setCountdownValue(null)
      setQueue([])
      const winnerId =
        payload?.winner?.id ??
        payload?.winner?.playerId ??
        payload?.winner?.player_id ??
        payload?.winner?.playerID ??
        null
      if (winnerId !== null && winnerId !== undefined) {
        setLastQuestionWinner({
          id: winnerId,
          username: payload.winner.username || payload.winner.name || null,
          groupName: payload.winner.groupName || payload.winner.group || null,
        })
      } else {
        setLastQuestionWinner(null)
      }
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, is_question_closed: true }
            : game,
        ),
      )
    }

    const handleGameOpened = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setCountdownValue(null)
      setGameStatus('ready')
      setLastQuestionWinner(null)
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'ready', is_question_closed: true }
            : game,
        ),
      )
    }

    const handleCountdown = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setCountdownValue(payload.value)
      if (payload.value !== null && payload.value !== undefined) {
        setGameStatus('countdown')
      } else {
        setGameStatus('running')
      }
      setLastQuestionWinner(null)
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'running', is_question_closed: true }
            : game,
        ),
      )
    }

    const handleGameClosed = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setCountdownValue(null)
      setGameStatus('waiting')
      setLastQuestionWinner(null)
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'draft', is_question_closed: true }
            : game,
        ),
      )
    }

    const handleGameStarted = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('running')
      setCountdownValue(null)
      setLastQuestionWinner(null)
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
      setCountdownValue(null)
    }

    const handleGameFinished = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setGameStatus('finished')
      setCountdownValue(null)
      setQueue([])
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'finished', is_question_closed: true }
            : game,
        ),
      )
    }

    const handleQueueUpdated = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      setQueue(payload.queue || [])
    }

    const handleQuestionReady = (payload) => {
      if (!isSameGame(payload.gameId)) {
        return
      }
      // Очищаем отсчет когда вопрос готов
      setCountdownValue(null)
      setGameStatus('running')
      setLastQuestionWinner(null)
      setQueue([])
      setGames((prev) =>
        prev.map((game) =>
          toNumber(game.id) === toNumber(payload.gameId)
            ? { ...game, status: 'running', is_question_closed: false }
            : game,
        ),
      )
    }

    socket.on('player:joined', handlePlayerJoined)
    socket.on('player:left', handlePlayerLeft)
    socket.on('player:scoreUpdated', handleScoreUpdated)
    socket.on('game:questionOpened', handleQuestionOpened)
    socket.on('game:questionClosed', handleQuestionClosed)
    socket.on('game:opened', handleGameOpened)
    socket.on('game:countdown', handleCountdown)
    socket.on('game:questionReady', handleQuestionReady)
    socket.on('game:closed', handleGameClosed)
    socket.on('game:started', handleGameStarted)
    socket.on('game:stopped', handleGameStopped)
    socket.on('game:finished', handleGameFinished)
    socket.on('player:queueUpdated', handleQueueUpdated)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('player:joined', handlePlayerJoined)
      socket.off('player:left', handlePlayerLeft)
      socket.off('player:scoreUpdated', handleScoreUpdated)
      socket.off('game:questionOpened', handleQuestionOpened)
      socket.off('game:questionClosed', handleQuestionClosed)
      socket.off('game:opened', handleGameOpened)
      socket.off('game:countdown', handleCountdown)
      socket.off('game:questionReady', handleQuestionReady)
      socket.off('game:closed', handleGameClosed)
      socket.off('game:started', handleGameStarted)
      socket.off('game:stopped', handleGameStopped)
      socket.off('game:finished', handleGameFinished)
      socket.off('player:queueUpdated', handleQueueUpdated)
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
    setLastQuestionWinner(null)
  }, [selectedGameId])

  useEffect(() => {
    if (!selectedGameId) {
      setGameStatus('waiting')
      return
    }
    if (countdownValue !== null && countdownValue !== undefined) {
      setGameStatus('countdown')
      return
    }
    const game = games.find((item) => item.id === selectedGameId)
    if (!game) {
      setGameStatus('waiting')
      return
    }
    if (game.status === 'running' && game.is_question_closed) {
      setGameStatus('closed')
    } else {
      setGameStatus(game.status ?? 'waiting')
    }
  }, [games, selectedGameId, countdownValue])

  useEffect(() => {
    setCountdownValue(null)
  }, [selectedGameId])

  const placementBadges = ['🥇', '🥈', '🥉']
  const placementStyles = [
    {
      background: 'linear-gradient(135deg, #FFE259, #FFA751)',
      color: '#3E2600',
      boxShadow: '0 18px 32px rgba(255, 167, 81, 0.3)',
      border: 'none',
    },
    {
      background: 'linear-gradient(135deg, #DDE5FF, #A0B8FF)',
      color: '#112963',
      boxShadow: '0 16px 28px rgba(160, 184, 255, 0.26)',
      border: 'none',
    },
    {
      background: 'linear-gradient(135deg, #F6D0B1, #F79963)',
      color: '#3F1F09',
      boxShadow: '0 14px 24px rgba(247, 153, 99, 0.28)',
      border: 'none',
    },
  ]
  const avatarPalette = ['5A6FF1', 'FF7F57', '33B679', 'A65DEB', 'FFBA08', '00B4D8']

  const getPlacementBadge = (index) => placementBadges[index] ?? `#${index + 1}`

  const getRowStyle = (index) => placementStyles[index] ?? {}

  const pickAvatarColor = (value) => {
    const source = value || ''
    if (!source) {
      return avatarPalette[0]
    }
    const hash = [...source].reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return avatarPalette[hash % avatarPalette.length]
  }

  const getPlayerAvatarUrl = (player) => {
    const candidate =
      player?.avatarUrl ||
      player?.avatar ||
      player?.photoUrl ||
      player?.imageUrl ||
      player?.image ||
      null
    if (candidate) {
      return resolveImageUrl(candidate)
    }
    const nameValue = player?.username || player?.name || 'Player'
    const background = pickAvatarColor(nameValue)
    return `https://ui-avatars.com/api/?bold=true&name=${encodeURIComponent(
      nameValue,
    )}&background=${background}&color=ffffff&size=128`
  }

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => b.score - a.score)
  }, [players])

  const animationDuration = 650
  const [rowAnimations, setRowAnimations] = useState({})
  const previousOrderRef = useRef([])

  useEffect(() => {
    const previousOrder = previousOrderRef.current
    const nextOrder = sortedPlayers.map((player) => player.id)
    const updates = {}

    nextOrder.forEach((playerId, index) => {
      const previousIndex = previousOrder.indexOf(playerId)
      if (previousIndex === -1) {
        updates[playerId] = 'Enter'
        return
      }
      if (previousIndex > index) {
        updates[playerId] = 'Up'
      } else if (previousIndex < index) {
        updates[playerId] = 'Down'
      }
    })

    let timeoutId = null

    if (previousOrder.length === 0 && nextOrder.length > 0) {
      nextOrder.forEach((playerId) => {
        updates[playerId] = 'Enter'
      })
    }

    if (Object.keys(updates).length > 0) {
      setRowAnimations(updates)
      timeoutId = setTimeout(() => {
        setRowAnimations({})
      }, animationDuration)
    } else if (Object.keys(rowAnimations).length > 0) {
      setRowAnimations({})
    }

    previousOrderRef.current = nextOrder

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [sortedPlayers])

  return (
    <div className={styles.page}>
      <div className={styles.board}>
        <div className={styles.headerRow}>
          <h1>
            <span role="img" aria-hidden="true">
              🏆
            </span>{' '}
            Таблица лидеров
          </h1>
          <h2>
            <span role="img" aria-hidden="true">
              🎮
            </span>{' '}
            Код игры №{(selectedGameId && selectedGameId) || ''}
          </h2>
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

        {gameStatus === 'ready' && (
          <div className={styles.stateBanner}>
            Комната открыта. Игроки могут подключаться.
          </div>
        )}
        {gameStatus === 'countdown' && countdownValue !== null && countdownValue !== undefined && (
          <div className={styles.countdownBanner}>
            {countdownValue > 0 ? `Старт через ${countdownValue}` : 'Старт!'}
          </div>
        )}
        {gameStatus === 'finished' && (
          <div className={styles.stateBanner}>Игра завершена</div>
        )}
        {gameStatus === 'closed' && (
          <div className={styles.stateBanner}>Ожидаем следующий вопрос…</div>
        )}

        {lastQuestionWinner && (
          <div className={styles.winnerBanner}>
            <span>
              {lastQuestionWinner.username || `ID ${lastQuestionWinner.id}`} ответил(а) правильно на последний
              вопрос
            </span>
          </div>
        )}

        {selectedGameId && loading && <div className={styles.stateBox}>Загружаем участников…</div>}
        {selectedGameId && error && !loading && <div className={styles.stateBox}>{error}</div>}
        {selectedGameId && !loading && !error && sortedPlayers.length === 0 && (
          <div className={styles.stateBox}>Пока нет участников</div>
        )}

        {selectedGameId && !loading && !error && sortedPlayers.length > 0 && (
          <div className={styles.contentWrapper}>
            <div className={styles.tablePlaceholder}>
              <div className={styles.tableHeader}>
                <span>Место</span>
                <span>Игрок</span>
                <span>Группа</span>
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>⚡ Баллы</span>
              </div>
              {sortedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`${styles.tableRow} ${
                    rowAnimations[player.id] ? styles[`row${rowAnimations[player.id]}`] : ''
                  } ${
                    lastQuestionWinner?.id &&
                    String(player.id) === String(lastQuestionWinner.id)
                      ? styles.tableRowWinner
                      : ''
                  }`}
                  style={{
                    ...getRowStyle(index),
                  }}
                >
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontWeight: 700,
                      fontSize: index < 3 ? '20px' : '16px',
                    }}
                  >
                    {getPlacementBadge(index)}
                  </span>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      fontWeight: index === 0 ? 700 : 600,
                    }}
                  >
                    <span
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        flexShrink: 0,
                        border: index < 3 ? '3px solid rgba(255, 255, 255, 0.65)' : '2px solid rgba(33, 150, 243, 0.18)',
                        boxShadow:
                          index < 3 ? '0 6px 14px rgba(0, 0, 0, 0.18)' : '0 4px 10px rgba(33, 150, 243, 0.12)',
                        background: `#${pickAvatarColor(player?.username || player?.name || String(player?.id ?? '')).toUpperCase()}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={getPlayerAvatarUrl(player)}
                        alt={player.username ? `Аватар ${player.username}` : 'Аватар игрока'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        loading="lazy"
                      />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                    {index === 0 ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span role="img" aria-hidden="true">
                        </span>
                        {player.username}
                      </span>
                    ) : (
                      player.username
                    )}
                    </span>
                  </span>
                  <span style={{ fontWeight: 500 }}>{player.groupName || '—'}</span>
                  <span
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: '8px',
                      fontWeight: 700,
                    }}
                  >
                    <span role="img" aria-hidden="true">
                      {index === 0 ? '🔥' : index < 3 ? '⚡' : '🎯'}
                    </span>
                    <span>{player.score ?? 0}</span>
                  </span>
                </div>
              ))}
            </div>

            {queue.length > 0 && (
              <div className={styles.queueSection}>
                <h3 className={styles.queueTitle}>
                  <span role="img" aria-hidden="true">
                    📋
                  </span>{' '}
                  Очередь ответов ({queue.length})
                </h3>
                <div className={styles.queueList}>
                  {queue.map((item, idx) => (
                    <div key={item.playerId} className={styles.queueItem}>
                      <span className={styles.queuePosition}>{idx + 1}.</span>
                      <span className={styles.queuePlayerName}>{item.username}</span>
                      {item.groupName && (
                        <span className={styles.queueGroupName}>({item.groupName})</span>
                      )}
                      {idx === 0 && (
                        <span className={styles.queueActive}>Отвечает сейчас</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default Leaderboard

