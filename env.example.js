// ============================================================================
// Discora Bot Configuration
// ============================================================================
//
// INSTRUCTIONS:
// 1. Rename this file from 'env.example.js' to 'env.js'.
// 2. Fill in the required values below.
// 3. IMPORTANT: Do NOT commit 'env.js' to version control (e.g., Git).
//    This file contains sensitive credentials.
//
// ============================================================================

module.exports = {
  // --- Required Credentials ---

  // Your Discord bot's token.
  // Find this in your bot's application page on the Discord Developer Portal.
  DISCORD_BOT_TOKEN: 'YOUR_DISCORD_BOT_TOKEN_HERE',

  // Your Appwrite project's server-side API key.
  // In your Appwrite project console, go to API Keys and create a new one.
  // It needs read/write access to Databases.
  APPWRITE_API_KEY: 'YOUR_APPWRITE_SERVER_API_KEY_HERE',

  // Your Google Gemini API Key.
  // Required for the AI-powered auto-moderation feature.
  // Get one from Google AI Studio.
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',


  // --- Appwrite Configuration ---
  APPWRITE_ENDPOINT: 'https://appwrite.nakumi.my.id/v1',
  APPWRITE_PROJECT_ID: 'personal',
  APPWRITE_DATABASE_ID: 'aurabot_db',

  // --- Appwrite Collection IDs ---
  // These MUST match the collection IDs in your Appwrite database.
  APPWRITE_SERVERS_COLLECTION_ID: 'servers',
  APPWRITE_SETTINGS_COLLECTION_ID: 'server_settings',
  APPWRITE_YOUTUBE_COLLECTION_ID: 'youtube_subscriptions',
  APPWRITE_COMMANDS_COLLECTION_ID: 'custom_commands',
  APPWRITE_COMMAND_LOGS_COLLECTION_ID: 'command_logs',
  APPWRITE_AUDIT_LOGS_COLLECTION_ID: 'audit_logs',
  APPWRITE_STATS_COLLECTION_ID: 'server_stats',
  APPWRITE_BOT_INFO_COLLECTION_ID: 'bot_info',
  APPWRITE_SYSTEM_STATUS_COLLECTION_ID: 'system_status',
  APPWRITE_USER_LEVELS_COLLECTION_ID: 'user_levels',
  APPWRITE_MODERATION_QUEUE_COLLECTION_ID: 'moderation_queue',
  APPWRITE_MEMBERS_COLLECTION_ID: 'members',
  APPWRITE_SERVER_METADATA_COLLECTION_ID: 'server_metadata',

  // --- Feature Collection IDs (Added in recent updates) ---
  APPWRITE_REACTION_ROLES_COLLECTION_ID: 'reaction_roles',
  APPWRITE_SCHEDULED_MESSAGES_COLLECTION_ID: 'scheduled_messages',
  APPWRITE_GIVEAWAYS_COLLECTION_ID: 'giveaways',
  
  // --- Bot Queue Collection IDs (Added in recent updates) ---
  APPWRITE_REACTION_ROLE_QUEUE_COLLECTION_ID: 'reaction_role_queue',
  APPWRITE_GIVEAWAY_QUEUE_COLLECTION_ID: 'giveaway_queue',
  APPWRITE_MUSIC_QUEUE_COLLECTION_ID: 'music_queue',
};