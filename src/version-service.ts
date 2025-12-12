import fs from 'fs';
import path from 'path';

/**
 * 版本检查服务
 * Version check service
 *
 * - 读取本地 VERSION 文件作为当前版本
 *   Read local VERSION file as current version
 * - 启动时拉取 GitHub 上的 VERSION 并比较
 *   Fetch GitHub VERSION on startup and compare
 */
export class VersionService {
  private readonly versionFilePath: string;
  private readonly remoteVersionUrl: string;

  private currentVersion: string | null = null;
  private latestVersion: string | null = null;
  private updateAvailable = false;
  private lastCheckedAt: string | null = null;
  private lastError: string | null = null;

  constructor(options?: { versionFilePath?: string; remoteVersionUrl?: string }) {
    this.versionFilePath = options?.versionFilePath ?? path.join(process.cwd(), 'VERSION');
    this.remoteVersionUrl =
      options?.remoteVersionUrl ??
      'https://raw.githubusercontent.com/cheestard/cheestard-terminal-interactive/refs/heads/main/VERSION';
  }

  /**
   * 读取本地版本
   * Read local version
   */
  readLocalVersion(): string {
    if (this.currentVersion) {
      return this.currentVersion;
    }

    try {
      const raw = fs.readFileSync(this.versionFilePath, 'utf8');
      const version = raw.trim();
      this.currentVersion = version || '0.0.0';
    } catch (error) {
      this.currentVersion = '0.0.0';
      this.lastError = error instanceof Error ? error.message : String(error);
    }

    return this.currentVersion;
  }

  /**
   * 拉取远端版本并比较
   * Fetch remote version and compare
   */
  async refreshRemoteVersion(options?: { timeoutMs?: number }): Promise<void> {
    const current = this.readLocalVersion();

    const timeoutMs = options?.timeoutMs ?? 4000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.remoteVersionUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          // Avoid cached/stale response where possible / 尽量避免缓存导致的旧版本
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch remote VERSION: ${response.status}`);
      }

      const remoteRaw = (await response.text()).trim();
      this.latestVersion = remoteRaw || null;

      this.updateAvailable =
        Boolean(this.latestVersion) && this.compareVersions(this.latestVersion!, current) > 0;

      this.lastError = null;
    } catch (error) {
      this.latestVersion = null;
      this.updateAvailable = false;
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timeout);
      this.lastCheckedAt = new Date().toISOString();
    }
  }

  /**
   * 获取版本信息（用于 API 返回）
   * Get version info (for API response)
   */
  getInfo(): {
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    lastCheckedAt: string | null;
    remoteVersionUrl: string;
    error: string | null;
  } {
    return {
      currentVersion: this.readLocalVersion(),
      latestVersion: this.latestVersion,
      updateAvailable: this.updateAvailable,
      lastCheckedAt: this.lastCheckedAt,
      remoteVersionUrl: this.remoteVersionUrl,
      error: this.lastError
    };
  }

  /**
   * 版本比较（简化语义版本）
   * Version compare (simplified semver)
   *
   * @returns 1 表示 a > b，-1 表示 a < b，0 表示相等
   *          1 means a > b, -1 means a < b, 0 means equal
   */
  private compareVersions(a: string, b: string): number {
    const aParts = this.toVersionParts(a);
    const bParts = this.toVersionParts(b);
    const maxLen = Math.max(aParts.length, bParts.length);

    for (let i = 0; i < maxLen; i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }

    return 0;
  }

  private toVersionParts(version: string): number[] {
    const normalized = (version || '').trim();
    if (!normalized) {
      return [0];
    }

    // Extract numeric segments only / 只提取数字段
    return normalized
      .split('.')
      .map((part) => {
        const match = part.match(/\d+/);
        return match ? Number(match[0]) : 0;
      });
  }
}

