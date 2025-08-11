const { databases } = require('../services/appwrite');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const QUEUE_COLLECTION = config.APPWRITE.COLLECTIONS.GIVEAWAY_QUEUE;
const GIVEAWAYS_COLLECTION = config.APPWRITE.COLLECTIONS.GIVEAWAYS;

/**
 * Processes the giveaway queue, creating the announcement message.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processGiveawayQueue(client) {
    try {
        const { documents } = await databases.listDocuments(DB_ID, QUEUE_COLLECTION);
        if (documents.length > 0) {
            console.log(`[CRON: Giveaways] Processing ${documents.length} item(s) from new giveaway queue.`);
        }
        for (const item of documents) {
            try {
                const giveaway = await databases.getDocument(DB_ID, GIVEAWAYS_COLLECTION, item.giveawayId);
                const channel = await client.channels.fetch(giveaway.channelId);
                const endsAtTimestamp = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);

                if (!channel || !channel.isTextBased()) {
                    throw new Error(`Channel ${giveaway.channelId} not found or is not a text channel.`);
                }

                const embed = new EmbedBuilder()
                    .setTitle(`🎉 GIVEAWAY: ${giveaway.prize} 🎉`)
                    .setDescription(`React with 🎉 to enter!\nEnds: <t:${endsAtTimestamp}:R> (<t:${endsAtTimestamp}:F>)\nWinners: **${giveaway.winnerCount}**`)
                    .setColor('#FFD700')
                    .setTimestamp(new Date(giveaway.endsAt));

                const message = await channel.send({ embeds: [embed] });
                await message.react('🎉');

                await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveaway.$id, { messageId: message.id });
                console.log(`[CRON: Giveaways] Successfully created giveaway message for "${giveaway.prize}" in #${channel.name}.`);
            
            } catch(e) {
                console.error(`[CRON: Giveaways] Failed to process queue item ${item.$id} (Giveaway: ${item.giveawayId}):`, e.message);
                // Optionally mark the giveaway as errored in the main table
                await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, item.giveawayId, { status: 'error' }).catch(() => {});
            } finally {
                await databases.deleteDocument(DB_ID, QUEUE_COLLECTION, item.$id);
            }
        }
    } catch(error) {
        console.error("[CRON: Giveaways] Error fetching giveaway queue:", error);
    }
}

module.exports = processGiveawayQueue;
