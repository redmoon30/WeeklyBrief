// 移植自 .claude/skills/mixcode-weekly-log/mixcode_weekly.py 的分組/時數邏輯。
// 這組 regex 是 MixCode/動畫產業慣用語（ep 編號、Storyboard/Animatic 等），
// 先當作預設值服務目前真正的使用者；之後若要給其他團隊用，再抽成可設定規則。

import type { CalendarEvent } from './calendar'

interface DatePart {
  year: number
  month: number
  day: number
}

export interface WeekRange {
  monday: DatePart
  sunday: DatePart
  timeMin: string
  timeMax: string
}

interface Task {
  title: string
  hours: number
}

export interface SummaryLine {
  label: string
  hours: number
}

export interface SummaryResult {
  weekLabel: string
  episodeLines: SummaryLine[]
  otherTasks: SummaryLine[]
  otherTotal: number
  activeDaysCount: number
  totalHours: number
}

// ── 週範圍（台灣時間 UTC+8，固定，不受瀏覽器所在時區影響） ──────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function taipeiTodayParts(): DatePart & { weekday: number } {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = fmt.formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  }
}

function addDays(p: DatePart, delta: number): DatePart {
  // 用 UTC 正午當運算基準，避開日期邊界誤差（台灣無日光節約時間）
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day, 12))
  d.setUTCDate(d.getUTCDate() + delta)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function getWeekRange(): WeekRange {
  const today = taipeiTodayParts()
  const monday = addDays(today, -today.weekday)
  const sunday = addDays(monday, 6)
  const iso = (p: DatePart, time: string) => `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${time}+08:00`
  return { monday, sunday, timeMin: iso(monday, '00:00:00'), timeMax: iso(sunday, '23:59:59') }
}

// ── 事件時間解析 ──────────────────────────────────────────────────────────

function toDate(part: { dateTime?: string; date?: string }): Date {
  if (part.dateTime) return new Date(part.dateTime)
  const [y, m, d] = part.date!.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)) // 全天事件：以 UTC 正午為基準避免跨日誤差
}

function taipeiDateKey(part: { dateTime?: string; date?: string }): string {
  if (part.date) return part.date // 全天事件的 date 欄位本身就是日曆日期，直接用
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date(part.dateTime!))
}

function durationHours(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / 3600000
  return Math.round(hours * 2) / 2
}

// ── 分類 regex（同 mixcode_weekly.py） ───────────────────────────────────

const EP_RE = /[Ee][Pp]\s*(\d+)/
const LEADING_VERBS_RE = /^(弄一下|看一下|確認一下|弄好|繼續|弄|看|聽|跟|整理|回覆|開|做|確認|處理|幫|完成|更新|討論|去|聊|想)+/
const FEEDBACK_RE = /feedback|回覆|反饋/i

const WORK_TYPES: Record<string, RegExp[]> = {
  Storyboard: [/\bSB\b/i, /storyboard/i, /分鏡/],
  Animatic: [/\bMB\b/i, /animatic/i, /motionboard/i, /動態腳本/],
  MG: [/\bMG\b/i, /motion\s+graphics/i, /動態設計/],
  Layout: [/\blayout\b/i, /角色動態/],
  Styleframe: [/styleframe/i, /美術設定/],
}

function extractEpisode(title: string): string | null {
  const m = EP_RE.exec(title)
  return m ? `ep${pad2(Number(m[1]))}` : null
}

function detectWorkType(title: string): string | null {
  for (const [canonical, patterns] of Object.entries(WORK_TYPES)) {
    if (patterns.some((p) => p.test(title))) return canonical
  }
  return null
}

function classifyEpisode(epTasks: Task[]): SummaryLine[] {
  const typed = new Map<string, Task[]>()
  const untyped: Task[] = []

  for (const task of epTasks) {
    const wt = detectWorkType(task.title)
    if (wt) {
      if (!typed.has(wt)) typed.set(wt, [])
      typed.get(wt)!.push(task)
    } else {
      untyped.push(task)
    }
  }

  if (typed.size > 0) {
    let dominant = ''
    let dominantHours = -1
    for (const [wt, tasks] of typed) {
      const sum = tasks.reduce((s, t) => s + t.hours, 0)
      if (sum > dominantHours) {
        dominant = wt
        dominantHours = sum
      }
    }
    typed.get(dominant)!.push(...untyped)
  } else if (untyped.length > 0) {
    typed.set('（雜項）', untyped)
  }

  const result: SummaryLine[] = []
  const byLabel = new Map<string, number>()
  for (const [workType, tasks] of typed) {
    const total = tasks.reduce((s, t) => s + t.hours, 0)
    const hasFeedback = tasks.some((t) => FEEDBACK_RE.test(t.title))
    const label = hasFeedback && workType !== '（雜項）' ? `${workType} feedback` : workType
    byLabel.set(label, (byLabel.get(label) ?? 0) + total)
  }
  for (const [label, hours] of byLabel) result.push({ label, hours })
  return result
}

function taskGroupKey(title: string): string {
  const stripped = title.replace(LEADING_VERBS_RE, '').trim()
  const firstToken = stripped.split(/[!！，、,\s]/)[0]?.trim() ?? stripped
  return firstToken.slice(0, 10)
}

function groupOtherTasks(tasks: Task[]): SummaryLine[] {
  const buckets = new Map<string, number>()
  for (const task of tasks) {
    const key = taskGroupKey(task.title)
    buckets.set(key, (buckets.get(key) ?? 0) + task.hours)
  }
  return [...buckets.entries()]
    .map(([label, hours]) => ({ label, hours }))
    .sort((a, b) => b.hours - a.hours)
}

// ── 主流程 ────────────────────────────────────────────────────────────────

export function summarize(events: CalendarEvent[], week: WeekRange): SummaryResult {
  const activeDays = new Set<string>()
  let totalHours = 0

  const epGroups = new Map<string, Task[]>()
  const otherTasks: Task[] = []

  for (const ev of events) {
    const start = toDate(ev.start)
    const end = toDate(ev.end)
    const hours = durationHours(start, end)
    totalHours += hours
    activeDays.add(taipeiDateKey(ev.start))

    const task: Task = { title: ev.summary ?? '（無標題）', hours }
    const ep = extractEpisode(task.title)
    if (ep) {
      if (!epGroups.has(ep)) epGroups.set(ep, [])
      epGroups.get(ep)!.push(task)
    } else {
      otherTasks.push(task)
    }
  }

  const episodeLines: SummaryLine[] = []
  for (const ep of [...epGroups.keys()].sort()) {
    for (const line of classifyEpisode(epGroups.get(ep)!)) {
      episodeLines.push({ label: `${ep} ${line.label}`, hours: line.hours })
    }
  }

  const otherGrouped = groupOtherTasks(otherTasks)
  const otherTotal = otherGrouped.reduce((s, t) => s + t.hours, 0)

  const weekLabel = `${week.monday.month}月${pad2(week.monday.day)}日 ~ ${week.sunday.month}月${pad2(week.sunday.day)}日`

  return {
    weekLabel,
    episodeLines,
    otherTasks: otherGrouped,
    otherTotal,
    activeDaysCount: activeDays.size,
    totalHours,
  }
}

export function fmtHours(h: number): string {
  return Number.isInteger(h) ? String(h) : String(h)
}
