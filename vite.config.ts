import { defineConfig } from 'vite'

// GITHUB_ACTIONS env var 由 GitHub Actions runner 自動設定。
// 本地 dev / build 維持 base: '/'，GitHub Pages build 使用 '/WeeklyBrief/'。
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/WeeklyBrief/' : '/',
})
