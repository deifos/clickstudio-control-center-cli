export const ExitOK = 0;
export const ExitUsage = 1;
export const ExitNotFound = 2;
export const ExitAuth = 3;
export const ExitForbidden = 4;
export const ExitRateLimit = 5;
export const ExitNetwork = 6;
export const ExitAPI = 7;

export const CodeUsage = 'usage_error';
export const CodeNotFound = 'not_found';
export const CodeAuth = 'auth_error';
export const CodeForbidden = 'forbidden';
export const CodeRateLimit = 'rate_limit';
export const CodeNetwork = 'network_error';
export const CodeAPI = 'api_error';

const codeToExit: Record<string, number> = {
  [CodeUsage]: ExitUsage,
  [CodeNotFound]: ExitNotFound,
  [CodeAuth]: ExitAuth,
  [CodeForbidden]: ExitForbidden,
  [CodeRateLimit]: ExitRateLimit,
  [CodeNetwork]: ExitNetwork,
  [CodeAPI]: ExitAPI,
};

export function exitCodeFor(code: string): number {
  return codeToExit[code] ?? ExitAPI;
}
