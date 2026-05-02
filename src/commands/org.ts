import { Command } from 'commander';
import { brand, divider } from '../output/theme.js';
import type { OutputWriter } from '../output/writer.js';
import { requireClient } from './auth.js';

export function createOrgCommand(getWriter: () => OutputWriter): Command {
  const org = new Command('org').description('Organization info');

  org
    .command('info')
    .description('Show the organization this token belongs to')
    .action(async () => {
      const writer = getWriter();
      const client = requireClient();
      const info = await client.org();

      if (writer.isStyled()) {
        console.log();
        console.log(brand.primaryBold(info.name));
        console.log(divider(40));
        console.log(`  ${brand.label('id'.padEnd(10))} ${info.id}`);
        console.log(`  ${brand.label('slug'.padEnd(10))} ${info.slug}`);
        console.log(`  ${brand.label('members'.padEnd(10))} ${info.memberCount}`);
        console.log(`  ${brand.label('projects'.padEnd(10))} ${info.projectCount}`);
        console.log(`  ${brand.label('created'.padEnd(10))} ${info.createdAt}`);
        console.log();
      }

      writer.ok(info, {
        summary: info.name,
        breadcrumbs: [{ action: 'List projects', cmd: 'ccctl projects list' }],
      });
    });

  return org;
}
