const { databases, Query } = require('../services/appwrite');
const config = require('../config');
const { fetchYoutubeChannelName, isVideoLive } = require('../utils/helpers');

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
        if (!channel?.isTextBased()) return;

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
        console.log(`[YouTube] Posted notification for ${video.id} to #${channel.name}.`);

    } catch (notificationError) {
        console.error(`[YouTube] Failed to send notification for video ${video.id}:`, notificationError.message);
    }
};

/**
 * Checks all YouTube subscriptions for new videos. This is a more robust version.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkYouTube(client) {
    if (isCheckingYouTube) {
        console.log('[YouTube] Check already in progress. Skipping.');
        return;
    }
    isCheckingYouTube = true;
    console.log('[YouTube] Starting check for new videos...');

    try {
        const { documents: allSubs } = await databases.listDocuments(DB_ID, SUBS_COLLECTION, [Query.limit(5000)]);
        if (allSubs.length === 0) return;

        for (const sub of allSubs) {
            try {
                const feedResponse = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${sub.youtubeChannelId}`);
                if (!feedResponse.ok) {
                    console.warn(`[YouTube] Failed to fetch feed for ${sub.youtubeChannelName || sub.youtubeChannelId}. Status: ${feedResponse.status}`);
                    continue;
                }
                const feedText = await feedResponse.text();
                const videosInFeed = parseVideosFromFeed(feedText);
                if (videosInFeed.length === 0) continue;
                
                // Initialize subscription if it's new (announcedVideoIds is empty/not set)
                if (!sub.announcedVideoIds || sub.announcedVideoIds === '[]') {
                    const allVideoIds = videosInFeed.map(v => v.id);
                    await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, { 
                        announcedVideoIds: JSON.stringify(allVideoIds),
                        lastVideoTimestamp: new Date().toISOString()
                    });
                    console.log(`[YouTube] Initialized subscription for ${sub.youtubeChannelName || sub.youtubeChannelId}. Stored ${allVideoIds.length} video IDs.`);
                    continue;
                }

                const announcedIds = new Set(JSON.parse(sub.announcedVideoIds || '[]'));
                const newVideosToAnnounce = videosInFeed.filter(video => !announcedIds.has(video.id));

                if (newVideosToAnnounce.length > 0) {
                    console.log(`[YouTube] Found ${newVideosToAnnounce.length} new video(s) for ${sub.youtubeChannelName}.`);
                    
                    // Announce videos from oldest to newest
                    for (const video of newVideosToAnnounce.slice().reverse()) {
                        await sendNotification(client, sub, video);
                    }

                    // Update the database
                    const newAnnouncedIds = newVideosToAnnounce.map(v => v.id);
                    const updatedIdList = [...Array.from(announcedIds), ...newAnnouncedIds].slice(-20); // Keep last 20
                    const lastAnnouncedVideo = newVideosToAnnounce[0]; // The most recent one from the feed

                    await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, {
                        announcedVideoIds: JSON.stringify(updatedIdList),
                        lastAnnouncedVideoId: lastAnnouncedVideo.id,
                        lastAnnouncedVideoTitle: lastAnnouncedVideo.title,
                        lastVideoTimestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error(`[YouTube] Error processing sub ${sub.$id} (${sub.youtubeChannelName}):`, error.message);
            }
        }
    } catch (error) {
        console.error("[YouTube] Critical error fetching subscriptions:", error);
    } finally {
        isCheckingYouTube = false;
        console.log('[YouTube] Finished checking for new videos.');
    }
}

module.exports = checkYouTube;
