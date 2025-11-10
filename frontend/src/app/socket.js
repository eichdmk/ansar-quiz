import { io } from 'socket.io-client'
import { API_BASE_URL } from '../api/http.js'

const API_ORIGIN = API_BASE_URL.replace(/\/$/, '').replace(/\/api$/, '')

export const socket = io(API_ORIGIN, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  withCredentials: true,
})
