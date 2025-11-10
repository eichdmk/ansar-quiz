import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../features/auth/authSlice.js'
import gamesReducer from '../features/games/gamesSlice.js'
import questionsReducer from '../features/questions/questionsSlice.js'
import playerReducer from '../features/player/playerSlice.js'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    games: gamesReducer,
    questions: questionsReducer,
    player: playerReducer,
  },
})

export const setupStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      games: gamesReducer,
      questions: questionsReducer,
      player: playerReducer,
    },
  })

export const getState = () => store.getState()

export const dispatch = store.dispatch
