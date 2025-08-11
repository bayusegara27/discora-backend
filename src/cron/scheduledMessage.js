const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const MESSAGES_COLLECTION = config.APPWRITE.COLLECTIONS.SCHEDULED_MESSAGES;

/**
 * Checks for and sends scheduled messages that are due.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processScheduledMessages(client) {
    const nowISO = new Date().toISOString();
    try {
        const { documents } = await databases.listDocuments(DB_ID, MESSAGES_COLLECTION, [
            Query.equal('status', 'pending'),
            Query.lessThanEqual('nextRun', nowISO)
        ]);
        
        if (documents.length > 0) {
            console.log(`[CRON: ScheduledMsg] Found ${documents.length} message(s) to send.`);
        }

        for (const msg of documents) {
            try {
                const channel = await client.channels.fetch(msg.channelId);
                if (!channel || !channel.isTextBased()) {
                    throw new Error(`Channel ${msg.channelId} not found or is not a text-based channel.`);
                }
                
                await channel.send(msg.content);
                console.log(`[CRON: ScheduledMsg] Sent message ${msg.$id} to #${channel.name} in guild ${channel.guild.name}.`);

                const now = new Date();
                const updates = { lastRun: now.toISOString(), status: 'sent' };

                if (msg.repeat !== 'none') {
                    let nextRunDate = new Date(msg.nextRun);
                    
                    // If the scheduled run time was missed (i.e., it's in the past),
                    // calculate the next valid run time in the future to prevent spamming.
                    while (nextRunDate <= now) {
                        if (msg.repeat === 'daily') {
                            nextRunDate.setDate(nextRunDate.getDate() + 1);
                        } else if (msg.repeat === 'weekly') {
                            nextRunDate.setDate(nextRunDate.getDate() + 7);
                        } else if (msg.repeat === 'monthly') {
                            // This can be tricky with end-of-month dates, but is generally acceptable
                            nextRunDate.setMonth(nextRunDate.getMonth() + 1);
                        } else {
                            break; // Safeguard for unknown repeat values
                        }
                    }

                    updates.nextRun = nextRunDate.toISOString();
                    updates.status = 'pending'; // Reschedule it for the future
                    console.log(`[CRON: ScheduledMsg] Rescheduled message ${msg.$id} for ${updates.nextRun}.`);
                }
                
                await databases.updateDocument(DB_ID, MESSAGES_COLLECTION, msg.$id, updates);
            } catch (e) {
                console.error(`[CRON: ScheduledMsg] Failed to send message ${msg.$id} to channel ${msg.channelId}:`, e.message);
                await databases.updateDocument(DB_ID, MESSAGES_COLLECTION, msg.$id, { status: 'error' });
            }
        }
    } catch (error) {
        console.error("[CRON: ScheduledMsg] Error fetching scheduled messages:", error);
    }
}

module.exports = processScheduledMessages;
