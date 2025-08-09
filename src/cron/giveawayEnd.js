
const { databases, Query } = require('../services/appwrite');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { logAuditEvent } = require('../utils/loggers');

const DB_ID = config.APPWRITE.DATABASE_ID;
const GIVEAWAYS_COLLECTION = config.APPWRITE.COLLECTIONS.GIVEAWAYS;

/**
 * Ends a giveaway, selects winners, and announces them.
 * @param {string} giveawayId The Appwrite document ID of the giveaway.
 * @param {boolean} isReroll True if this is a reroll, false otherwise.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function endGiveaway(giveawayId, isReroll = false, client) {
    let giveaway, channel;
    try {
        giveaway = await databases.getDocument(DB_ID, GIVEAWAYS_COLLECTION, giveawayId);
        const action = isReroll ? 'Rerolling' : 'Ending';
        console.log(`[CRON: GiveawayEnd] ${action} giveaway "${giveaway.prize}" (ID: ${giveaway.messageId}) in guild ${giveaway.guildId}.`);
        
        const guild = await client.guilds.fetch(giveaway.guildId);
        channel = await guild.channels.fetch(giveaway.channelId);
        const message = await channel.messages.fetch(giveaway.messageId);

        const reaction = message.reactions.cache.get('🎉');
        if (!reaction) {
             console.log(`[CRON: GiveawayEnd] No '🎉' reaction found on giveaway message ${giveaway.messageId}.`);
             await message.edit({ embeds: [EmbedBuilder.from(message.embeds[0]).setDescription('Giveaway ended. No one reacted.').setColor('#FF0000')], components: [] });
             await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveaway.$id, { status: 'ended', winners: [] });
             return;
        }

        const users = await reaction.users.fetch();
        const entrants = users.filter(u => !u.bot).map(u => u.id);
        console.log(`[CRON: GiveawayEnd] Found ${entrants.length} entrants for "${giveaway.prize}".`);

        if (entrants.length === 0) {
            await message.edit({ embeds: [EmbedBuilder.from(message.embeds[0]).setDescription('Giveaway ended. Not enough entrants.').setColor('#FF0000')], components: [] });
            await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveaway.$id, { status: 'ended', winners: [] });
            return;
        }

        const winnerCount = Math.min(giveaway.winnerCount, entrants.length);
        const winnerIds = [];
        const availableEntrants = [...entrants];

        for (let i = 0; i < winnerCount; i++) {
            const winnerIndex = Math.floor(Math.random() * availableEntrants.length);
            winnerIds.push(availableEntrants.splice(winnerIndex, 1)[0]);
        }

        const winnerTags = winnerIds.map(id => `<@${id}>`).join(', ');
        console.log(`[CRON: GiveawayEnd] Selected winner(s) for "${giveaway.prize}": ${winnerTags}`);

        const announcement = isReroll
            ? `A new winner has been rerolled for the **${giveaway.prize}** giveaway! Congratulations ${winnerTags}!`
            : `Congratulations ${winnerTags}! You won the **${giveaway.prize}**!`;
            
        await channel.send({ content: announcement, "allowedMentions": { "users" : winnerIds } });

        const endedEmbed = EmbedBuilder.from(message.embeds[0])
            .setDescription(`Giveaway ended!\nWinners: ${winnerTags}`)
            .setColor('#32CD32');
        await message.edit({ embeds: [endedEmbed], components: [] });
        
        await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveaway.$id, { status: 'ended', winners: winnerIds });
        const logType = isReroll ? 'GIVEAWAY_REROLLED' : 'GIVEAWAY_ENDED';
        const logContent = `Giveaway for "${giveaway.prize}" ended. Winners: ${winnerIds.map(id => `<@${id}>`).join(', ')}`;
        await logAuditEvent(giveaway.guildId, logType, client.user, logContent);

    } catch (e) {
        console.error(`[CRON: GiveawayEnd] Failed to process giveaway ${giveawayId}:`, e.message);
        try {
            if (channel && giveaway) {
                channel.send(`There was an error while trying to end the giveaway for **${giveaway.prize}**. Please check bot permissions.`);
            }
            await databases.updateDocument(DB_ID, GIVEAWAYS_COLLECTION, giveawayId, { status: 'error' }).catch(() => {});
        } catch(finalError) {
             console.error(`[CRON: GiveawayEnd] Could not notify channel or update DB for failed giveaway ${giveawayId}:`, finalError.message);
        }
    }
}

/**
 * Checks for any running giveaways that have passed their end time.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkGiveaways(client) {
    const now = new Date().toISOString();
    try {
        const { documents } = await databases.listDocuments(DB_ID, GIVEAWAYS_COLLECTION, [
            Query.equal('status', 'running'),
            Query.lessThanEqual('endsAt', now)
        ]);
        if (documents.length > 0) {
            console.log(`[CRON: GiveawayEnd] Found ${documents.length} giveaway(s) to end.`);
        }
        for (const giveaway of documents) {
            await endGiveaway(giveaway.$id, false, client);
        }
    } catch (error) {
        console.error("[CRON: GiveawayEnd] Error checking for ending giveaways:", error);
    }
}

module.exports = { checkGiveaways, endGiveaway };
