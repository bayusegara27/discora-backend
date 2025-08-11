const { databases } = require('../services/appwrite');
const config = require('../config');
const { getOrCreateStatsDoc } = require('../utils/helpers');
const { guildCustomCommands } = require('../utils/cache');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Updates statistics for all guilds the bot is in.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function updateAllServerStats(client) {
    console.log(`[CRON: Stats] Starting server stats update for ${client.guilds.cache.size} guilds.`);
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch();
            await guild.roles.fetch();

            const statsDoc = await getOrCreateStatsDoc(guild.id);
            if (statsDoc) {
                const newStatsPayload = {
                    memberCount: guild.memberCount,
                    onlineCount: guild.members.cache.filter(m => m.presence?.status && ['online', 'dnd', 'idle'].includes(m.presence.status)).size,
                    commandCount: guildCustomCommands.get(guild.id)?.size || 0,
                    roleDistribution: JSON.stringify(
                        guild.roles.cache
                            .filter(role => role.name !== '@everyone' && role.members.size > 0)
                            .map(role => ({ name: role.name, count: role.members.size, color: role.hexColor }))
                            .sort((a, b) => b.count - a.count)
                    ),
                    // Preserve the existing messagesWeekly field to prevent it from being overwritten.
                    messagesWeekly: statsDoc.messagesWeekly || '[]'
                };

                await databases.updateDocument(DB_ID, STATS_COLLECTION, statsDoc.$id, newStatsPayload);
            }
        } catch (error) {
            console.error(`[CRON: Stats] Failed to update stats for guild ${guild.name} (${guild.id}):`, error.message);
        }
    }
    console.log(`[CRON: Stats] Finished server stats update.`);
}

module.exports = updateAllServerStats;