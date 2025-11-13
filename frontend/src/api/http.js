import axios from 'axios'

export const API_BASE_URL = import.meta.env.VITE_API_URL  ?? 'http://localhost:3000/api'

export const http = axios.create({
  baseURL: API_BASE_URL,
})

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('quiz_admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('quiz_admin_token', token)
  } else {
    localStorage.removeItem('quiz_admin_token')
  }
}

export default API_BASE_URL
