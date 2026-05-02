import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface Config {
  baseUrl: string;
  defaultProject?: string;
}

const DEFAULT_BASE_URL = 'https://cc.clickstudio.ai';

let baseUrlOverride: string | undefined;

export function setBaseUrlOverride(url: string): void {
  baseUrlOverride = url;
}

export function configDir(): string {
  return join(homedir(), '.config', 'clickstudio');
}

export function ensureConfigDir(): void {
  const dir = configDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function loadConfig(): Config {
  const envUrl = process.env['CCCTL_BASE_URL'] ?? process.env['CLICKSTUDIO_BASE_URL'];

  try {
    const raw = readFileSync(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      baseUrl: baseUrlOverride ?? envUrl ?? parsed.baseUrl ?? DEFAULT_BASE_URL,
      defaultProject: parsed.defaultProject,
    };
  } catch {
    return {
      baseUrl: baseUrlOverride ?? envUrl ?? DEFAULT_BASE_URL,
    };
  }
}

export function saveConfig(config: Config): void {
  ensureConfigDir();
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}
