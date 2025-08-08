const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Resets daily message counts for all guilds and weekly counts on Mondays.
 */
async function resetDailyStats() {
    console.log("Midnight reset: Resetting daily message counts...");
    try {
        const allStats = await databases.listDocuments(DB_ID, STATS_COLLECTION, [Query.limit(5000)]);
        for (const doc of allStats.documents) {
            const updates = { messagesToday: 0 };
            const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 1=Mon

            // On Monday (day 1), reset the entire week's data
            if (dayOfWeek === 1) {
                const weeklyData = JSON.parse(doc.messagesWeekly || '[]');
                weeklyData.forEach(day => day.count = 0);
                updates.messagesWeekly = JSON.stringify(weeklyData);
                console.log(`  -> Weekly stats reset for guild ${doc.guildId}`);
            }

            await databases.updateDocument(DB_ID, STATS_COLLECTION, doc.$id, updates);
        }
        console.log("Daily message count reset complete.");
    } catch (e) {
        console.error("Failed to reset daily message counts:", e.message);
    }
}

module.exports = resetDailyStats;
