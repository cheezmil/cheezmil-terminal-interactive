<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { createSerialWriteQueue } from '@/lib/serial-write-queue.mjs'
import { WebglAddon } from '@xterm/addon-webgl'
import { initializeApiService, terminalApi } from '../services/api-service'
import { useSettingsStore } from '../stores/settings'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const settingsStore = useSettingsStore()

const terminalId = route.params.id as string
const terminal = ref<any>(null)
const isLoading = ref(true)
const isConnected = ref(false)
const isFullscreen = ref(false)

// 会话模式（local/remote）：用于明确展示当前 prompt 来源 /
// Session mode (local/remote): used to clearly show current prompt source
const sessionMode = ref<{
  sessionKind: 'local' | 'remote'
  remoteDestination: string | null
  sessionStackDepth: number
}>({ sessionKind: 'local', remoteDestination: null, sessionStackDepth: 1 })

let ws: WebSocket | null = null
// 串行写入队列：避免历史输出写入与实时 WS 输出交错 /
// Serial write queue: prevent interleaving between history writes and live WS outputs
const writeQueue = createSerialWriteQueue()
let term: Terminal | null = null
let fitAddon: FitAddon | null = null

// 防止 PTY 的 CR 覆盖效果导致“历史输出盖住光标”的视觉混乱：将孤立的 \r 转换为换行 /
// Prevent PTY CR overwrite effects that visually "smear" output over the cursor: convert lone \r into newlines
const createCROverwriteGuard = () => {
  let pendingCR = false
  return (chunk: string) => {
    if (!chunk) return ''
    let out = ''

    let i = 0
    if (pendingCR) {
      if (chunk[0] === '\n') {
        out += '\r\n'
        i = 1
      } else {
        out += '\r\n'
      }
      pendingCR = false
    }

    for (; i < chunk.length; i++) {
      const ch = chunk[i]!
      if (ch !== '\r') {
        out += ch
        continue
      }

      const next = i + 1 < chunk.length ? chunk[i + 1] : ''
      if (!next) {
        pendingCR = true
        continue
      }
      if (next === '\n') {
        out += '\r\n'
        i++
        continue
      }
      // Lone CR => treat as newline to avoid cursor-overwrite visual artifacts
      out += '\r\n'
    }

    return out
  }
}
const applyCROverwriteGuard = createCROverwriteGuard()

// 计算属性
const connectionStatus = computed(() => ({
  text: isConnected.value ? t('terminal.connected') : t('terminal.disconnected'),
  severity: isConnected.value ? 'success' : 'danger',
  icon: isConnected.value ? 'pi-check-circle' : 'pi-times-circle'
}))

