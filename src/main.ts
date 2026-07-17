import './style.css'
import { login } from './auth'
import { listCalendars, listWeekEvents, type CalendarInfo } from './calendar'
import { getWeekRange, summarize, fmtHours, type SummaryResult } from './summarize'

const app = document.querySelector<HTMLDivElement>('#app')!

function renderLanding() {
  app.innerHTML = `
    <main class="card">
      <h1>📅 WeeklyBrief</h1>
      <p class="subtitle">用你自己的 Google 帳號登入，選一個日曆，看這週的工作彙整。</p>
      <button id="login-btn" class="primary">用 Google 登入</button>
      <p class="privacy">
        🔒 這個頁面不會把你的日曆資料傳到任何伺服器——登入、讀取、彙整全部在你的瀏覽器裡完成，
        關掉分頁後 token 就消失，不會被儲存。
      </p>
    </main>
  `
  document.querySelector('#login-btn')!.addEventListener('click', handleLogin)
}

function renderLoading(message: string) {
  app.innerHTML = `<main class="card"><p class="loading">${message}</p></main>`
}

function renderError(message: string, onRetry: () => void) {
  app.innerHTML = `
    <main class="card">
      <p class="error">⚠️ ${message}</p>
      <button id="retry-btn" class="secondary">重試</button>
    </main>
  `
  document.querySelector('#retry-btn')!.addEventListener('click', onRetry)
}

async function handleLogin() {
  renderLoading('登入中…')
  try {
    const token = await login()
    const calendars = await listCalendars(token)
    if (calendars.length === 0) {
      renderError('這個 Google 帳號底下沒有任何日曆。', renderLanding)
      return
    }
    renderCalendarPicker(token, calendars)
  } catch (err) {
    renderError((err as Error).message, renderLanding)
  }
}

function renderCalendarPicker(token: string, calendars: CalendarInfo[]) {
  app.innerHTML = `
    <main class="card">
      <h1>選一個日曆</h1>
      <select id="calendar-select">
        ${calendars.map((c) => `<option value="${c.id}">${escapeHtml(c.summary)}</option>`).join('')}
      </select>
      <button id="confirm-btn" class="primary">產生本週彙整</button>
    </main>
  `
  document.querySelector('#confirm-btn')!.addEventListener('click', () => {
    const select = document.querySelector<HTMLSelectElement>('#calendar-select')!
    void handleSummarize(token, select.value)
  })
}

async function handleSummarize(token: string, calendarId: string) {
  renderLoading('讀取行事曆中…')
  try {
    const week = getWeekRange()
    const events = await listWeekEvents(token, calendarId, week.timeMin, week.timeMax)
    const result = summarize(events, week)
    renderSummary(result)
  } catch (err) {
    renderError((err as Error).message, renderLanding)
  }
}

function renderSummary(result: SummaryResult) {
  const episodeHtml = result.episodeLines
    .map((l) => `<div class="line">${escapeHtml(l.label)} <span class="hours">${fmtHours(l.hours)}hr</span></div>`)
    .join('')

  const otherHtml = result.otherTasks.length
    ? `
      <div class="other-header">其他 <span class="hours">${fmtHours(result.otherTotal)}hr</span></div>
      ${result.otherTasks
        .map((t) => `<div class="line indent">- ${escapeHtml(t.label)} <span class="hours">${fmtHours(t.hours)}hr</span></div>`)
        .join('')}
    `
    : ''

  const isEmpty = result.episodeLines.length === 0 && result.otherTasks.length === 0

  app.innerHTML = `
    <main class="card">
      <h1>本週工作記錄</h1>
      <p class="week-label">${result.weekLabel}</p>
      ${
        isEmpty
          ? '<p class="empty">這週這個日曆裡沒有事件。</p>'
          : `${episodeHtml}${otherHtml}
             <div class="total">共 ${result.activeDaysCount} 天工作，總計約 ${fmtHours(result.totalHours)}hr</div>`
      }
      <button id="back-btn" class="secondary">回首頁</button>
    </main>
  `
  document.querySelector('#back-btn')!.addEventListener('click', renderLanding)
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

renderLanding()
