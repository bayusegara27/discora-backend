// ============================================================================
// Discora Main Entry Point
// ============================================================================
// This file is responsible for initializing the bot, loading all event
// handlers and cron jobs, and connecting to Discord.

const { client } = require('./src/services/discord');
const config = require('./src/config');
const { initializeCronJobs } = require('./src/cron');

// --- Event Handlers ---
// Automatically register all event handlers from the 'handlers' directory.
const onReadyHandler = require('./src/handlers/ready');
const onMessageCreateHandler = require('./src/handlers/messageCreate');
const onGuildMemberAddHandler = require('./src/handlers/guildMemberAdd');
const onGuildMemberRemoveHandler = require('./src/handlers/guildMemberRemove');
const onMessageDeleteHandler = require('./src/handlers/messageDelete');
const onReactionHandler = require('./src/handlers/messageReaction');

client.once('ready', (...args) => onReadyHandler(...args));
client.on('messageCreate', (...args) => onMessageCreateHandler(...args));
client.on('guildMemberAdd', (...args) => onGuildMemberAddHandler(...args));
client.on('guildMemberRemove', (...args) => onGuildMemberRemoveHandler(...args));
client.on('messageDelete', (...args) => onMessageDeleteHandler(...args));
client.on('messageReactionAdd', (reaction, user) => onReactionHandler(reaction, user, true));
client.on('messageReactionRemove', (reaction, user) => onReactionHandler(reaction, user, false));


// --- Initialize Cron Jobs ---
// Start all scheduled tasks for the bot.
initializeCronJobs(client);


// --- Login to Discord ---
client.login(config.BOT_TOKEN).catch(error => {
    console.error("❌ CRITICAL ERROR: Failed to login to Discord. Please check your BOT_TOKEN in 'bot/env.js'.");
    console.error(error.message);
    process.exit(1);
});