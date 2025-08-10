


const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Resets daily message counts for all guilds and prunes old weekly data.
 */
async function resetDailyStats() {
    console.log("[CRON: DailyReset] Starting daily stats reset and weekly data prune...");
    try {
        const { documents: allStats } = await databases.listDocuments(DB_ID, STATS_COLLECTION, [Query.limit(5000)]);
        if (allStats.length === 0) {
            console.log("[CRON: DailyReset] No stats documents to process. Task complete.");
            return;
        }

        const updates = allStats.map(doc => {
            let weeklyData = [];
            try {
                const parsed = JSON.parse(doc.messagesWeekly || '[]');
                if (Array.isArray(parsed)) {
                    weeklyData = parsed.filter(item => item && typeof item.date === 'string');
                }
            } catch { weeklyData = []; }
            
            // Prune the data to the last 35 days
            const prunedData = weeklyData
                .sort((a, b) => b.date.localeCompare(a.date)) // Sort descending by date
                .slice(0, 35); // Keep last 35 days
            
            return databases.updateDocument(DB_ID, STATS_COLLECTION, doc.$id, { 
                messagesWeekly: JSON.stringify(prunedData) 
            });
        });
        
        await Promise.all(updates);

        console.log(`[CRON: DailyReset] Successfully reset daily stats and pruned weekly data for ${allStats.length} guilds.`);
    } catch (e) {
        console.error("[CRON: DailyReset] Failed to process daily stats:", e.message);
    }
}

module.exports = resetDailyStats;
