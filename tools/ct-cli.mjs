#!/usr/bin/env node
import { spawn } from 'child_process';

/**
 * 轻量级 ct 启动器（仅覆盖本项目脚本需要的子集）
 * Lightweight "ct" starter (implements the minimal subset needed by this repo scripts)
 *
 * 支持：ct start -- <command...>
 * Supports: ct start -- <command...>
 */

function printUsageAndExit(code = 1) {
  // 终端输出只需英文 / Terminal output in English only
  process.stderr.write('Usage: ct start -- <command...>\n');
  process.exit(code);
}

const args = process.argv.slice(2);
const sub = args[0];

if (!sub) {
  printUsageAndExit(1);
}

if (sub !== 'start') {
  process.stderr.write(`Unsupported ct subcommand: ${sub}\n`);
  printUsageAndExit(1);
}

const dashIndex = args.indexOf('--');
if (dashIndex < 0 || dashIndex === args.length - 1) {
  printUsageAndExit(1);
}

const cmd = args[dashIndex + 1];
const cmdArgs = args.slice(dashIndex + 2);

if (!cmd) {
  printUsageAndExit(1);
}

try {
  const child = spawn(cmd, cmdArgs, {
    cwd: process.cwd(),
    env: process.env,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
  process.stdout.write(`Started: ${cmd} ${cmdArgs.join(' ')} (pid ${child.pid})\n`);
  process.exit(0);
} catch (error) {
  process.stderr.write(`Failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

