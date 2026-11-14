import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// fs.allow '..': the Log page imports backend/rules/thresholds.json (single source for units/limits).
export default defineConfig({ plugins: [react()], server: { fs: { allow: ['..'] } } })
