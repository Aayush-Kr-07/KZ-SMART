const API_BASE = process.env.REACT_APP_API_URL || '';

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || (response.status === 404 && path.startsWith('/api/guardian/')
      ? 'The guardian API is not running the latest version. Restart the backend with npm run dev, then try again.'
      : `The server could not complete this request (HTTP ${response.status}).`);
    throw new Error(message);
  }
  return payload || {};
}