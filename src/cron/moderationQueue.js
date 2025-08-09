
const { databases } = require('../services/appwrite');
const config = require('../config');
const { logAuditEvent } = require('../utils/loggers');

const DB_ID = config.APPWRITE.DATABASE_ID;
const MOD_QUEUE_COLLECTION = config.APPWRITE.COLLECTIONS.MODERATION_QUEUE;

/**
 * Processes the moderation action queue from the database.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processModerationQueue(client) {
    try {
        const { documents } = await databases.listDocuments(DB_ID, MOD_QUEUE_COLLECTION);
        if (documents.length > 0) {
            console.log(`[CRON: Moderation] Processing ${documents.length} action(s) from queue.`);
        }
        for (const action of documents) {
            try {
                const guild = await client.guilds.fetch(action.guildId);
                const member = await guild.members.fetch(action.targetUserId);
                const initiator = await guild.members.fetch(action.initiatorId);
                
                console.log(`[CRON: Moderation] Executing '${action.actionType}' on user ${action.targetUsername} in guild ${guild.name}, initiated by ${initiator.user.tag}.`);

                if (action.actionType === 'kick') {
                    await member.kick(action.reason || 'No reason provided.');
                    await logAuditEvent(action.guildId, 'USER_KICKED', initiator.user, `Kicked user ${member.user.tag}. Reason: ${action.reason || 'None'}`);
                } else if (action.actionType === 'ban') {
                    await member.ban({ reason: action.reason || 'No reason provided.' });
                    await logAuditEvent(action.guildId, 'USER_BANNED', initiator.user, `Banned user ${member.user.tag}. Reason: ${action.reason || 'None'}`);
                }

            } catch (err) {
                console.error(`[CRON: Moderation] Failed to process action ${action.$id} for user ${action.targetUsername} (${action.targetUserId}):`, err.message);
            } finally {
                // Always delete the action from the queue, whether it succeeded or failed.
                await databases.deleteDocument(DB_ID, MOD_QUEUE_COLLECTION, action.$id);
            }
        }
    } catch(e) {
        console.error("[CRON: Moderation] Error fetching moderation queue:", e.message);
    }
}

module.exports = processModerationQueue;
