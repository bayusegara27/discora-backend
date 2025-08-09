const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Resets daily message counts for all guilds.
 */
async function resetDailyStats() {
    console.log("Midnight reset: Resetting daily message counts...");
    try {
        const allStats = await databases.listDocuments(DB_ID, STATS_COLLECTION, [Query.limit(5000)]);
        for (const doc of allStats.documents) {
            const updates = { messagesToday: 0 };
            await databases.updateDocument(DB_ID, STATS_COLLECTION, doc.$id, updates);
        }
        console.log("Daily message count reset complete.");
    } catch (e) {
        console.error("Failed to reset daily message counts:", e.message);
    }
}

module.exports = resetDailyStats;