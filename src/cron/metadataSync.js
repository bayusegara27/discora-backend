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

            const metadataPayload = {
                guildId: guild.id,
                data: JSON.stringify({ channels, roles })
            };

            const existing = await databases.listDocuments(DB_ID, METADATA_COLLECTION, [Query.equal('guildId', guild.id)]);

            if (existing.documents.length === 0) {
                await databases.createDocument(DB_ID, METADATA_COLLECTION, ID.unique(), metadataPayload);
            } else {
                await databases.updateDocument(DB_ID, METADATA_COLLECTION, existing.documents[0].$id, metadataPayload);
            }
        } catch (error) {
            console.error(`Failed to sync metadata for guild ${guild.name}:`, error.message);
        }
    }
}

module.exports = syncServerMetadata;
