
const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Resets daily message counts for all guilds.
 */
async function resetDailyStats() {
    console.log("[CRON: DailyReset] Starting daily message count reset...");
    try {
        const allStats = await databases.listDocuments(DB_ID, STATS_COLLECTION, [Query.limit(5000)]);
        if (allStats.documents.length === 0) {
            console.log("[CRON: DailyReset] No stats documents to reset. Task complete.");
            return;
        }

        const updates = allStats.documents.map(doc => 
            databases.updateDocument(DB_ID, STATS_COLLECTION, doc.$id, { messagesToday: 0 })
        );
        
        await Promise.all(updates);

        console.log(`[CRON: DailyReset] Successfully reset daily message counts for ${allStats.documents.length} guilds.`);
    } catch (e) {
        console.error("[CRON: DailyReset] Failed to reset daily message counts:", e.message);
    }
}

module.exports = resetDailyStats;
