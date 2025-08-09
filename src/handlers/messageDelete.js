
const { logAuditEvent } = require('../utils/loggers');

/**
 * Handles the 'messageDelete' event.
 * @param {import('discord.js').Message} message The message that was deleted.
 */
async function onMessageDelete(message) {
    // Ignore bots and messages without content or guild
    if (message.author?.bot || !message.content || !message.guild) return;
    
    console.log(`[EVENT] Message from ${message.author?.tag} deleted in #${message.channel.name} (${message.guild.name}).`);

    const content = message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content;
    const logContent = `Message by ${message.author.tag} deleted in #${message.channel.name}:\n"${content}"`;
    
    await logAuditEvent(message.guild.id, 'MESSAGE_DELETED', message.author, logContent);
}

module.exports = onMessageDelete;
