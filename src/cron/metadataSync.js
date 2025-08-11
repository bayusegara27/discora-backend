const { databases, Query, ID } = require('../services/appwrite');
const { ChannelType } = require('discord.js');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const METADATA_COLLECTION = config.APPWRITE.COLLECTIONS.SERVER_METADATA;

/**
 * Periodically syncs server metadata (channels, roles) with the database.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function syncServerMetadata(client) {
    console.log(`[CRON: MetadataSync] Starting metadata sync for ${client.guilds.cache.size} guilds.`);
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.channels.fetch();
            await guild.roles.fetch();

            const channels = guild.channels.cache
                .filter(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
                .map(c => ({ id: c.id, name: c.name }))
                .sort((a, b) => a.name.localeCompare(b.name));

            const roles = guild.roles.cache
                .filter(r => r.name !== '@everyone')
                .map(r => ({ id: r.id, name: r.name, color: r.color }))
                .sort((a, b) => b.position - a.position);

            const newMetadataString = JSON.stringify({ channels, roles });

            const existing = await databases.listDocuments(DB_ID, METADATA_COLLECTION, [Query.equal('guildId', guild.id)]);

            if (existing.documents.length === 0) {
                await databases.createDocument(DB_ID, METADATA_COLLECTION, ID.unique(), { guildId: guild.id, data: newMetadataString });
            } else {
                // Only update if data has actually changed to reduce DB writes
                if (existing.documents[0].data !== newMetadataString) {
                    await databases.updateDocument(DB_ID, METADATA_COLLECTION, existing.documents[0].$id, { data: newMetadataString });
                }
            }
        } catch (error) {
            console.error(`[CRON: MetadataSync] Failed to sync metadata for guild ${guild.name} (${guild.id}):`, error.message);
        }
    }
    console.log(`[CRON: MetadataSync] Finished metadata sync.`);
}

module.exports = syncServerMetadata;
