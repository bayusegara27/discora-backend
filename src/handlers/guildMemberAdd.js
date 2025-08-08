const { guildSettings } = require('../utils/cache');
const { logAuditEvent } = require('../utils/loggers');

/**
 * Handles the 'guildMemberAdd' event.
 * @param {import('discord.js').GuildMember} member The member who joined.
 */
async function onGuildMemberAdd(member) {
    console.log(`[EVENT] User ${member.user.tag} joined guild ${member.guild.name}.`);
    const settings = guildSettings.get(member.guild.id);
    if (!settings) return;

    // --- Welcome Message ---
    if (settings.welcome?.enabled && settings.welcome.channelId) {
        try {
            const channel = await member.client.channels.fetch(settings.welcome.channelId);
            if (channel?.isTextBased()) {
                const welcomeMessage = (settings.welcome.message || 'Welcome to the server, {user}! Enjoy your stay.')
                    .replace('{user}', member.toString());
                await channel.send(welcomeMessage);
                console.log(`[DEBUG] Sent welcome message for ${member.user.tag} in ${member.guild.name}.`);
            }
        } catch (e) {
            console.error(`Welcome message failed for guild ${member.guild.id}:`, e.message);
        }
    }

    // --- Auto Role ---
    if (settings.autoRole?.enabled && settings.autoRole.roleId) {
        try {
            const role = await member.guild.roles.fetch(settings.autoRole.roleId);
            if (role) {
                await member.roles.add(role);
                console.log(`[DEBUG] Applied auto-role '${role.name}' to ${member.user.tag} in ${member.guild.name}.`);
            }
        } catch (e) {
            console.error(`Auto-role failed for guild ${member.guild.id}:`, e.message);
        }
    }

    // --- Audit Log ---
    await logAuditEvent(member.guild.id, 'USER_JOINED', member.user, `User ${member.user.tag} joined the server.`);
}

module.exports = onGuildMemberAdd;
