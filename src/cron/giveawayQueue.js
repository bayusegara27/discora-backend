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

                const embed = new EmbedBuilder()
                    .setTitle(`🎉 GIVEAWAY: ${giveaway.prize} 🎉`)
                    .setDescription(`React with 🎉 to enter!\nEnds: <t:${endsAtTimestamp}:R>\nWinners: **${giveaway.winnerCount}**`)
                    .setColor('#FFD700')
                    .setTimestamp(new Date(giveaway.endsAt));

                const message = await channel.send({ embeds: [embed] });
                await message.react('🎉');

                await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveaway.$id, { messageId: message.id });
            
            } catch(e) {
                console.error(`Failed to process giveaway queue item ${item.$id}:`, e.message);
            } finally {
                await databases.deleteDocument(DB_ID, QUEUE_COLLECTION, item.$id);
            }
        }
    } catch(error) {
        console.error("Error fetching giveaway queue:", error);
    }
}

module.exports = processGiveawayQueue;
