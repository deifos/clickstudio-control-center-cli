import {
  CodeAuth,
  CodeNotFound,
  CodeForbidden,
  CodeRateLimit,
  CodeNetwork,
  CodeAPI,
  CodeUsage,
  exitCodeFor,
} from './codes.js';

export class CLIError extends Error {
  public readonly code: string;
  public readonly hint?: string;
  public readonly exitCode: number;

  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = 'CLIError';
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCodeFor(code);
  }
}

export function errAuth(message = 'Not authenticated'): CLIError {
  return new CLIError(CodeAuth, message, 'Run: ccctl auth login --token ccs_...');
}

export function errNotFound(resource: string, id: string): CLIError {
  return new CLIError(CodeNotFound, `${resource} "${id}" not found`);
}

export function errForbidden(message = 'Access denied', hint?: string): CLIError {
  return new CLIError(CodeForbidden, message, hint ?? 'Token is missing the required scope');
}

export function errRateLimit(): CLIError {
  return new CLIError(CodeRateLimit, 'Rate limit exceeded', 'Wait a moment and try again');
}

export function errNetwork(cause?: Error): CLIError {
  const message = cause?.message
    ? `Network error: ${cause.message}`
    : 'Could not connect to Click Studio';
  return new CLIError(CodeNetwork, message, 'Check your --base-url and internet connection');
}

export function errAPI(status: number, message: string): CLIError {
  return new CLIError(CodeAPI, `API error (${status}): ${message}`);
}

export function errUsage(message: string, hint?: string): CLIError {
  return new CLIError(CodeUsage, message, hint);
}

// DryRunPreview is not really an error — it's a control-flow signal that
// short-circuits a write before it hits the API. The CLI runner catches it,
// renders the would-have-been request as a successful response, and exits 0.
// Throwing-up-the-stack is cleaner than threading "preview mode" callbacks
// through every command, since only the client knows the final URL/body.
export class DryRunPreview extends Error {
  constructor(
    public readonly method: string,
    public readonly url: string,
    public readonly body: unknown,
  ) {
    super(`DRY RUN: ${method} ${url}`);
    this.name = 'DryRunPreview';
  }
}