const calculateUptime = (created: string) => {
  const now = new Date()
  const createdDate = new Date(created)
  const diffMs = now.getTime() - createdDate.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

const terminalStats = computed(() => ({
  uptime: terminal.value ? calculateUptime(terminal.value.created) : '0m'
}))

const sessionModeBadgeText = computed(() => {
  if (sessionMode.value.sessionKind === 'remote') return t('terminal.sessionRemote')
  return t('terminal.sessionLocal')
})

// 是否允许前端写入终端输入（实验性设置）/ Whether frontend is allowed to send terminal input (experimental setting)
const canSendTerminalInput = computed(() => {
  const enableUserControl = settingsStore.configData?.terminal?.enableUserControl
  // 默认只读（仅禁用输入），终止终端仍允许 / Default is read-only (input disabled only); termination is still allowed
  return enableUserControl === true
})

// Wait for browser fonts to settle before xterm measures character size.
// Fixes the “refresh then large character spacing” issue caused by late font loading /
// 等待浏览器字体稳定后再让 xterm 测量字符尺寸。
// 解决“刷新后字符间距变大”的问题：通常是字体晚加载导致 xterm 误测 cell 宽度
const waitForFontsReady = async (timeoutMs = 800) => {
  try {
    const fonts = (document as any).fonts as FontFaceSet | undefined
    if (fonts && fonts.ready && typeof (fonts.ready as any).then === 'function') {
      await Promise.race([fonts.ready as unknown as Promise<void>, new Promise<void>((r) => setTimeout(r, timeoutMs))])
      return
    }
  } catch {
    // ignore
  }
  // Fallback: wait a couple of frames to let layout settle / 回退：等待两帧让布局稳定
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

// Wait for two animation frames (layout + style settle) /
// 等两帧（让布局与样式稳定）
const waitForRaf2 = async () => {
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

// Force xterm to re-measure char size and notify renderer (private API best-effort) /
// 强制 xterm 重新测量字符尺寸并通知渲染器（尽力而为的私有 API）
const forceXtermCharMeasure = (targetTerm: Terminal) => {
  try {
    const core = (targetTerm as any)?._core
    core?._charSizeService?.measure?.()
    core?._renderService?.handleCharSizeChanged?.()
  } catch {
    // ignore / 忽略
  }
}

// Get DOM renderer's injected letter-spacing (px) on .xterm-rows /
// 读取 DOM renderer 写入到 .xterm-rows 的行内 letter-spacing（单位 px）
const getDomRendererLetterSpacingPx = (targetTerm: Terminal) => {
  try {
    const rows = targetTerm.element?.querySelector('.xterm-rows') as HTMLElement | null
    const raw = rows?.style?.letterSpacing || ''
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

// Fix the "characters spaced out" issue in DOM renderer by re-measuring when needed /
// 通过必要时重测字符尺寸，修复 DOM renderer 的“字符被拉开”问题
const stabilizeDomRendererSpacing = async (targetTerm: Terminal) => {
  const maxAttempts = 6
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForRaf2()
    const spacing = getDomRendererLetterSpacingPx(targetTerm)
    if (spacing <= 1) return
    forceXtermCharMeasure(targetTerm)
    targetTerm.refresh(0, Math.max(0, targetTerm.rows - 1))
  }
}

// Preload font by touching it in the DOM / 通过DOM触发字体加载（尤其是 @font-face 场景）
const preloadTerminalFont = (fontFamily: string, fontSizePx: number) => {
  try {
    const span = document.createElement('span')
    span.textContent = 'mmmmmmmmmm'
    span.style.position = 'fixed'
    span.style.left = '-9999px'
    span.style.top = '0'
    span.style.visibility = 'hidden'
    span.style.fontFamily = fontFamily
    span.style.fontSize = `${fontSizePx}px`
    document.body.appendChild(span)
    requestAnimationFrame(() => {
      try {
        span.remove()
      } catch {
        // ignore
      }
    })
  } catch {
    // ignore
  }
}

// 初始化终端
const setupTerminal = () => {
  try {
    // Default to VS Code Windows-like stack to avoid font flip before config loads /
    // 默认使用接近 VS Code Windows 的字体栈，避免配置未加载时字体来回切换
    const defaultFontFamily = 'Consolas, \"Courier New\", monospace'
    const vscodeFontFamily = settingsStore.configData?.terminal?.fontFamily || defaultFontFamily
    const vscodeFontSize = Number(settingsStore.configData?.terminal?.fontSize || 14)
    preloadTerminalFont(vscodeFontFamily, Number.isFinite(vscodeFontSize) ? vscodeFontSize : 14)
    term = new Terminal({
      cursorBlink: true,
      fontFamily: vscodeFontFamily,
      fontSize: Number.isFinite(vscodeFontSize) ? vscodeFontSize : 14,
      // VS Code defaults: lineHeight 1, letterSpacing 0 / VS Code 默认：行高 1，字距 0
      lineHeight: 1,
      letterSpacing: 0,
      theme: {
        background: '#000000',
        foreground: '#ffffff',
        cursor: '#ffffff',
        selectionBackground: '#ffffff40'
      },
      convertEol: true,
      rows: 24,
      cols: 80
    })

    // 添加FitAddon
    fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    // 获取容器并打开终端 / Get container and open xterm
    nextTick(() => {
      const container = document.getElementById('terminal-container')
      if (container && term) {
        // Mount into inner host when available to apply VS Code-like wrapper styles /
        // 优先挂载到内部 host，以便套用类 VS Code wrapper 样式
        void (async () => {
          const host = container.querySelector('.cti-xterm-host') as HTMLElement | null

          // Wait for fonts/layout before open+fit to avoid wrong cell width /
          // 在 open+fit 前等待字体/布局稳定，避免 cell 宽度误测
          await waitForFontsReady()
          term.open(host || container)

          // Prefer VS Code-like GPU renderer to avoid DOM renderer spacing issues /
          // 优先使用 VS Code 类似的 GPU 渲染器，避免 DOM 渲染的字距问题
          try {
            const webglAddon = new WebglAddon()
            webglAddon.onContextLoss(() => {
              try {
                webglAddon.dispose()
              } catch {
                // ignore / 忽略
              }
            })
            term.loadAddon(webglAddon)
            console.log('WebglAddon loaded')
          } catch (error) {
            console.warn('WebglAddon failed, fallback to DOM renderer:', error)
          }

          // Stabilize DOM renderer spacing (xterm may inject huge letter-spacing when char width is mis-measured) /
          // 稳定 DOM renderer 的字距（xterm 在字符宽度误测时会写入巨大的 letter-spacing）
          await stabilizeDomRendererSpacing(term)

          // Fit AFTER fonts ready / 字体就绪后再 fit
          try {
            await waitForFontsReady()
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
            fitAddon?.fit()
            term.refresh(0, term.rows - 1)
          } catch (error) {
            console.warn('Failed to fit terminal after fonts ready:', error)
          }

          // Re-fit once all fonts finish loading (covers slow @font-face) /
          // 字体最终完成加载后再兜底适配一次（覆盖慢速 @font-face）
          try {
            const fonts = (document as any).fonts as FontFaceSet | undefined
            fonts?.ready
              ?.then(() => {
                try {
                  fitAddon?.fit()
                  term.refresh(0, term.rows - 1)
                } catch (e) {
                  console.warn('Font-ready refit failed:', e)
                }
              })
              .catch(() => {})
          } catch {
            // ignore
          }
        })()

        // VS Code-like clipboard shortcuts / 类 VS Code 的剪贴板快捷键
        // - Ctrl+Shift+C: copy selection
        // - Ctrl+Shift+V: paste clipboard
        term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
          try {
            const isCtrlOrCmd = event.ctrlKey || event.metaKey
            if (!isCtrlOrCmd || !event.shiftKey) {
              return true
            }

            const key = (event.key || '').toLowerCase()
            if (key === 'c') {
              if (term?.hasSelection()) {
                const selectedText = term.getSelection()
                if (selectedText) {
                  void (async () => {
                    try {
                      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                        await navigator.clipboard.writeText(selectedText)
                      }
                    } catch (error) {
                      console.warn('Copy failed:', error)
                    }
                  })()
                }
              }
              event.preventDefault()
              return false
            }

            if (key === 'v') {
              void (async () => {
                try {
                  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
                    const text = await navigator.clipboard.readText()
                    if (text) {
                      term?.paste(text)
                    }
                  }
                } catch (error) {
                  console.warn('Paste failed:', error)
                }
              })()
              event.preventDefault()
              return false
            }
          } catch (error) {
            console.warn('Custom key handler error:', error)
          }
          return true
        })

        // 监听窗口大小变化 / Listen for window resize
        window.addEventListener('resize', () => {
          if (!term || !fitAddon) return
          void (async () => {
            await waitForRaf2()
            fitAddon.fit()
            // Force char re-measure on resize to avoid spacing glitches / resize 时强制重测字符尺寸，避免字距异常
            forceXtermCharMeasure(term)
            term.refresh(0, Math.max(0, term.rows - 1))
            await stabilizeDomRendererSpacing(term)
          })()
        })
      }
    })

    console.log('Terminal initialized successfully')
  } catch (error) {
    console.error('Failed to setup terminal:', error)
  }
}

