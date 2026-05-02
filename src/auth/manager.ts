import { loadCredentials, clearCredentials, maskToken, type Credentials } from '../config/credentials.js';

export class AuthManager {
  private credentials: Credentials | null = null;
  private loaded = false;

  resolveToken(): string | null {
    const creds = this.getCredentials();
    return creds?.token ?? null;
  }

  isAuthenticated(): boolean {
    return this.resolveToken() !== null;
  }

  getCredentials(): Credentials | null {
    if (!this.loaded) {
      this.credentials = loadCredentials();
      this.loaded = true;
    }
    return this.credentials;
  }

  getTokenPreview(): string | null {
    const creds = this.getCredentials();
    if (!creds) return null;
    return maskToken(creds.token);
  }

  getSource(): 'env' | 'file' | null {
    if (process.env['CLICKSTUDIO_AGENT_TOKEN'] || process.env['CCCTL_TOKEN']) return 'env';
    const creds = this.getCredentials();
    if (creds) return 'file';
    return null;
  }

  logout(): void {
    clearCredentials();
    this.credentials = null;
    this.loaded = false;
  }
}
