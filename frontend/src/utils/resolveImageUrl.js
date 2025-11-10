import API_BASE_URL from "../api/http"
const API_ORIGIN = API_BASE_URL.replace(/\/$/, '').replace(/\/api$/, '')

const resolveImageUrl = (path) => {
  if (!path) {
    return ''
  }
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export default resolveImageUrl
export { API_ORIGIN, API_BASE_URL }
