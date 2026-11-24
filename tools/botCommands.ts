// Writes the Discord bot's slash commands to its application, as each deploy of the bot does (bot.yml):
//
//   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node tools/botCommands.ts
//
// The list in server/bot/commands.ts replaces whatever the application had. Without the id or the token there is no
// application to write to yet: it says so and writes nothing.

import { writeCommands } from '../server/bot/commands.ts';
import { createRest } from '../server/bot/rest.ts';

const application = process.env['DISCORD_APPLICATION_ID'] ?? '';
const token = process.env['DISCORD_BOT_TOKEN'] ?? '';
if (!application || !token) {
  console.log('::warning::no Discord application id or bot token: the slash commands were not written');
} else {
  const answer = await writeCommands(createRest({ token }), application);
  if (!answer.ok) {
    console.log(`::error::Discord refused the slash commands: ${answer.status} ${answer.message}`);
    process.exitCode = 1;
  } else {
    const written = Array.isArray(answer.json) ? answer.json.length : 0;
    console.log(`wrote ${written} slash commands to the application`);
  }
}
