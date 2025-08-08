const cron = require('node-cron');

const checkYouTube = require('./youtube');
const updateAllServerStats = require('./stats');
const resetDailyStats = require('./dailyReset');
const processModerationQueue = require('./moderationQueue');
const syncGuildMembers = require('./memberSync');
const syncServerMetadata = require('./metadataSync');
const processReactionRoleQueue = require('./reactionRoleQueue');
const processScheduledMessages = require('./scheduledMessage');
const processGiveawayQueue = require('./giveawayQueue');
const { checkGiveaways } = require('./giveawayEnd');
const { databases } = require('../services/appwrite');
const config = require('../config');

/**
 * Initializes and schedules all recurring tasks for the bot.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
function initializeCronJobs(client) {
    console.log('⏰ Initializing cron jobs...');

    // Every minute
    cron.schedule('* * * * *', () => {
        checkYouTube(client);
        syncServerMetadata(client);
        processScheduledMessages(client);
        checkGiveaways(client);
    });

    // Every 15 seconds
    cron.schedule('*/15 * * * * *', () => {
        processReactionRoleQueue(client);
        processGiveawayQueue(client);
    });

    // Every 10 seconds
    cron.schedule('*/10 * * * * *', () => {
        processModerationQueue(client);
    });

    // Every 2 minutes
    cron.schedule('*/2 * * * *', () => {
        updateAllServerStats(client);
    });
    
    // Every 15 minutes
    cron.schedule('*/15 * * * *', () => {
        syncGuildMembers(client);
    });

    // Every day at midnight UTC
    cron.schedule('0 0 * * *', resetDailyStats, {
        scheduled: true,
        timezone: "UTC"
    });

    // System Status Heartbeat (every 30 seconds)
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const statusDocs = await databases.listDocuments(config.APPWRITE.DATABASE_ID, config.APPWRITE.COLLECTIONS.SYSTEM_STATUS);
            if (statusDocs.documents.length > 0) {
               await databases.updateDocument(config.APPWRITE.DATABASE_ID, config.APPWRITE.COLLECTIONS.SYSTEM_STATUS, statusDocs.documents[0].$id, { lastSeen: new Date().toISOString() });
           }
        } catch(e) { console.error("Failed to update system status heartbeat:", e.message) }
    });

    console.log('✅ All cron jobs have been scheduled.');
}

module.exports = { initializeCronJobs };
