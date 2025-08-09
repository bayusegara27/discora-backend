
const { databases, Query, ID } = require('../services/appwrite');
const config = require('../config');
const { guildSettings, guildCustomCommands } = require('../utils/cache');
const { Collection } = require('discord.js');

const DB_ID = config.APPWRITE.DATABASE_ID;
const COLLECTIONS = config.APPWRITE.COLLECTIONS;

/**
 * Synchronizes the bot's in-memory cache with the Appwrite database.
 * Fetches latest settings and custom commands.
 */
async function syncWithDatabase() {
    try {
        console.log('[CACHE] Starting cache sync with database...');
        const [settingsDocs, commandDocs] = await Promise.all([
            databases.listDocuments(DB_ID, COLLECTIONS.SETTINGS, [Query.limit(5000)]),
            databases.listDocuments(DB_ID, COLLECTIONS.COMMANDS, [Query.limit(5000)]),
        ]);

        guildSettings.clear();
        settingsDocs.documents.forEach(doc => {
            try {
                const parsedSettings = {
                    welcome: JSON.parse(doc.welcomeSettings || '{}'),
                    goodbye: JSON.parse(doc.goodbyeSettings || '{}'),
                    autoRole: JSON.parse(doc.autoRoleSettings || '{}'),
                    leveling: JSON.parse(doc.levelingSettings || '{}'),
                    autoMod: JSON.parse(doc.autoModSettings || '{}'),
                };
                guildSettings.set(doc.guildId, { $id: doc.$id, guildId: doc.guildId, ...parsedSettings });
            } catch (e) {
                console.error(`[CACHE] Failed to parse JSON settings for guild ${doc.guildId}:`, e.message)
            }
        });
        console.log(`[CACHE] Synced settings for ${guildSettings.size} guilds.`);

        guildCustomCommands.clear();
        let totalCommands = 0;
        commandDocs.documents.forEach(doc => {
            if (!guildCustomCommands.has(doc.guildId)) {
                guildCustomCommands.set(doc.guildId, new Collection());
            }
            guildCustomCommands.get(doc.guildId).set(doc.command, doc);
            totalCommands++;
        });
        console.log(`[CACHE] Synced ${totalCommands} custom commands for ${guildCustomCommands.size} guilds.`);
        console.log('[CACHE] Cache sync complete.');

    } catch (error) {
        console.error('[CACHE] Error during periodic sync with Appwrite:', error.message);
    }
}

/**
 * Handles the 'ready' event when the bot successfully connects to Discord.
 * @param {import('discord.js').Client} client The Discord client instance.
 */
async function onReady(client) {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    console.log("🔄 Syncing server list with database...");
    for (const guild of client.guilds.cache.values()) {
        try {
            const existing = await databases.listDocuments(DB_ID, COLLECTIONS.SERVERS, [Query.equal('guildId', guild.id)]);
            const serverData = { name: guild.name, iconUrl: guild.iconURL() || '' };
            if (existing.documents.length === 0) {
                console.log(`  -> Adding new server to DB: ${guild.name} (${guild.id})`);
                await databases.createDocument(DB_ID, COLLECTIONS.SERVERS, ID.unique(), { guildId: guild.id, ...serverData });
            } else {
                 const docId = existing.documents[0].$id;
                 if (existing.documents[0].name !== serverData.name || existing.documents[0].iconUrl !== serverData.iconUrl) {
                    console.log(`  -> Updating server in DB: ${guild.name} (${guild.id})`);
                    await databases.updateDocument(DB_ID, COLLECTIONS.SERVERS, docId, serverData);
                 }
            }
        } catch (e) { console.error(`[DB Sync] Failed to sync server ${guild.name}:`, e.message); }
    }
    
    await syncWithDatabase();
    
    try {
        console.log("🔄 Updating bot info and system status...");
        const botInfoData = { name: client.user.username, avatarUrl: client.user.displayAvatarURL() };
        const botInfoDocs = await databases.listDocuments(DB_ID, COLLECTIONS.BOT_INFO);
        if (botInfoDocs.documents.length > 0) {
            await databases.updateDocument(DB_ID, COLLECTIONS.BOT_INFO, botInfoDocs.documents[0].$id, botInfoData);
        } else {
            await databases.createDocument(DB_ID, COLLECTIONS.BOT_INFO, 'main_bot_info', botInfoData);
        }
        const statusData = { lastSeen: new Date().toISOString() };
        const statusDocs = await databases.listDocuments(DB_ID, COLLECTIONS.SYSTEM_STATUS);
         if (statusDocs.documents.length > 0) {
            await databases.updateDocument(DB_ID, COLLECTIONS.SYSTEM_STATUS, statusDocs.documents[0].$id, statusData);
        } else {
            await databases.createDocument(DB_ID, COLLECTIONS.SYSTEM_STATUS, 'main_status', statusData);
        }
    } catch(e) { console.error("[Ready] Failed to update bot info/status on startup:", e.message)}

    // Set up periodic sync
    setInterval(syncWithDatabase, 10000); // Sync settings every 10 seconds
    console.log("✅ Bot is ready and will sync with the database every 10 seconds.");
}

module.exports = onReady;
