
const { databases, Query } = require('../services/appwrite');
const config = require('../config');

const REACTION_ROLES_COLLECTION = config.APPWRITE.COLLECTIONS.REACTION_ROLES;
const DB_ID = config.APPWRITE.DATABASE_ID;

/**
 * Handles adding or removing roles based on message reactions.
 * @param {import('discord.js').MessageReaction} reaction The reaction object.
 * @param {import('discord.js').User} user The user who reacted.
 * @param {boolean} added True if the reaction was added, false if removed.
 */
async function onReaction(reaction, user, added) {
    if (user.bot) return;

    // Resolve partials to ensure all data is available
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('[Reaction] Failed to fetch partial reaction:', error);
            return;
        }
    }
    if (reaction.message.partial) {
        try {
            await reaction.message.fetch();
        } catch (error) {
            console.error('[Reaction] Failed to fetch partial message:', error);
            return;
        }
    }

    const { message } = reaction;
    if (!message.guild) return;

    try {
        const reactionRoleDocs = await databases.listDocuments(DB_ID, REACTION_ROLES_COLLECTION, [
            Query.equal('guildId', message.guild.id),
            Query.equal('messageId', message.id)
        ]);
        
        if (reactionRoleDocs.documents.length === 0) return;

        const reactionRole = reactionRoleDocs.documents[0];
        const roles = JSON.parse(reactionRole.roles || '[]');
        
        // Find the specific role configuration for the emoji that was used.
        const roleConfig = roles.find(r => r.emoji === reaction.emoji.toString());
        if (!roleConfig) return;

        const member = await message.guild.members.fetch(user.id);
        const role = await message.guild.roles.fetch(roleConfig.roleId);

        if (!member || !role) {
            console.warn(`[Reaction] Could not find member or role for reaction role ${reactionRole.$id}. Member: ${!!member}, Role: ${!!role}`);
            return;
        }

        const action = added ? 'add' : 'remove';
        const logAction = added ? 'Added' : 'Removed';

        await member.roles[action](role);
        console.log(`[ReactionRole] ${logAction} role "${role.name}" to/from ${user.tag} in guild ${message.guild.name}.`);

    } catch (error) {
        console.error(`[ReactionRole] Error handling reaction role for user ${user.tag} in guild ${message.guild.name}:`, error);
    }
}

module.exports = onReaction;
