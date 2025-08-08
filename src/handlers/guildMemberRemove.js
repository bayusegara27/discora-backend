const { guildSettings } = require('../utils/cache');
const { logAuditEvent } = require('../utils/loggers');

/**
 * Handles the 'guildMemberRemove' event.
 * @param {import('discord.js').GuildMember} member The member who left or was kicked.
 */
async function onGuildMemberRemove(member) {
    console.log(`[EVENT] User ${member.user.tag} left guild ${member.guild.name}.`);
    const settings = guildSettings.get(member.guild.id);
    if (!settings) return;

    // --- Goodbye Message ---
    if (settings.goodbye?.enabled && settings.goodbye.channelId) {
        try {
            const channel = await member.client.channels.fetch(settings.goodbye.channelId);
            if (channel?.isTextBased()) {
                const goodbyeMessage = (settings.goodbye.message || '{user} has left the server.')
                    .replace('{user}', `**${member.user.tag}**`);
                await channel.send(goodbyeMessage);
                console.log(`[DEBUG] Sent goodbye message for ${member.user.tag} in ${member.guild.name}.`);
            }
        } catch (e) {
            console.error(`Goodbye message failed for guild ${member.guild.id}:`, e.message);
        }
    }
    
    // --- Audit Log ---
    await logAuditEvent(member.guild.id, 'USER_LEFT', member.user, `User ${member.user.tag} left.`);
}

module.exports = onGuildMemberRemove;
