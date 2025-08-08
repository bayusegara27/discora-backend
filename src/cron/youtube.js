const { databases, Query } = require('../services/appwrite');
const config = require('../config');
const { fetchYoutubeChannelName, isVideoLive } = require('../utils/helpers');

const DB_ID = config.APPWRITE.DATABASE_ID;
const SUBS_COLLECTION = config.APPWRITE.COLLECTIONS.YOUTUBE_SUBSCRIPTIONS;

/**
 * Checks all YouTube subscriptions for new videos.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function checkYouTube(client) {
    try {
        const allSubs = await databases.listDocuments(DB_ID, SUBS_COLLECTION, [Query.limit(5000)]);
        if (allSubs.total === 0) return;

        for (const sub of allSubs.documents) {
            try {
                // Fetch missing metadata if needed
                if (!sub.youtubeChannelName) {
                    const name = await fetchYoutubeChannelName(sub.youtubeChannelId);
                    if (name) {
                        await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, { youtubeChannelName: name });
                        sub.youtubeChannelName = name;
                    }
                }
                if (!sub.discordChannelName) {
                    const channel = await client.channels.fetch(sub.discordChannelId).catch(() => null);
                    if (channel) {
                        await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, { discordChannelName: channel.name });
                        sub.discordChannelName = channel.name;
                    }
                }
                
                const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${sub.youtubeChannelId}`);
                if (!response.ok) continue;
                const text = await response.text();
                
                const firstEntryMatch = text.match(/<entry>([\s\S]*?)<\/entry>/);
                if (!firstEntryMatch || !firstEntryMatch[1]) continue;

                const entryContent = firstEntryMatch[1];
                const videoIdMatch = entryContent.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
                const videoTitleMatch = entryContent.match(/<title>(.*?)<\/title>/);
                const newVideoId = videoIdMatch?.[1];

                if (newVideoId && newVideoId !== sub.latestVideoId) {
                    console.log(`[CRON: YouTube] New video found for ${sub.youtubeChannelName || sub.youtubeChannelId}: ${newVideoId}`);
                    
                    const isLive = await isVideoLive(newVideoId);
                    const rawTitle = videoTitleMatch?.[1];
                    const videoTitle = rawTitle ? rawTitle.trim().replace(/&amp;/g, '&') : 'A new video';

                    // First, update the database to prevent duplicate notifications from race conditions
                    const dataToUpdate = { latestVideoId: newVideoId, latestVideoTitle: videoTitle, lastVideoTimestamp: new Date().toISOString() };
                    await databases.updateDocument(DB_ID, SUBS_COLLECTION, sub.$id, dataToUpdate);
                    console.log(`[CRON: YouTube] Database updated for new video ${newVideoId}. Proceeding to notify.`);

                    // Then, attempt to send the notification message
                    try {
                        const channel = await client.channels.fetch(sub.discordChannelId);
                        if (channel?.isTextBased()) {
                            const videoUrl = `https://www.youtube.com/watch?v=${newVideoId}`;

                            const defaultUploadMsg = "📢 Hey {mention}! {channelName} just uploaded a new video!\n\n**{videoTitle}**\n{videoUrl}";
                            const defaultLiveMsg = "🔴 Hey {mention}! {channelName} is now LIVE!\n\n**{videoTitle}**\n{videoUrl}";
                            
                            let messageTemplate = isLive ? (sub.liveMessage || defaultLiveMsg) : (sub.customMessage || defaultUploadMsg);

                            const mention = sub.mentionRoleId ? `<@&${sub.mentionRoleId}>` : '@everyone';
                            messageTemplate = messageTemplate.replace(/{mention}/g, mention);
                            
                            const messageContent = messageTemplate
                                .replace(/{channelName}/g, `**${sub.youtubeChannelName || sub.youtubeChannelId}**`)
                                .replace(/{videoTitle}/g, videoTitle)
                                .replace(/{videoUrl}/g, videoUrl);
                            
                            await channel.send(messageContent);
                            console.log(`[CRON: YouTube] Posted notification to #${channel.name} in guild ${channel.guild.name}.`);
                        }
                    } catch (notificationError) {
                        // Log the error but don't re-throw. The DB is updated, so we won't re-notify. This is the desired behavior to prevent spam.
                        console.error(`[CRON: YouTube] Failed to send notification for video ${newVideoId} (DB already updated):`, notificationError.message);
                    }
                }
            } catch (error) {
                console.error(`YouTube Check Error for sub ${sub.$id} (YT Channel: ${sub.youtubeChannelId}):`, error.message);
            }
        }
    } catch (error) {
        console.error("Error fetching YouTube subscriptions:", error);
    }
}

module.exports = checkYouTube;
