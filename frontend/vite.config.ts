import fs from 'fs'
import path from "path"
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
// Build-time app version from repo root VERSION file /
// 构建时从仓库根目录 VERSION 文件注入前端版本号
const CTI_LOCAL_VERSION = (() => {
  try {
    const versionPath = path.resolve(__dirname, '..', 'VERSION')
    const raw = fs.readFileSync(versionPath, 'utf8')
    const v = raw.trim()
    return v || '0.0.0'
  } catch {
    return '0.0.0'
  }
})()

export default defineConfig({
  plugins: [
    vue(),
  ],
  // Inject version constant into the bundle / 注入版本常量到 bundle
  define: {
    __CTI_VERSION__: JSON.stringify(CTI_LOCAL_VERSION),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@/components": path.resolve(__dirname, "./src/components"),
      "@/lib": path.resolve(__dirname, "./src/lib"),
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
        assetFileNames: `assets/[name]-[hash].[ext]`,
        // 手动分块以减小块大小
        manualChunks: (id: string) => {
          // 将Vue相关库分离到单独的块
          if (id.includes('node_modules/vue') ||
              id.includes('node_modules/vue-router') ||
              id.includes('node_modules/pinia') ||
              id.includes('node_modules/@vueuse')) {
            return 'vue-vendor'
          }
          // 将shadcn-vue相关库分离到单独的块
          if (id.includes('node_modules/shadcn-vue') ||
              id.includes('node_modules/@radix-vue') ||
              id.includes('node_modules/class-variance-authority') ||
              id.includes('node_modules/clsx') ||
              id.includes('node_modules/tailwind-merge') ||
              id.includes('node_modules/radix-vue') ||
              id.includes('node_modules/lucide-vue-next')) {
            return 'shadcn-vendor'
          }
          // 将xterm相关库分离到单独的块
          if (id.includes('node_modules/xterm')) {
            return 'terminal-vendor'
          }
        }
      }
    },
    // 禁用LightningCSS，使用默认的CSS处理器
    minify: 'esbuild',
    cssMinify: false, // 完全禁用CSS压缩以避免LightningCSS警告
    // 生成source map，在生产环境中也能看到源码错误位置
    sourcemap: true,
    // 增加块大小警告限制，避免不必要的警告
    chunkSizeWarningLimit: 1000
  },
  css: {
    // 禁用LightningCSS转换器
    transformer: 'postcss'
  },
  server: {
    port: Number(process.env.FRONTEND_PORT) || 1107,
    // Disable caching to avoid stale index.html referencing old hashed bundles /
    // 禁用缓存，避免 index.html 被缓存后仍引用旧的 hash 资源导致“刷新后样式/字符间距变回去”
    headers: {
      'Cache-Control': 'no-store',
    },
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
    // Disable caching to ensure refresh always picks the latest dist build /
    // 禁用缓存，确保刷新总能拿到最新的dist构建结果
    headers: {
      'Cache-Control': 'no-store',
    },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.MCP_PORT || 1106}`, // MCP服务器地址
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api'),
      },
    },
  },
})
