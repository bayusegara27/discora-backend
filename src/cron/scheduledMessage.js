const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const MESSAGES_COLLECTION = config.APPWRITE.COLLECTIONS.SCHEDULED_MESSAGES;

/**
 * Checks for and sends scheduled messages that are due.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processScheduledMessages(client) {
    const now = new Date().toISOString();
    try {
        const { documents } = await databases.listDocuments(DB_ID, MESSAGES_COLLECTION, [
            Query.equal('status', 'pending'),
            Query.lessThanEqual('nextRun', now)
        ]);
        
        for (const msg of documents) {
            try {
                const channel = await client.channels.fetch(msg.channelId);
                await channel.send(msg.content);

                const updates = { lastRun: now, status: 'sent' };

                if (msg.repeat !== 'none') {
                    const nextRunDate = new Date(msg.nextRun);
                    if (msg.repeat === 'daily') nextRunDate.setDate(nextRunDate.getDate() + 1);
                    else if (msg.repeat === 'weekly') nextRunDate.setDate(nextRunDate.getDate() + 7);
                    else if (msg.repeat === 'monthly') nextRunDate.setMonth(nextRunDate.getMonth() + 1);
                    
                    updates.nextRun = nextRunDate.toISOString();
                    updates.status = 'pending'; // Reschedule it
                }
                
                await databases.updateDocument(DB_ID, MESSAGES_COLLECTION, msg.$id, updates);
            } catch (e) {
                console.error(`Failed to send scheduled message ${msg.$id}:`, e);
                await databases.updateDocument(DB_ID, MESSAGES_COLLECTION, msg.$id, { status: 'error' });
            }
        }
    } catch (error) {
        console.error("Error fetching scheduled messages:", error);
    }
}

module.exports = processScheduledMessages;
