const { Collection } = require('discord.js');

// In-memory cache for frequently accessed data to reduce database calls.
const guildSettings = new Collection();
const guildCustomCommands = new Collection();
const xpCooldowns = new Collection();

module.exports = {
    guildSettings,
    guildCustomCommands,
    xpCooldowns,
};