// WebSocket连接 / WebSocket connection
const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // Connect to backend port 1106 with /ws endpoint, not frontend port 1107 / 连接到后端端口1106的/ws端点，而不是前端端口1107
  const wsUrl = `${protocol}//localhost:1106/ws`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('WebSocket connected')
    isConnected.value = true
  }

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    handleWebSocketMessage(message)
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    isConnected.value = false
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected')
    isConnected.value = false
  }
}

// 处理WebSocket消息
const handleWebSocketMessage = (message: any) => {
  if (message.terminalId !== terminalId) return
  
  switch (message.type) {
    case 'output':
      if (term) {
        void writeQueue.enqueue(
          () =>
            new Promise<void>((resolve) => {
              try {
                const safe = applyCROverwriteGuard(String(message.data ?? ''))
                term!.write(safe, resolve)
              } catch {
                resolve()
              }
            })
        )
      }
      break
    case 'session_mode':
      // 仅用于 UI 展示，不影响输入路由（后端会话栈已保证输入发往当前活跃层） /
      // UI display only; input routing is handled by backend session stack.
      try {
        const info = message.info || {}
        const kind = info.sessionKind === 'remote' ? 'remote' : 'local'
        sessionMode.value = {
          sessionKind: kind,
          remoteDestination: typeof info.remoteDestination === 'string' ? info.remoteDestination : null,
          sessionStackDepth: Number.isFinite(Number(info.sessionStackDepth)) ? Number(info.sessionStackDepth) : 1
        }
      } catch {
        // ignore / 忽略
      }
      break
    case 'exit':
      if (term) {
        void writeQueue.enqueue(
          () =>
            new Promise<void>((resolve) => {
              try {
                term!.write('\r\n\x1b[31m[Terminal Exited]\x1b[0m\r\n', resolve)
              } catch {
                resolve()
              }
            })
        )
      }
      break
  }
}

