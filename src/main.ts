import './style.css'
import { login } from './auth'
import { listCalendars, listWeekEvents, type CalendarInfo } from './calendar'
import { getWeekRange, summarize, fmtHours, type SummaryResult, type SummaryGroup } from './summarize'

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

function buildLine(label: string, hours: number, opts: { indent?: boolean; header?: boolean } = {}): string {
  const classes = ['line']
  if (opts.indent) classes.push('indent')
  if (opts.header) classes.push('group-header')
  return `
    <div class="${classes.join(' ')}">
      <span class="bullet">•</span>
      <span class="label-text" tabindex="0" title="雙擊編輯">${escapeHtml(label)}</span>
      <span class="hours">${fmtHours(hours)}hr</span>
    </div>
  `
}

// ep 群組一律展開細項（alwaysExpand=true）；其他任務只有真的合併了兩筆以上才展開，
// 單筆的話直接顯示成一般行，不疊床架屋。
function buildGroup(group: SummaryGroup, alwaysExpand: boolean): string {
  if (!alwaysExpand && group.items.length <= 1) {
    return buildLine(group.label, group.hours)
  }
  const header = buildLine(group.label, group.hours, { header: true })
  const items = group.items.map((it) => buildLine(it.title, it.hours, { indent: true })).join('')
  return header + items
}

function renderSummary(result: SummaryResult) {
  const episodeHtml = result.episodeGroups.map((g) => buildGroup(g, true)).join('')
  const otherHtml = result.otherGroups.map((g) => buildGroup(g, false)).join('')

  const isEmpty = result.episodeGroups.length === 0 && result.otherGroups.length === 0

  app.innerHTML = `
    <main class="card wide">
      <h1>本週工作記錄</h1>
      <p class="week-label">${result.weekLabel}</p>
      <div id="summary-body">
        ${
          isEmpty
            ? '<p class="empty">這週這個日曆裡沒有事件。</p>'
            : `${episodeHtml}${otherHtml}
               <div class="total">共 ${result.activeDaysCount} 天工作，總計約 ${fmtHours(result.totalHours)}hr</div>`
        }
      </div>
      <div class="actions">
        <button id="copy-btn" class="secondary">複製本週彙整</button>
        <button id="back-btn" class="secondary">回首頁</button>
      </div>
    </main>
  `
  setupEditableLines()
  document.querySelector('#copy-btn')!.addEventListener('click', () => copySummaryText(result.weekLabel))
  document.querySelector('#back-btn')!.addEventListener('click', renderLanding)
}

// ── 雙擊編輯：把任何一行的文字改成 input，方便手動修正 Google Calendar 上打錯/太長的標題 ──

function setupEditableLines() {
  document.querySelectorAll<HTMLElement>('.label-text').forEach((span) => {
    span.addEventListener('dblclick', () => startEditing(span))
  })
}

function startEditing(span: HTMLElement) {
  const original = span.textContent ?? ''
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'edit-input'
  input.value = original

  const finish = () => {
    const newSpan = document.createElement('span')
    newSpan.className = 'label-text'
    newSpan.tabIndex = 0
    newSpan.title = '雙擊編輯'
    newSpan.textContent = input.value.trim() || original
    newSpan.addEventListener('dblclick', () => startEditing(newSpan))
    input.replaceWith(newSpan)
  }

  input.addEventListener('blur', finish)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur()
    if (e.key === 'Escape') {
      input.value = original
      input.blur()
    }
  })

  span.replaceWith(input)
  input.focus()
  input.select()
}

// ── 複製：讀目前 DOM 上的文字（含手動編輯過的），組成純文字複製到剪貼簿 ──

function copySummaryText(weekLabel: string) {
  const lines: string[] = [`📅 本週工作記錄 | ${weekLabel}`, '']

  let isFirstLine = true
  document.querySelectorAll<HTMLElement>('#summary-body > .line').forEach((el) => {
    if (el.classList.contains('group-header') && !isFirstLine) lines.push('')
    isFirstLine = false

    const label = el.querySelector('.label-text')?.textContent ?? ''
    const hours = el.querySelector('.hours')?.textContent ?? ''
    const prefix = el.classList.contains('indent') ? '  - ' : '• '
    lines.push(`${prefix}${label}  ${hours}`)
  })

  const totalEl = document.querySelector('#summary-body > .total')
  if (totalEl) lines.push('', totalEl.textContent?.trim() ?? '')

  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = document.querySelector<HTMLButtonElement>('#copy-btn')
    if (!btn) return
    const original = btn.textContent
    btn.textContent = '已複製 ✓'
    setTimeout(() => {
      btn.textContent = original
    }, 1500)
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

renderLanding()
