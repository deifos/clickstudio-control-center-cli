import chalk from 'chalk';

// Click Studio Control Center brand
// Primary: cyan (#06b6d4) — accents, commands, success
// Agent:   amber (#f59e0b) — agent identity (🤖) accents
// Error:   red — errors
// Warning: amber/yellow
// Muted:   gray

export const brand = {
  primary: chalk.hex('#06b6d4'),
  primaryBold: chalk.hex('#06b6d4').bold,

  bold: chalk.bold,
  muted: chalk.gray,
  dim: chalk.dim,

  success: chalk.hex('#22c55e'),
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.hex('#06b6d4'),
  agent: chalk.hex('#f59e0b'),

  label: chalk.bold,
  value: chalk.white,
  hint: chalk.gray.italic,
  divider: chalk.gray,
  command: chalk.hex('#06b6d4'),

  // Project state badges
  backlog: chalk.gray,
  inBuild: chalk.hex('#06b6d4'),
  live: chalk.hex('#22c55e'),
  paused: chalk.yellow,
};

export function divider(width = 50): string {
  return brand.muted('─'.repeat(width));
}

export function logo(): string {
  return `${brand.primaryBold('Click')}${brand.bold('Studio')} ${brand.muted('control-center')}`;
}

const STATE_STYLES: Record<string, (s: string) => string> = {
  Backlog: brand.backlog,
  'In Build': brand.inBuild,
  Live: brand.live,
  Paused: brand.paused,
};

export function styleState(state: string): string {
  const styler = STATE_STYLES[state] ?? brand.muted;
  return styler(state);
}
