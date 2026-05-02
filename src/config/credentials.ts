import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { configDir, ensureConfigDir } from './config.js';

export interface Credentials {
  token: string;
  agentName?: string;
  organizationId?: string;
  scopes?: string[];
  createdAt: string;
}

function credentialsPath(): string {
  return join(configDir(), 'credentials.json');
}

export function loadCredentials(): Credentials | null {
  const envToken = process.env['CLICKSTUDIO_AGENT_TOKEN'] ?? process.env['CCCTL_TOKEN'];
  if (envToken) {
    return {
      token: envToken,
      createdAt: new Date().toISOString(),
    };
  }

  try {
    const raw = readFileSync(credentialsPath(), 'utf-8');
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  ensureConfigDir();
  writeFileSync(credentialsPath(), JSON.stringify(creds, null, 2) + '\n', { mode: 0o600 });
}

export function clearCredentials(): void {
  const path = credentialsPath();
  if (existsSync(path)) {
    unlinkSync(path);
  }
}

export function maskToken(token: string): string {
  if (token.length <= 16) return token.slice(0, 4) + '...';
  return token.slice(0, 12) + '...' + token.slice(-4);
}
