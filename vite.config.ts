import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 2026-08-28: node_modules 에 중첩 사본(node_modules/node_modules/@react-three/fiber)이 생기면 fiber 가 두 벌 번들돼
  // 'R3F: Hooks can only be used within the Canvas component!' 로 프로덕션이 통째로 죽는다(실측). 단일 인스턴스를 강제한다.
  resolve: { dedupe: ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei', 'zustand'] },
  server: { port: 5183, strictPort: true },
  preview: { port: 5183, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        probe: resolve(__dirname, 'probe.html'),
      },
    },
  },
})
