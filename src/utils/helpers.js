const fetch = require('node-fetch');
const { databases, Query, ID } = require('../services/appwrite');
const config = require('../config');

const USER_LEVELS_COLLECTION = config.APPWRITE.COLLECTIONS.USER_LEVELS;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;

/**
 * Fetches the channel name from a YouTube channel's RSS feed.
 * @param {string} youtubeChannelId - The ID of the YouTube channel.
 * @returns {Promise<string|null>} The channel name or null if not found.
 */
async function fetchYoutubeChannelName(youtubeChannelId) {
    try {
        const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`);
        if (!response.ok) return null;
        const text = await response.text();
        const nameMatch = text.match(/<title>(.*?)<\/title>/);
        const name = nameMatch ? nameMatch[1] : null;
        if (name) {
            console.log(`[DEBUG] Fetched YouTube channel name for ${youtubeChannelId}: ${name}`);
        }
        return name;
    } catch (error) {
        console.error(`Could not fetch YT channel name for ${youtubeChannelId}:`, error.message);
        return null;
    }
}

/**
 * Retrieves or creates a statistics document for a guild.
 * @param {string} guildId - The ID of the guild.
 * @returns {Promise<object|null>} The Appwrite document for stats or null on error.
 */
async function getOrCreateStatsDoc(guildId) {
    try {
        const response = await databases.listDocuments(config.APPWRITE.DATABASE_ID, STATS_COLLECTION, [
            Query.equal('guildId', guildId),
            Query.equal('doc_id', 'main_stats')
        ]);
        if (response.documents.length > 0) {
            return response.documents[0];
        } else {
            console.log(`[DEBUG] No stats doc found for guild ${guildId}, creating one...`);
            const defaultWeekly = JSON.stringify([
                { day: 'Sun', count: 0 }, { day: 'Mon', count: 0 }, { day: 'Tue', count: 0 },
                { day: 'Wed', count: 0 }, { day: 'Thu', count: 0 }, { day: 'Fri', count: 0 },
                { day: 'Sat', count: 0 },
            ]);
            const defaultRoles = JSON.stringify([]);
            return await databases.createDocument(config.APPWRITE.DATABASE_ID, STATS_COLLECTION, ID.unique(), {
                doc_id: 'main_stats',
                guildId, 
                memberCount: 0, 
                onlineCount: 0, 
                messagesToday: 0, 
                commandCount: 0, 
                totalWarnings: 0,
                messagesWeekly: defaultWeekly,
                roleDistribution: defaultRoles,
            });
        }
    } catch (e) {
        console.error(`Failed to get/create stats doc for guild ${guildId}:`, e.message);
        return null;
    }
}

/**
 * Calculates the total XP required to reach a specific level.
 * @param {number} level - The target level.
 * @returns {number} The total XP required.
 */
const calculateXpForLevel = (level) => 5 * (level ** 2) + 50 * level + 100;

/**
 * Retrieves or creates a user's level and XP document.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {string} username - The user's tag.
 * @param {string} userAvatarUrl - The user's avatar URL.
 * @returns {Promise<object|null>} The Appwrite document for the user's level or null on error.
 */
async function getOrCreateUserLevel(guildId, userId, username, userAvatarUrl) {
    try {
        const response = await databases.listDocuments(config.APPWRITE.DATABASE_ID, USER_LEVELS_COLLECTION, [
            Query.equal('guildId', guildId),
            Query.equal('userId', userId)
        ]);
        if (response.documents.length > 0) {
            return response.documents[0];
        } else {
            console.log(`[DEBUG] No level doc found for user ${username} (${userId}), creating one...`);
            return await databases.createDocument(config.APPWRITE.DATABASE_ID, USER_LEVELS_COLLECTION, ID.unique(), {
                guildId, userId, username, userAvatarUrl, level: 0, xp: 0
            });
        }
    } catch (e) {
        console.error(`Failed to get/create user level for ${username}:`, e.message);
        return null;
    }
}

/**
 * Checks if a video is currently a live stream.
 * @param {string} videoId The YouTube video ID.
 * @returns {Promise<boolean>} True if the video is live, false otherwise.
 */
async function isVideoLive(videoId) {
    if (!videoId) return false;
    try {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(videoUrl);
        if (!response.ok) return false;
        const html = await response.text();
        return html.includes('"isLive":true') || html.includes('"isLiveContent":true');
    } catch (error) {
        console.error(`Error checking live status for video ${videoId}:`, error.message);
        return false;
    }
}

module.exports = {
    fetchYoutubeChannelName,
    getOrCreateStatsDoc,
    calculateXpForLevel,
    getOrCreateUserLevel,
    isVideoLive,
};