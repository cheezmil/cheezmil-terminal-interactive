import path from "path"
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // 强制重新构建
    force: true,
    // 生成文件名包含哈希值，确保缓存更新
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    },
    // 禁用LightningCSS，使用默认的CSS处理器
    minify: 'esbuild',
    cssMinify: false, // 完全禁用CSS压缩以避免LightningCSS警告
    // 生成source map，在生产环境中也能看到源码错误位置
    sourcemap: true
  },
  css: {
    // 禁用LightningCSS转换器
    transformer: 'postcss'
  },
  server: {
    port: Number(process.env.FRONTEND_PORT) || 1107,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.MCP_PORT || 1106}`, // MCP服务器地址
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
  preview: {
    port: Number(process.env.FRONTEND_PORT) || 1107,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.MCP_PORT || 1106}`, // MCP服务器地址
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
})