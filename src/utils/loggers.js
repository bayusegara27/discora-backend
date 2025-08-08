const { databases, ID } = require('../services/appwrite');
const config =require('../config');

const AUDIT_LOGS_COLLECTION = config.APPWRITE.COLLECTIONS.AUDIT_LOGS;
const COMMAND_LOGS_COLLECTION = config.APPWRITE.COLLECTIONS.COMMAND_LOGS;

/**
 * Creates an entry in the audit log.
 * @param {string} guildId - The ID of the guild where the event occurred.
 * @param {string} type - The type of log event (e.g., 'USER_JOINED').
 * @param {object|string} user - The user object or a string identifier (e.g., 'AutoMod').
 * @param {string} content - The detailed content of the log entry.
 */
async function logAuditEvent(guildId, type, user, content) {
    try {
        await databases.createDocument(config.APPWRITE.DATABASE_ID, AUDIT_LOGS_COLLECTION, ID.unique(), {
            guildId,
            type,
            user: user.tag || user,
            userId: user.id || 'system',
            userAvatarUrl: user.displayAvatarURL ? user.displayAvatarURL() : '',
            content,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error(`Failed to log audit event:`, e.message)
    }
}

/**
 * Logs the usage of a command.
 * @param {string} guildId - The ID of the guild where the command was used.
 * @param {string} commandName - The name of the command that was executed.
 * @param {object} user - The user object who executed the command.
 */
async function logCommandUsage(guildId, commandName, user) {
    try {
        await databases.createDocument(config.APPWRITE.DATABASE_ID, COMMAND_LOGS_COLLECTION, ID.unique(), {
            guildId,
            command: commandName,
            user: user.tag,
            userId: user.id,
            userAvatarUrl: user.displayAvatarURL(),
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error(`Failed to log command usage:`, e.message)
    }
}


module.exports = {
    logAuditEvent,
    logCommandUsage,
};