// 获取终端信息 / Fetch terminal details
const fetchTerminalDetails = async () => {
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.get(terminalId)
    if (!response.ok) {
      throw new Error(`Terminal not found (${response.status})`)
    }
    const data = await response.json()
    terminal.value = data
  } catch (error) {
    console.error('Failed to fetch terminal details:', error)
  } finally {
    isLoading.value = false
  }
}

// 加载终端历史输出
// 加载终端历史输出 / Load terminal historical output
let currentCursor = 0
const loadTerminalOutput = async () => {
  try {
    console.log('Loading terminal output for:', terminalId)
    // Use dynamic API service with explicit options object to ensure correct query parameters
    // 使用带有显式选项对象的动态 API 服务，确保查询参数正确传递
    const response = await terminalApi.readOutput(terminalId, {
      since: currentCursor,
      mode: 'full'
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Failed to load output:', errorText)
      throw new Error('Failed to load output')
    }

    const data = await response.json()
    console.log('Output data:', data)

    if (data.output && term) {
      await writeQueue.enqueue(
        () =>
          new Promise<void>((resolve) => {
            try {
              term.write(data.output, resolve)
            } catch {
              resolve()
            }
          })
      )
      console.log('Wrote output to terminal')
    } else {
      console.log('No output to display')
    }

    currentCursor = data.cursor || data.since || 0
    console.log('Current cursor:', currentCursor)
  } catch (error) {
    console.error('Failed to load terminal output:', error)
  }
}
// 发送命令
// 发送命令 / Send command
const sendCommand = async (command: string) => {
  // 只读模式下直接丢弃命令，不调用后端 / Drop commands in read-only mode without calling backend
  if (!canSendTerminalInput.value) {
    return
  }
  if (!command.trim() || !ws || ws.readyState !== WebSocket.OPEN) return

  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.writeInput(terminalId, command)

    if (!response.ok) {
      throw new Error(`Failed to send command (${response.status})`)
    }
  } catch (error) {
    console.error('Failed to send command:', error)
  }
}

// 快捷操作：中断/退出远端/ssh断开（允许只读模式使用，以便紧急中断） /
// Quick actions: interrupt/exit-remote/ssh-disconnect (allowed in read-only mode for emergency control)
const sendRawToBackend = async (raw: string) => {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  try {
    await terminalApi.writeInput(terminalId, raw, false)
  } catch (e) {
    console.error('Failed to send raw input:', e)
  }
}

const interruptRemoteForeground = async () => {
  await sendRawToBackend('\u0003') // Ctrl+C
}

const exitRemoteShell = async () => {
  await sendRawToBackend('\u0004') // Ctrl+D
}

const disconnectSsh = async () => {
  await sendRawToBackend('\r~.\r') // ssh escape: ~.
}
// 终端输入处理
const handleTerminalData = (data: string) => {
  sendCommand(data)
}

// 清空终端
const clearTerminal = () => {
  if (!canSendTerminalInput.value) {
    console.warn('Clear terminal is disabled in read-only mode')
    return
  }
  if (term) {
    term.clear()
  }
}

