const { databases, Query, ID } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const MEMBERS_COLLECTION = config.APPWRITE.COLLECTIONS.MEMBERS;

/**
 * Periodically syncs all members from all guilds with the database.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function syncGuildMembers(client) {
    for (const guild of client.guilds.cache.values()) {
        try {
            const members = await guild.members.fetch();
            for (const member of members.values()) {
                if (member.user.bot) continue;

                const memberData = {
                    guildId: guild.id,
                    userId: member.id,
                    username: member.user.tag,
                    userAvatarUrl: member.user.displayAvatarURL(),
                    joinedAt: member.joinedAt.toISOString()
                };

                const existing = await databases.listDocuments(DB_ID, MEMBERS_COLLECTION, [
                    Query.equal('guildId', guild.id),
                    Query.equal('userId', member.id)
                ]);

                if (existing.documents.length === 0) {
                    await databases.createDocument(DB_ID, MEMBERS_COLLECTION, ID.unique(), memberData);
                } else {
                    await databases.updateDocument(DB_ID, MEMBERS_COLLECTION, existing.documents[0].$id, memberData);
                }
            }
        } catch (error) {
            console.error(`Failed to sync members for guild ${guild.name}:`, error.message);
        }
    }
}

module.exports = syncGuildMembers;
