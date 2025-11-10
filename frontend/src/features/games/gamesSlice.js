import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { createGame, deleteGame, fetchGames, startGame, stopGame, advanceGameQuestion } from '../../api/games.js'

const normalizeGame = (raw) => ({
  id: raw.id,
  name: raw.name,
  created_at: raw.created_at ?? raw.createdAt ?? null,
  status: raw.status ?? 'draft',
  current_question_index: raw.current_question_index ?? raw.currentQuestionIndex ?? 0,
  question_duration: raw.question_duration ?? raw.questionDuration ?? 0,
  started_at: raw.started_at ?? raw.startedAt ?? null,
  finished_at: raw.finished_at ?? raw.finishedAt ?? null,
  is_question_closed:
    raw.is_question_closed ?? raw.isQuestionClosed ?? raw.questionClosed ?? false,
})

export const loadGames = createAsyncThunk(
  'games/loadGames',
  async (params, { rejectWithValue }) => {
    try {
      const data = await fetchGames(params)
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось получить список игр'
      return rejectWithValue(message)
    }
  },
)

export const addGame = createAsyncThunk(
  'games/addGame',
  async (name, { rejectWithValue }) => {
    try {
      const data = await createGame({ name })
      return data
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось создать игру'
      return rejectWithValue(message)
    }
  },
)

export const removeGame = createAsyncThunk(
  'games/removeGame',
  async (id, { rejectWithValue }) => {
    try {
      await deleteGame(id)
      return id
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось удалить игру'
      return rejectWithValue(message)
    }
  },
)

export const startGameFlow = createAsyncThunk(
  'games/startGame',
  async ({ gameId, questionDuration }, { rejectWithValue }) => {
    try {
      const payload =
        typeof questionDuration === 'number' ? { questionDuration } : undefined
      const data = await startGame(gameId, payload)
      return data.game
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось запустить игру'
      return rejectWithValue(message)
    }
  },
)

export const stopGameFlow = createAsyncThunk(
  'games/stopGame',
  async (gameId, { rejectWithValue }) => {
    try {
      const data = await stopGame(gameId)
      return data.game
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось остановить игру'
      return rejectWithValue(message)
    }
  },
)

export const goToNextQuestion = createAsyncThunk(
  'games/goToNextQuestion',
  async (gameId, { rejectWithValue }) => {
    try {
      const data = await advanceGameQuestion(gameId)
      return data.game ?? null
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось переключить вопрос'
      return rejectWithValue(message)
    }
  },
)

const initialState = {
  items: [],
  total: 0,
  page: 1,
  limit: 10,
  status: 'idle',
  error: null,
}

const gamesSlice = createSlice({
  name: 'games',
  initialState,
  reducers: {
    setPage(state, action) {
      state.page = action.payload
    },
    updateGame(state, action) {
      state.items = state.items.map((game) =>
        game.id === action.payload.id ? { ...game, ...action.payload } : game,
      )
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadGames.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(loadGames.fulfilled, (state, action) => {
        state.status = 'succeeded'
        const items = action.payload.items ?? []
        state.items = items.map(normalizeGame)
        state.total = action.payload.total ?? 0
        state.page = action.payload.page ?? 1
        state.limit = action.payload.limit ?? 10
      })
      .addCase(loadGames.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? 'Не удалось загрузить игры'
      })
      .addCase(addGame.pending, (state) => {
        state.error = null
      })
      .addCase(addGame.fulfilled, (state, action) => {
        state.items = [normalizeGame(action.payload), ...state.items]
        state.total += 1
      })
      .addCase(addGame.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось создать игру'
      })
      .addCase(removeGame.fulfilled, (state, action) => {
        state.items = state.items.filter((game) => game.id !== action.payload)
        state.total = Math.max(state.total - 1, 0)
      })
      .addCase(removeGame.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось удалить игру'
      })
      .addCase(startGameFlow.fulfilled, (state, action) => {
        const normalized = normalizeGame(action.payload)
        state.items = state.items.map((game) =>
          game.id === normalized.id ? normalized : game,
        )
      })
      .addCase(startGameFlow.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось запустить игру'
      })
      .addCase(stopGameFlow.fulfilled, (state, action) => {
        const normalized = normalizeGame(action.payload)
        state.items = state.items.map((game) =>
          game.id === normalized.id ? normalized : game,
        )
      })
      .addCase(stopGameFlow.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось остановить игру'
      })
      .addCase(goToNextQuestion.fulfilled, (state, action) => {
        if (!action.payload) {
          return
        }
        const normalized = normalizeGame(action.payload)
        state.items = state.items.map((game) =>
          game.id === normalized.id ? normalized : game,
        )
      })
      .addCase(goToNextQuestion.rejected, (state, action) => {
        state.error = action.payload ?? 'Не удалось переключить вопрос'
      })
  },
})

export const { setPage, updateGame } = gamesSlice.actions

export const selectGamesState = (state) => state.games
export const selectGames = (state) => state.games.items
export const selectGamesStatus = (state) => state.games.status
export const selectGamesError = (state) => state.games.error

export default gamesSlice.reducer

