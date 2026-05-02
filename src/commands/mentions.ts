import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import type { OutputWriter } from '../output/writer.js';
import type { NotificationItem } from '../client.js';
import { requireClient } from './auth.js';

export function createMentionsCommand(getWriter: () => OutputWriter): Command {
  const mentions = new Command('mentions')
    .alias('notifications')
    .description("List and acknowledge mentions/notifications addressed to this agent");

  mentions
    .command('list')
    .description('List notifications for this agent (mentions, assignments)')
    .option('--unread', 'Only show unread notifications')
    .option('--limit <n>', 'Max number of notifications to return', '50')
    .action(async (opts) => {
      const writer = getWriter();
      const client = requireClient();

      const limit = parseInt(opts.limit, 10);
      const data = await client.listNotifications({ unread: !!opts.unread, limit });

      if (writer.isStyled()) {
        renderNotificationsTable(data);
      }

      writer.ok(data, {
        summary: `${data.length} notification${data.length === 1 ? '' : 's'}${opts.unread ? ' (unread)' : ''}`,
        breadcrumbs:
          data.length > 0
            ? [
                { action: 'Acknowledge one', cmd: `ccctl mentions ack ${data[0]!.id}` },
                { action: 'Acknowledge all', cmd: 'ccctl mentions ack-all' },
              ]
            : [],
      });
    });

  mentions
    .command('ack <id>')
    .description('Mark a notification as read')
    .action(async (id: string) => {
      const writer = getWriter();
      const client = requireClient();
      const updated = await client.ackNotification(id);

      if (writer.isStyled()) {
        console.log(`  ${brand.success('✓')} Acknowledged ${brand.muted(id)}`);
        console.log();
      }

      writer.ok(updated, { summary: 'Notification acknowledged' });
    });

  mentions
    .command('ack-all')
    .description('Mark all unread notifications as read')
    .action(async () => {
      const writer = getWriter();
      const client = requireClient();
      const result = await client.ackAllNotifications();

      if (writer.isStyled()) {
        console.log(
          `  ${brand.success('✓')} Acknowledged ${brand.bold(String(result.updated))} notification${result.updated === 1 ? '' : 's'}`,
        );
        console.log();
      }

      writer.ok(result, { summary: `Acknowledged ${result.updated} notification(s)` });
    });

  return mentions;
}

const TYPE_STYLES: Record<string, (s: string) => string> = {
  task_mention: brand.agent,
  task_assigned: brand.primary,
  note_mention: brand.agent,
  log_mention: brand.agent,
};

function renderNotificationsTable(notifications: NotificationItem[]): void {
  if (notifications.length === 0) {
    console.log(brand.muted('  No notifications'));
    return;
  }

  console.log();
  for (const n of notifications) {
    const styler = TYPE_STYLES[n.type] ?? brand.muted;
    const dot = n.isRead ? brand.muted('·') : brand.warning('●');
    const type = styler(n.type.padEnd(14));
    const link = n.link ? brand.muted(` ${n.link}`) : '';
    console.log(`  ${dot} ${type} ${n.message}${link}`);
    console.log(`    ${brand.muted(n.id)}  ${brand.muted(n.createdAt)}`);
  }
  console.log();
  console.log(divider(40));
  const unread = notifications.filter((n) => !n.isRead).length;
  console.log(
    `  ${brand.bold(String(notifications.length))} total · ${brand.warning(String(unread))} unread`,
  );
  console.log();
}
