const productionApiUrl =
  'https://intellmeet-backend-ubrz.onrender.com/api'

export function getApiUrl(): string {
  const configured =
    import.meta.env.VITE_API_URL
      ?.replace(/^VITE_API_URL=/, '')
      .trim()

  if (
    configured &&
    /^https?:\/\//i.test(configured)
  ) {
    return configured.replace(/\/+$/, '')
  }

  return import.meta.env.PROD
    ? productionApiUrl
    : 'http://localhost:5000/api'
}
