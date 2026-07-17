const API_BASE = 'https://www.googleapis.com/calendar/v3'

export interface CalendarInfo {
  id: string
  summary: string
}

export interface CalendarEvent {
  summary?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

async function apiFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Calendar API 錯誤 ${res.status}：${body}`)
  }
  return res.json()
}

export async function listCalendars(token: string): Promise<CalendarInfo[]> {
  const data = await apiFetch('/users/me/calendarList', token)
  return (data.items ?? []).map((c: any) => ({ id: c.id, summary: c.summary }))
}

export async function listWeekEvents(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const data = await apiFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`, token)
  return data.items ?? []
}
