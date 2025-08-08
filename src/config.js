// ============================================================================
// Discora Configuration Loader
// ============================================================================
// This module is responsible for loading the bot's environment variables
// from 'env.js', validating them, and exporting them for use elsewhere.

let config;
try {
    // We are in the /src directory, so we need to go up one level to find env.js
    config = require('../env.js');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.error("❌ CRITICAL ERROR: Configuration file 'bot/env.js' not found.");
        console.error("Please create it by copying 'bot/env.example.js' to 'bot/env.js' and filling in your details.");
    } else {
        console.error("❌ CRITICAL ERROR: Could not load 'bot/env.js'. Please ensure the file is correctly formatted.", error);
    }
    process.exit(1);
}

const requiredKeys = [
    'DISCORD_BOT_TOKEN', 'APPWRITE_ENDPOINT', 'APPWRITE_PROJECT_ID', 'APPWRITE_API_KEY',
    'GEMINI_API_KEY', 'APPWRITE_DATABASE_ID', 'APPWRITE_SERVERS_COLLECTION_ID',
    'APPWRITE_SETTINGS_COLLECTION_ID', 'APPWRITE_YOUTUBE_COLLECTION_ID', 'APPWRITE_COMMANDS_COLLECTION_ID',
    'APPWRITE_COMMAND_LOGS_COLLECTION_ID', 'APPWRITE_AUDIT_LOGS_COLLECTION_ID', 'APPWRITE_STATS_COLLECTION_ID',
    'APPWRITE_BOT_INFO_COLLECTION_ID', 'APPWRITE_SYSTEM_STATUS_COLLECTION_ID',
    'APPWRITE_USER_LEVELS_COLLECTION_ID', 'APPWRITE_MODERATION_QUEUE_COLLECTION_ID',
    'APPWRITE_MEMBERS_COLLECTION_ID', 'APPWRITE_SERVER_METADATA_COLLECTION_ID',
    'APPWRITE_REACTION_ROLES_COLLECTION_ID', 'APPWRITE_SCHEDULED_MESSAGES_COLLECTION_ID', 'APPWRITE_GIVEAWAYS_COLLECTION_ID',
    'APPWRITE_REACTION_ROLE_QUEUE_COLLECTION_ID', 'APPWRITE_GIVEAWAY_QUEUE_COLLECTION_ID', 'APPWRITE_MUSIC_QUEUE_COLLECTION_ID'
];

for (const key of requiredKeys) {
    if (!config[key]) {
        console.error(`❌ CRITICAL ERROR: Missing required configuration key in 'bot/env.js': ${key}`);
        console.error("Please compare your 'env.js' with 'env.example.js' and add the missing values.");
        process.exit(1);
    }
}

if (!config.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN.includes('YOUR_DISCORD_BOT_TOKEN')) {
    console.error("❌ CRITICAL ERROR: DISCORD_BOT_TOKEN must be set in your 'bot/env.js' file.");
    process.exit(1);
}

module.exports = {
    BOT_TOKEN: config.DISCORD_BOT_TOKEN,
    COMMAND_PREFIX: '!',
    APPWRITE: {
        ENDPOINT: config.APPWRITE_ENDPOINT,
        PROJECT_ID: config.APPWRITE_PROJECT_ID,
        API_KEY: config.APPWRITE_API_KEY,
        DATABASE_ID: config.APPWRITE_DATABASE_ID,
        COLLECTIONS: {
            SERVERS: config.APPWRITE_SERVERS_COLLECTION_ID,
            SETTINGS: config.APPWRITE_SETTINGS_COLLECTION_ID,
            YOUTUBE_SUBSCRIPTIONS: config.APPWRITE_YOUTUBE_COLLECTION_ID,
            COMMANDS: config.APPWRITE_COMMANDS_COLLECTION_ID,
            COMMAND_LOGS: config.APPWRITE_COMMAND_LOGS_COLLECTION_ID,
            AUDIT_LOGS: config.APPWRITE_AUDIT_LOGS_COLLECTION_ID,
            STATS: config.APPWRITE_STATS_COLLECTION_ID,
            BOT_INFO: config.APPWRITE_BOT_INFO_COLLECTION_ID,
            SYSTEM_STATUS: config.APPWRITE_SYSTEM_STATUS_COLLECTION_ID,
            USER_LEVELS: config.APPWRITE_USER_LEVELS_COLLECTION_ID,
            MODERATION_QUEUE: config.APPWRITE_MODERATION_QUEUE_COLLECTION_ID,
            MEMBERS: config.APPWRITE_MEMBERS_COLLECTION_ID,
            SERVER_METADATA: config.APPWRITE_SERVER_METADATA_COLLECTION_ID,
            REACTION_ROLES: config.APPWRITE_REACTION_ROLES_COLLECTION_ID,
            SCHEDULED_MESSAGES: config.APPWRITE_SCHEDULED_MESSAGES_COLLECTION_ID,
            GIVEAWAYS: config.APPWRITE_GIVEAWAYS_COLLECTION_ID,
            REACTION_ROLE_QUEUE: config.APPWRITE_REACTION_ROLE_QUEUE_COLLECTION_ID,
            GIVEAWAY_QUEUE: config.APPWRITE_GIVEAWAY_QUEUE_COLLECTION_ID,
            MUSIC_QUEUE: config.APPWRITE_MUSIC_QUEUE_COLLECTION_ID,
        },
    },
    GEMINI: {
        API_KEY: config.GEMINI_API_KEY,
    }
};