// 终止终端 / Kill terminal
const killTerminal = async () => {
  // 终止终端允许在只读模式下执行 / Termination is allowed even in read-only mode
  try {
    // Use dynamic API service / 使用动态API服务
    const response = await terminalApi.delete(terminalId)
    
    if (response.ok) {
      router.push('/')
    } else {
      throw new Error('Failed to kill terminal')
    }
  } catch (error) {
    console.error('Failed to kill terminal:', error)
  }
}

// 重新连接
const reconnect = () => {
  if (ws) {
    ws.close()
  }
  connectWebSocket()
}

// 切换全屏
const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
  nextTick(() => {
    fitAddon?.fit()
  })
}

onMounted(async () => {
  try {
    // Initialize API service first / 首先初始化API服务
    await initializeApiService()
    console.log('API service initialized, fetching terminal details...')
    await fetchTerminalDetails()
    setupTerminal()
    // 先加载历史输出，再连接 WS，避免“提示符/实时输出”穿插到历史大输出中间 /
    // Load history first, then connect WS to avoid interleaving prompt/live output into big historical outputs
    await loadTerminalOutput() // 加载历史输出 / Load historical output
    connectWebSocket()

    // 设置终端数据处理器 / Set terminal data handler
    if (term) {
      term.onData(handleTerminalData)
    }
  } catch (error) {
    console.error('Failed to initialize API service:', error)
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
  if (term) {
    term.dispose()
  }
})
</script>

<template>
  <div class="terminal-container" :class="{ 'fullscreen': isFullscreen }">
    <!-- 顶部控制栏 -->
    <header class="terminal-header">
      <div class="header-left">
        <Button
          variant="secondary"
          size="sm"
          class="back-btn"
          @click="$router.push('/')"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {{ t('terminal.backToList') }}
        </Button>
        <div class="terminal-title">
          <span class="terminal-icon">💻</span>
          <span class="terminal-name">Terminal {{ terminalId.substring(0, 8) }}</span>
          <Badge
            :variant="connectionStatus.severity === 'success' ? 'default' : 'destructive'"
            class="connection-badge"
          >
            {{ connectionStatus.text }}
          </Badge>
          <Badge
            variant="secondary"
            class="connection-badge"
            :title="sessionMode.sessionKind === 'remote' && sessionMode.remoteDestination ? sessionMode.remoteDestination : ''"
          >
            {{ sessionModeBadgeText }}
          </Badge>
        </div>
      </div>
      
      <div class="header-right">
        <div class="terminal-stats">
          <span class="stat-item">
            <i class="pi pi-clock"></i>
            {{ terminalStats.uptime }}
          </span>
        </div>
        
        <div class="control-buttons">
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="interruptRemoteForeground"
            :title="t('terminal.interrupt')"
          >
            <span class="font-mono text-xs">^C</span>
          </Button>
          <Button
            v-if="sessionMode.sessionKind === 'remote'"
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="exitRemoteShell"
            :title="t('terminal.exitRemoteShell')"
          >
            <span class="font-mono text-xs">^D</span>
          </Button>
          <Button
            v-if="sessionMode.sessionKind === 'remote'"
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="disconnectSsh"
            :title="t('terminal.disconnectSsh')"
          >
            <span class="font-mono text-xs">~.</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="clearTerminal"
            title="清空终端"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="reconnect"
            :disabled="isConnected"
            title="重新连接"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            class="control-btn"
            @click="killTerminal"
            title="终止终端"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            class="control-btn"
            @click="toggleFullscreen"
            :title="isFullscreen ? '退出全屏' : '全屏'"
          >
            <svg v-if="isFullscreen" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </Button>
        </div>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="terminal-main">
      <!-- 加载状态 -->
      <div v-if="isLoading" class="loading-container">
        <div class="loading-content">
          <div class="loading-spinner">
            <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <p class="loading-text">{{ t('common.loading') }}</p>
        </div>
      </div>

      <!-- 终端界面 -->
      <div v-else class="terminal-interface">
        <!-- 侧边信息面板 -->
        <aside class="info-panel" :class="{ 'collapsed': isFullscreen }">
          <Card class="info-card">
            <CardHeader>
              <CardTitle>
                <div class="panel-title">
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ t('terminal.terminalInfo') }}
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div class="info-content">
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-hashtag"></i>
                    {{ t('home.pid') }}
                  </span>
                  <span class="info-value">{{ terminal?.pid || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-desktop"></i>
                    {{ t('home.shell') }}
                  </span>
                  <span class="info-value">{{ terminal?.shell || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-folder"></i>
                    {{ t('home.directory') }}
                  </span>
                  <span class="info-value">{{ terminal?.cwd || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-clock"></i>
                    {{ t('home.created') }}
                  </span>
                  <span class="info-value">{{ new Date(terminal?.created).toLocaleString() }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">
                    <i class="pi pi-check-circle"></i>
                    {{ t('home.status') }}
                  </span>
                  <Badge
                    :variant="terminal?.status === 'active' ? 'default' : 'secondary'"
                  >
                    {{ terminal?.status }}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <!-- 终端输出区域 -->
        <section class="terminal-output-section">
          <div class="terminal-window">
            <!-- 终端标题栏 -->
            <div class="terminal-titlebar">
              <div class="window-controls">
                <span class="control control-close"></span>
                <span class="control control-minimize"></span>
                <span class="control control-maximize"></span>
              </div>
              <div class="window-title">
                <i :class="connectionStatus.icon"></i>
                {{ connectionStatus.text }} - {{ terminalId.substring(0, 8) }}
              </div>
              <div class="window-actions">
                <span class="action-item">{{ terminalStats.uptime }}</span>
              </div>
            </div>

            <!-- 终端容器 -->
            <div id="terminal-container" class="terminal-container-wrapper cti-vscode-terminal">
              <div class="monaco-workbench w-full h-full">
                <div class="pane-body integrated-terminal w-full h-full">
                  <div class="terminal-wrapper">
                    <div class="cti-xterm-host w-full h-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.terminal-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1a1a1a;
  color: #ffffff;
}

.terminal-container.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.terminal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  min-height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  background: #404040 !important;
  border: 1px solid #555 !important;
  color: #fff !important;
}

.back-btn:hover {
  background: #555 !important;
}

.terminal-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.terminal-icon {
  font-size: 1.2rem;
}

.terminal-name {
  font-weight: 600;
  color: #fff;
}

.connection-badge {
  font-size: 0.75rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.terminal-stats {
  display: flex;
  gap: 1rem;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ccc;
  font-size: 0.9rem;
}

.control-buttons {
  display: flex;
  gap: 0.5rem;
}

.control-btn {
  background: #404040 !important;
  border: 1px solid #555 !important;
  color: #fff !important;
  width: 36px !important;
  height: 36px !important;
}

.control-btn:hover {
  background: #555 !important;
}

.terminal-main {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.loading-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.loading-text {
  color: #ccc;
}

.terminal-interface {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.info-panel {
  width: 300px;
  background: #252525;
  border-right: 1px solid #404040;
  transition: margin-left 0.3s ease;
}

.info-panel.collapsed {
  margin-left: -300px;
}

.info-card {
  margin: 1rem;
  background: #2d2d2d !important;
  border: 1px solid #404040 !important;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
}

.info-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #ccc;
  font-size: 0.9rem;
}

.info-value {
  color: #fff;
  font-size: 0.9rem;
  font-family: monospace;
}

.terminal-output-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
}

.terminal-window {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #000000;
  border: 1px solid #404040;
  border-radius: 8px;
  overflow: hidden;
}

.terminal-titlebar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
}

.window-controls {
  display: flex;
  gap: 0.5rem;
}

.control {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.control-close {
  background: #ff5f56;
}

.control-minimize {
  background: #ffbd2e;
}

.control-maximize {
  background: #27c93f;
}

.window-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #fff;
  font-size: 0.9rem;
}

.window-actions {
  display: flex;
  align-items: center;
}

.action-item {
  color: #ccc;
  font-size: 0.8rem;
}

.terminal-container-wrapper {
  flex: 1;
  padding: 1rem;
  background: #000000;
}

/* xterm.js terminal styles aligned with 1Panel (visual only) / 对齐 1Panel 风格的 xterm.js 终端样式（仅视觉，不改字体度量） */
:deep(.xterm) {
  height: 100% !important;
  background: #000000 !important;
  color: #ffffff !important;
}

:deep(.xterm-viewport),
:deep(.xterm-screen) {
  background: #000000 !important;
}
</style>
