

const { databases, Query } = require('../services/appwrite');
const config = require('../config');
const { fetchYoutubeChannelName, isVideoLive } = require('../utils/helpers');
const fetch = require('node-fetch');

const DB_ID = config.APPWRITE.DATABASE_ID;
const SUBS_COLLECTION = config.APPWRITE.COLLECTIONS.YOUTUBE_SUBSCRIPTIONS;

// A simple in-memory lock to prevent multiple checks from running simultaneously.
let isCheckingYouTube = false;

// Helper to parse video entries from the RSS feed
const parseVideosFromFeed = (feedText) => {
    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    const entries = feedText.match(entryRegex) || [];
    return entries.map(entry => {
        const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];
        const videoTitleMatch = entry.match(/<title>(.*?)<\/title>/);
        const rawTitle = videoTitleMatch ? videoTitleMatch[1] : 'A new video';
        // Sanitize title
        const videoTitle = rawTitle.trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"');
        return { id: videoId, title: videoTitle };
    }).filter(v => v.id);
};

// Helper to send the Discord notification
const sendNotification = async (client, sub, video) => {
    try {
        const channel = await client.channels.fetch(sub.discordChannelId);
        if (!channel?.isTextBased()) {
             console.warn(`[YouTube] Notification channel ${sub.discordChannelId} for sub ${sub.$id} not found or not a text channel.`);
             return;
        };

        const isLive = await isVideoLive(video.id);
        const videoUrl = `https://www.youtube.com/watch?v=${video.id}`;

        const defaultUploadMsg = "📢 Hey {mention}! {channelName} just uploaded a new video!\n\n**{videoTitle}**\n{videoUrl}";
        const defaultLiveMsg = "🔴 Hey {mention}! {channelName} is now LIVE!\n\n**{videoTitle}**\n{videoUrl}";

        let messageTemplate = isLive
            ? (sub.liveMessage || defaultLiveMsg)
            : (sub.customMessage || defaultUploadMsg);
            
        const mention = sub.mentionRoleId ? `<@&${sub.mentionRoleId}>` : '@everyone';
        
        const messageContent = messageTemplate
            .replace(/{mention}/g, mention)
            .replace(/{channelName}/g, `**${sub.youtubeChannelName || sub.youtubeChannelId}**`)
            .replace(/{videoTitle}/g, video.title)
            .replace(/{videoUrl}/g, videoUrl);
            
        await channel.send(messageContent);
        console.log(`[YouTube] Posted notification for video "${video.title}" to #${channel.name}.`);

    } catch (notificationError) {
        console.error(`[YouTube] Failed to send notification for video ${video.id} (sub ${sub.$id}):`, notificationError.message);
    }
};

/**
 * Processes a single YouTube subscription.
 * @param {object} sub The subscription document from Appwrite.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function processSubscription(sub, client) {
    const updatePayload = {};
    try {
        // Fetch and update YouTube channel name if missing
        if (!sub.youtubeChannelName) {
            const channelName = await fetchYoutubeChannelName(sub.youtubeChannelId);
            if (channelName) {
                sub.youtubeChannelName = channelName; // Update in-memory object
                updatePayload.youtubeChannelName = channelName;
                console.log(`[YouTube] Fetched YT channel name for ${sub.youtubeChannelId}: "${channelName}"`);
            }
        }

        // Fetch and update Discord channel name if missing
        if (!sub.discordChannelName) {
            const discordChannel = await client.channels.fetch(sub.discordChannelId).catch(() => null);
            if (discordChannel) {
                sub.discordChannelName = discordChannel.name; // Update in-memory object
                updatePayload.discordChannelName = discordChannel.name;
                console.log(`[YouTube] Fetched Discord channel name for ${sub.discordChannelId}: "#${discordChannel.name}"`);
            }
        }
        
        const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${sub.youtubeChannelId}`;
        const feedResponse = await fetch(feedUrl);
        if (!feedResponse.ok) {
            console.warn(`[YouTube] Failed to fetch feed for ${sub.youtubeChannelName || sub.youtubeChannelId}. Status: ${feedResponse.status}`);
            return;
        }
        const feedText = await feedResponse.text();
        const videosInFeed = parseVideosFromFeed(feedText);
        if (videosInFeed.length === 0) return;
        
        // Initialize subscription if it's new
        if (!sub.announcedVideoIds || sub.announcedVideoIds === '[]') {
            const allVideoIds = videosInFeed.map(v => v.id);
            updatePayload.announcedVideoIds = JSON.stringify(allVideoIds);
            updatePayload.lastVideoTimestamp = new Date().toISOString();
            console.log(`[YouTube] Initialized subscription for "${sub.youtubeChannelName}". Stored ${allVideoIds.length} latest video IDs.`);
        } else {
            const announcedIds = new Set(JSON.parse(sub.announcedVideoIds || '[]'));
            const newVideosToAnnounce = videosInFeed.filter(video => !announcedIds.has(video.id));

            if (newVideosToAnnounce.length > 0) {
                console.log(`[YouTube] Found ${newVideosToAnnounce.length} new video(s) for "${sub.youtubeChannelName}".`);
                
                // Announce videos from oldest to newest
                for (const video of newVideosToAnnounce.slice().reverse()) {
                    await sendNotification(client, sub, video);
                }

                // Update the database payload with all new info
                const newAnnouncedIds = newVideosToAnnounce.map(v => v.id);
                const updatedIdList = [...Array.from(announcedIds), ...newAnnouncedIds].slice(-20); // Keep last 20
                
                const latestVideo = newVideosToAnnounce[newVideosToAnnounce.length - 1];

                updatePayload.announcedVideoIds = JSON.stringify(updatedIdList);
                updatePayload.lastVideoTimestamp = new Date().toISOString();
                updatePayload.lastAnnouncedVideoId = latestVideo.id;
                updatePayload.lastAnnouncedVideoTitle = latestVideo.title;
            }
        }

        // If there's anything to update, do it now in a single atomic call
        if (Object.keys(updatePayload).length > 0) {
            await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, updatePayload);
        }
    } catch (error) {
        console.error(`[YouTube] Error processing sub ${sub.$id} (${sub.youtubeChannelName || 'ID:'+sub.youtubeChannelId}):`, error.message);
    }
}

/**
 * Checks all YouTube subscriptions for new videos.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkYouTube(client) {
    if (isCheckingYouTube) {
        console.log('[CRON: YouTube] Check already in progress. Skipping.');
        return;
    }
    isCheckingYouTube = true;
    console.log('[CRON: YouTube] Starting check for new videos...');

    try {
        const { documents: allSubs } = await databases.listDocuments(DB_ID, SUBS_COLLECTION, [Query.limit(5000)]);
        if (allSubs.length === 0) {
            console.log('[CRON: YouTube] No subscriptions found. Finished check.');
            return;
        }

        const processingPromises = allSubs.map(sub => processSubscription(sub, client));
        await Promise.all(processingPromises);

    } catch (error) {
        console.error("[CRON: YouTube] Critical error fetching subscriptions list:", error);
    } finally {
        isCheckingYouTube = false;
        console.log('[CRON: YouTube] Finished checking for new videos.');
    }
}

module.exports = checkYouTube;
