// @ts-check

import * as path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const yarn = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
const rootDir = path.resolve(__dirname, '..', '..');

function runProcess(command: string, args: ReadonlyArray<string> = []) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env });
    child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
    child.on('error', reject);
  });
}

async function exists(subdir: string) {
  try {
    await fs.stat(path.join(rootDir, subdir));
    return true;
  } catch {
    return false;
  }
}

async function ensureNodeModules() {
  if (!(await exists('node_modules'))) {
    await runProcess(yarn);
  }
}

async function ensureCompiled() {
  if (!(await exists('out'))) {
    await runProcess(yarn, ['compile']);
  }
}

async function main() {
  await ensureNodeModules();
  await ensureCompiled();
}

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
