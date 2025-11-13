import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { createPlayer } from '../../api/players.js'

const PLAYER_STORAGE_KEY = 'quiz_player'

const getStorage = () => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.sessionStorage
  } catch (error) {
    console.warn('Session storage недоступно', error)
    return null
  }
}

const loadPlayerFromStorage = () => {
  const storage = getStorage()
  if (!storage) {
    return null
  }
  try {
    const raw = storage.getItem(PLAYER_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const savePlayerToStorage = (value) => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(value))
  } catch (error) {
    console.warn('Не удалось сохранить игрока в sessionStorage', error)
  }
}

const clearPlayerFromStorage = () => {
  const storage = getStorage()
  if (!storage) {
    return
  }
  try {
    storage.removeItem(PLAYER_STORAGE_KEY)
  } catch (error) {
    console.warn('Не удалось очистить данные игрока', error)
  }
}

export const joinGame = createAsyncThunk(
  'player/joinGame',
  async ({ username, groupName, gameId }, { rejectWithValue }) => {
    try {
      const response = await createPlayer({
        username,
        groupName,
        gameId: Number(gameId),
      })
      return response.data ?? response
    } catch (error) {
      const message =
        error.response?.data?.message ??
        error.message ??
        'Не удалось подключиться к игре'
      return rejectWithValue(message)
    }
  },
)

const initialState = {
  player: loadPlayerFromStorage(),
  status: 'idle',
  error: null,
}

const playerSlice = createSlice({
  name: 'player',
  initialState,
  reducers: {
    resetPlayer(state) {
      state.player = null
      state.status = 'idle'
      state.error = null
      clearPlayerFromStorage()
    },
    mergePlayer(state, action) {
      if (!state.player) {
        return
      }
      state.player = {
        ...state.player,
        ...action.payload,
      }
      savePlayerToStorage(state.player)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(joinGame.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(joinGame.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.player = action.payload
        savePlayerToStorage(action.payload)
      })
      .addCase(joinGame.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload ?? 'Не удалось подключиться'
      })
  },
})

export const { resetPlayer, mergePlayer } = playerSlice.actions

export const selectPlayerState = (state) => state.player
export const selectPlayer = (state) => state.player.player
export const selectPlayerStatus = (state) => state.player.status
export const selectPlayerError = (state) => state.player.error

export default playerSlice.reducer

