
const { databases } = require('../services/appwrite');
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const DB_ID = config.APPWRITE.DATABASE_ID;
const QUEUE_COLLECTION = config.APPWRITE.COLLECTIONS.REACTION_ROLE_QUEUE;
const RR_COLLECTION = config.APPWRITE.COLLECTIONS.REACTION_ROLES;

/**
 * Processes the reaction role queue, creating the embed and adding reactions.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processReactionRoleQueue(client) {
    try {
        const { documents } = await databases.listDocuments(DB_ID, QUEUE_COLLECTION);
        if (documents.length > 0) {
            console.log(`[CRON: ReactionRoles] Processing ${documents.length} item(s) from queue.`);
        }
        for (const item of documents) {
            try {
                const rrDoc = await databases.getDocument(DB_ID, RR_COLLECTION, item.reactionRoleId);
                const channel = await client.channels.fetch(rrDoc.channelId);

                if (!channel || !channel.isTextBased()) {
                    throw new Error(`Channel ${rrDoc.channelId} not found or is not a text channel.`);
                }
                
                const roles = JSON.parse(rrDoc.roles || '[]');
                if (roles.length === 0) {
                     throw new Error(`No roles defined for reaction role document ${rrDoc.$id}.`);
                }

                let description = (rrDoc.embedDescription || '') + '\n\n';
                for (const role of roles) {
                    description += `${role.emoji} - <@&${role.roleId}>\n`;
                }

                const embed = new EmbedBuilder()
                    .setTitle(rrDoc.embedTitle)
                    .setDescription(description.trim())
                    .setColor(rrDoc.embedColor || '#5865F2');
                
                const message = await channel.send({ embeds: [embed] });

                for (const role of roles) {
                    await message.react(role.emoji);
                }

                await databases.updateDocument(DB_ID, RR_COLLECTION, rrDoc.$id, { messageId: message.id });
                console.log(`[CRON: ReactionRoles] Successfully processed and posted reaction role ${rrDoc.$id} to #${channel.name}.`);
                
            } catch (e) {
                console.error(`[CRON: ReactionRoles] Failed to process queue item ${item.$id} (RR Doc: ${item.reactionRoleId}):`, e.message);
            } finally {
                await databases.deleteDocument(DB_ID, QUEUE_COLLECTION, item.$id);
            }
        }
    } catch (error) {
        console.error("[CRON: ReactionRoles] Error fetching reaction role queue:", error);
    }
}

module.exports = processReactionRoleQueue;
