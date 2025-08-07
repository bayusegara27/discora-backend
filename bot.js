const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
} = require("discord.js");
const {
  Client: AppwriteClient,
  Databases,
  ID,
  Query,
} = require("node-appwrite");
const { GoogleGenAI } = require("@google/genai");
const fetch = require("node-fetch");
const cron = require("node-cron");

let config;
try {
  config = require("./env.js");
} catch (error) {
  if (error.code === "MODULE_NOT_FOUND") {
    console.error("CRITICAL ERROR: Configuration file 'bot/env.js' not found.");
    console.error(
      "Please create it by copying 'bot/env.example.js' to 'bot/env.js' and filling in your details."
    );
  } else {
    console.error(
      "CRITICAL ERROR: Could not load 'bot/env.js'. Please ensure the file is correctly formatted.",
      error
    );
  }
  process.exit(1);
}

const requiredKeys = [
  "DISCORD_BOT_TOKEN",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "GEMINI_API_KEY",
  "APPWRITE_DATABASE_ID",
  "APPWRITE_SERVERS_COLLECTION_ID",
  "APPWRITE_SETTINGS_COLLECTION_ID",
  "APPWRITE_YOUTUBE_COLLECTION_ID",
  "APPWRITE_COMMANDS_COLLECTION_ID",
  "APPWRITE_COMMAND_LOGS_COLLECTION_ID",
  "APPWRITE_AUDIT_LOGS_COLLECTION_ID",
  "APPWRITE_STATS_COLLECTION_ID",
  "APPWRITE_BOT_INFO_COLLECTION_ID",
  "APPWRITE_SYSTEM_STATUS_COLLECTION_ID",
  "APPWRITE_USER_LEVELS_COLLECTION_ID",
  "APPWRITE_MODERATION_QUEUE_COLLECTION_ID",
  "APPWRITE_MEMBERS_COLLECTION_ID",
  "APPWRITE_SERVER_METADATA_COLLECTION_ID", // New
];

for (const key of requiredKeys) {
  if (!config[key]) {
    console.error(
      `CRITICAL ERROR: Missing required configuration key in 'bot/env.js': ${key}`
    );
    console.error(
      "Please compare your 'env.js' with 'env.example.js' and add the missing values."
    );
    process.exit(1);
  }
}

const {
  DISCORD_BOT_TOKEN: BOT_TOKEN,
  APPWRITE_ENDPOINT,
  APPWRITE_PROJECT_ID,
  APPWRITE_API_KEY,
  GEMINI_API_KEY,
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_SERVERS_COLLECTION_ID: SERVERS_COLLECTION_ID,
  APPWRITE_SETTINGS_COLLECTION_ID: SETTINGS_COLLECTION_ID,
  APPWRITE_YOUTUBE_COLLECTION_ID: YOUTUBE_SUBSCRIPTIONS_COLLECTION_ID,
  APPWRITE_COMMANDS_COLLECTION_ID: COMMANDS_COLLECTION_ID,
  APPWRITE_COMMAND_LOGS_COLLECTION_ID: COMMAND_LOGS_COLLECTION_ID,
  APPWRITE_AUDIT_LOGS_COLLECTION_ID: AUDIT_LOGS_COLLECTION_ID,
  APPWRITE_STATS_COLLECTION_ID: STATS_COLLECTION_ID,
  APPWRITE_BOT_INFO_COLLECTION_ID: BOT_INFO_COLLECTION_ID,
  APPWRITE_SYSTEM_STATUS_COLLECTION_ID: SYSTEM_STATUS_COLLECTION_ID,
  APPWRITE_USER_LEVELS_COLLECTION_ID: USER_LEVELS_COLLECTION_ID,
  APPWRITE_MODERATION_QUEUE_COLLECTION_ID: MODERATION_QUEUE_COLLECTION_ID,
  APPWRITE_MEMBERS_COLLECTION_ID: MEMBERS_COLLECTION_ID,
  APPWRITE_SERVER_METADATA_COLLECTION_ID: SERVER_METADATA_COLLECTION_ID,
} = config;

if (
  !BOT_TOKEN ||
  BOT_TOKEN.includes("YOUR_DISCORD_BOT_TOKEN") ||
  !APPWRITE_API_KEY ||
  APPWRITE_API_KEY.includes("YOUR_APPWRITE_SERVER_API_KEY")
) {
  console.error(
    "CRITICAL ERROR: DISCORD_BOT_TOKEN and APPWRITE_API_KEY must be set in your 'bot/env.js' file."
  );
  process.exit(1);
}

const COMMAND_PREFIX = "!";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const appwriteClient = new AppwriteClient()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);
const databases = new Databases(appwriteClient);

let geminiService = null;
if (GEMINI_API_KEY && !GEMINI_API_KEY.includes("YOUR_GEMINI_API_KEY")) {
  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  geminiService = {
    moderateContent: async (content) => {
      try {
        const systemInstruction =
          "You are an AI moderator for a Discord server. Your task is to determine if a message violates community guidelines (e.g., contains hate speech, spam, explicit content, or excessive toxicity). Respond with only one of two words: 'FLAG' if the message is inappropriate, or 'OK' if the message is acceptable. Do not provide any explanation or other text.";
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: content,
          config: { systemInstruction: systemInstruction },
        });
        return response.text.trim();
      } catch (error) {
        console.error("Gemini moderation call failed:", error.message);
        return "OK";
      }
    },
  };
  console.log("✅ Gemini AI Auto-moderation service initialized.");
} else {
  console.warn(
    "⚠️ Gemini API key not found or is a placeholder. AI Auto-moderation will be disabled."
  );
}

const guildSettings = new Collection();
const guildCustomCommands = new Collection();
const xpCooldowns = new Collection();

async function syncWithDatabase() {
  console.log(`[${new Date().toLocaleTimeString()}] Starting database sync...`);
  try {
    const [settingsDocs, commandDocs] = await Promise.all([
      databases.listDocuments(DATABASE_ID, SETTINGS_COLLECTION_ID, [
        Query.limit(5000),
      ]),
      databases.listDocuments(DATABASE_ID, COMMANDS_COLLECTION_ID, [
        Query.limit(5000),
      ]),
    ]);

    guildSettings.clear();
    settingsDocs.documents.forEach((doc) => {
      doc.levelingRoleRewards = JSON.parse(doc.levelingRoleRewards || "[]");
      doc.levelingBlacklistedChannels = JSON.parse(
        doc.levelingBlacklistedChannels || "[]"
      );
      guildSettings.set(doc.guildId, doc);
    });

    guildCustomCommands.clear();
    commandDocs.documents.forEach((doc) => {
      if (!guildCustomCommands.has(doc.guildId)) {
        guildCustomCommands.set(doc.guildId, new Collection());
      }
      guildCustomCommands.get(doc.guildId).set(doc.command, doc.response);
    });

    console.log(
      `[${new Date().toLocaleTimeString()}] Sync complete. Loaded settings for ${
        guildSettings.size
      } guilds and command sets for ${guildCustomCommands.size} guilds.`
    );
  } catch (error) {
    console.error("Error during periodic sync with Appwrite:", error.message);
  }
}

async function fetchYoutubeChannelName(youtubeChannelId) {
  try {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`
    );
    if (!response.ok) return null;
    const text = await response.text();
    const nameMatch = text.match(/<title>(.*?)<\/title>/);
    return nameMatch ? nameMatch[1] : null;
  } catch (error) {
    console.error(
      `Could not fetch YT channel name for ${youtubeChannelId}:`,
      error.message
    );
    return null;
  }
}

async function logAuditEvent(guildId, type, user, content) {
  try {
    await databases.createDocument(
      DATABASE_ID,
      AUDIT_LOGS_COLLECTION_ID,
      ID.unique(),
      {
        guildId,
        type,
        user: user.tag || user,
        userId: user.id || "system",
        userAvatarUrl: user.displayAvatarURL ? user.displayAvatarURL() : "",
        content,
        timestamp: new Date().toISOString(),
      }
    );
  } catch (e) {
    console.error(`Failed to log audit event:`, e.message);
  }
}

async function logCommandUsage(guildId, commandName, user) {
  try {
    await databases.createDocument(
      DATABASE_ID,
      COMMAND_LOGS_COLLECTION_ID,
      ID.unique(),
      {
        guildId,
        command: commandName,
        user: user.tag,
        userId: user.id,
        userAvatarUrl: user.displayAvatarURL(),
        timestamp: new Date().toISOString(),
      }
    );
  } catch (e) {
    console.error(`Failed to log command usage:`, e.message);
  }
}

async function getOrCreateStatsDoc(guildId) {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      STATS_COLLECTION_ID,
      [Query.equal("guildId", guildId), Query.equal("doc_id", "main_stats")]
    );
    if (response.documents.length > 0) {
      return response.documents[0];
    } else {
      const defaultWeekly = JSON.stringify([
        { day: "Sun", count: 0 },
        { day: "Mon", count: 0 },
        { day: "Tue", count: 0 },
        { day: "Wed", count: 0 },
        { day: "Thu", count: 0 },
        { day: "Fri", count: 0 },
        { day: "Sat", count: 0 },
      ]);
      return await databases.createDocument(
        DATABASE_ID,
        STATS_COLLECTION_ID,
        ID.unique(),
        {
          doc_id: "main_stats",
          guildId,
          memberCount: 0,
          onlineCount: 0,
          messagesToday: 0,
          commandCount: 0,
          messagesWeekly: defaultWeekly,
        }
      );
    }
  } catch (e) {
    console.error(
      `Failed to get/create stats doc for guild ${guildId}:`,
      e.message
    );
    return null;
  }
}

const calculateXpForLevel = (level) => 5 * level ** 2 + 50 * level + 100;

async function getOrCreateUserLevel(guildId, userId, username, userAvatarUrl) {
  try {
    const response = await databases.listDocuments(
      DATABASE_ID,
      USER_LEVELS_COLLECTION_ID,
      [Query.equal("guildId", guildId), Query.equal("userId", userId)]
    );
    if (response.documents.length > 0) {
      return response.documents[0];
    } else {
      return await databases.createDocument(
        DATABASE_ID,
        USER_LEVELS_COLLECTION_ID,
        ID.unique(),
        {
          guildId,
          userId,
          username,
          userAvatarUrl,
          level: 0,
          xp: 0,
        }
      );
    }
  } catch (e) {
    console.error(
      `Failed to get/create user level for ${username}:`,
      e.message
    );
    return null;
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  console.log("Syncing server list with database...");
  for (const guild of client.guilds.cache.values()) {
    try {
      const existing = await databases.listDocuments(
        DATABASE_ID,
        SERVERS_COLLECTION_ID,
        [Query.equal("guildId", guild.id)]
      );
      const serverData = { name: guild.name, iconUrl: guild.iconURL() || "" };
      if (existing.documents.length === 0) {
        console.log(`  -> Adding new server: ${guild.name} (${guild.id})`);
        await databases.createDocument(
          DATABASE_ID,
          SERVERS_COLLECTION_ID,
          ID.unique(),
          { guildId: guild.id, ...serverData }
        );
      } else {
        await databases.updateDocument(
          DATABASE_ID,
          SERVERS_COLLECTION_ID,
          existing.documents[0].$id,
          serverData
        );
      }
    } catch (e) {
      console.error(`Failed to sync server ${guild.name}:`, e.message);
    }
  }

  await syncWithDatabase();

  try {
    const botInfoData = {
      name: client.user.username,
      avatarUrl: client.user.displayAvatarURL(),
    };
    const botInfoDocs = await databases.listDocuments(
      DATABASE_ID,
      BOT_INFO_COLLECTION_ID
    );
    if (botInfoDocs.documents.length > 0) {
      await databases.updateDocument(
        DATABASE_ID,
        BOT_INFO_COLLECTION_ID,
        botInfoDocs.documents[0].$id,
        botInfoData
      );
    } else {
      await databases.createDocument(
        DATABASE_ID,
        BOT_INFO_COLLECTION_ID,
        "main_bot_info",
        botInfoData
      );
    }
    const statusData = { lastSeen: new Date().toISOString() };
    const statusDocs = await databases.listDocuments(
      DATABASE_ID,
      SYSTEM_STATUS_COLLECTION_ID
    );
    if (statusDocs.documents.length > 0) {
      await databases.updateDocument(
        DATABASE_ID,
        SYSTEM_STATUS_COLLECTION_ID,
        statusDocs.documents[0].$id,
        statusData
      );
    } else {
      await databases.createDocument(
        DATABASE_ID,
        SYSTEM_STATUS_COLLECTION_ID,
        "main_status",
        statusData
      );
    }
  } catch (e) {
    console.error("Failed to update bot info/status on startup:", e.message);
  }

  setInterval(syncWithDatabase, 30000);
  setInterval(async () => {
    try {
      const statusDocs = await databases.listDocuments(
        DATABASE_ID,
        SYSTEM_STATUS_COLLECTION_ID
      );
      if (statusDocs.documents.length > 0) {
        await databases.updateDocument(
          DATABASE_ID,
          SYSTEM_STATUS_COLLECTION_ID,
          statusDocs.documents[0].$id,
          { lastSeen: new Date().toISOString() }
        );
      }
    } catch (e) {
      console.error("Failed to update system status heartbeat:", e.message);
    }
  }, 30000);

  console.log(
    "✅ Bot is ready and will sync with the database every 30 seconds."
  );
});

client.on("guildMemberAdd", async (member) => {
  const settings = guildSettings.get(member.guild.id);
  if (!settings) return;
  if (settings.welcomeMessageEnabled) {
    try {
      const channel = await client.channels.fetch(settings.welcomeChannelId);
      if (channel?.isTextBased()) {
        await channel.send(
          settings.welcomeMessage.replace("{user}", member.toString())
        );
      }
    } catch (e) {
      console.error("Welcome message failed:", e.message);
    }
  }
  if (settings.autoRoleEnabled && settings.autoRoleRoleId) {
    try {
      const role = await member.guild.roles.fetch(settings.autoRoleRoleId);
      if (role) await member.roles.add(role);
    } catch (e) {
      console.error("Auto-role failed:", e.message);
    }
  }
  await logAuditEvent(
    member.guild.id,
    "USER_JOINED",
    member.user,
    `User ${member.user.tag} joined.`
  );
});

client.on("guildMemberRemove", async (member) => {
  const settings = guildSettings.get(member.guild.id);
  if (!settings) return;
  if (settings.goodbyeMessageEnabled && settings.goodbyeChannelId) {
    try {
      const channel = await client.channels.fetch(settings.goodbyeChannelId);
      if (channel?.isTextBased()) {
        await channel.send(
          settings.goodbyeMessage.replace("{user}", `**${member.user.tag}**`)
        );
      }
    } catch (e) {
      console.error("Goodbye message failed:", e.message);
    }
  }
  await logAuditEvent(
    member.guild.id,
    "USER_LEFT",
    member.user,
    `User ${member.user.tag} left.`
  );
});

client.on("messageDelete", async (message) => {
  if (message.author?.bot || !message.content || !message.guild) return;
  const content =
    message.content.length > 1000
      ? message.content.substring(0, 1000) + "..."
      : message.content;
  const logContent = `Message by ${message.author.tag} deleted in #${message.channel.name}:\n"${content}"`;
  await logAuditEvent(
    message.guild.id,
    "MESSAGE_DELETED",
    message.author,
    logContent
  );
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content || !message.guild) return;

  const settings = guildSettings.get(message.guild.id);

  if (settings?.aiAutoModEnabled && geminiService) {
    const moderationResponse = await geminiService.moderateContent(
      message.content
    );
    if (moderationResponse === "FLAG") {
      try {
        await message.delete();
        await message.author.send(
          `Your message in **${message.guild.name}** was automatically removed for potentially violating server rules.`
        );
        await logAuditEvent(
          message.guild.id,
          "AI_MODERATION",
          client.user,
          `Deleted message from ${message.author.tag} for potential violation.\nContent: "${message.content}"`
        );
        return;
      } catch (e) {
        console.error(
          `Failed to execute AI moderation for user ${message.author.tag}:`,
          e.message
        );
      }
    }
  }

  if (
    settings?.levelingEnabled &&
    !settings.levelingBlacklistedChannels.includes(message.channel.id)
  ) {
    const now = Date.now();
    const cooldown = (settings.levelingCooldownSeconds || 60) * 1000;
    const userCooldownKey = `${message.guild.id}-${message.author.id}`;
    const userCooldown = xpCooldowns.get(userCooldownKey);

    if (!userCooldown || now - userCooldown > cooldown) {
      xpCooldowns.set(userCooldownKey, now);
      const userLevelData = await getOrCreateUserLevel(
        message.guild.id,
        message.author.id,
        message.author.tag,
        message.author.displayAvatarURL()
      );

      if (userLevelData) {
        const minXp = settings.levelingXpPerMessageMin || 15;
        const maxXp = settings.levelingXpPerMessageMax || 25;
        const xpToAdd = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
        userLevelData.xp += xpToAdd;

        const xpForNextLevel = calculateXpForLevel(userLevelData.level + 1);
        if (userLevelData.xp >= xpForNextLevel) {
          userLevelData.level += 1;

          if (settings.levelUpChannelId) {
            try {
              const channel = await client.channels.fetch(
                settings.levelUpChannelId
              );
              if (channel?.isTextBased()) {
                const levelUpMsg = (
                  settings.levelUpMessage ||
                  "🎉 GG {user}, you just reached level **{level}**!"
                )
                  .replace("{user}", message.author.toString())
                  .replace("{level}", userLevelData.level.toString());
                await channel.send(levelUpMsg);
              }
            } catch (e) {
              console.error("Level up message failed:", e.message);
            }
          }

          const reward = settings.levelingRoleRewards.find(
            (r) => r.level === userLevelData.level
          );
          if (reward) {
            try {
              const role = await message.guild.roles.fetch(reward.roleId);
              if (role) {
                await message.member.roles.add(role);
                console.log(
                  `Awarded role ${role.name} to ${message.author.tag} for reaching level ${userLevelData.level}`
                );
              }
            } catch (e) {
              console.error(
                `Failed to apply role reward ${reward.roleId}:`,
                e.message
              );
            }
          }
        }

        await databases.updateDocument(
          DATABASE_ID,
          USER_LEVELS_COLLECTION_ID,
          userLevelData.$id,
          {
            xp: userLevelData.xp,
            level: userLevelData.level,
            username: message.author.tag,
            userAvatarUrl: message.author.displayAvatarURL(),
          }
        );
      }
    }
  }

  const statsDoc = await getOrCreateStatsDoc(message.guild.id);
  if (statsDoc) {
    const dayIndex = new Date().getDay();
    const weeklyData = JSON.parse(statsDoc.messagesWeekly);
    weeklyData[dayIndex].count = (weeklyData[dayIndex].count || 0) + 1;
    await databases.updateDocument(
      DATABASE_ID,
      STATS_COLLECTION_ID,
      statsDoc.$id,
      {
        messagesToday: statsDoc.messagesToday + 1,
        messagesWeekly: JSON.stringify(weeklyData),
      }
    );
  }

  if (!message.content.startsWith(COMMAND_PREFIX)) return;
  const args = message.content.slice(COMMAND_PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const commands = guildCustomCommands.get(message.guild.id);

  // --- Built-in Commands ---
  if (commandName === "help") {
    const builtInCommands = [
      { name: "!help", description: "Shows this list of commands." },
      { name: "!leaderboard", description: "Displays the server leaderboard." },
    ];

    const customCommandList = commands
      ? commands.map((_, name) => `\`!${name}\``).join(", ")
      : "No custom commands set.";

    const embed = new EmbedBuilder()
      .setColor("#5865F2")
      .setTitle(`Commands for ${message.guild.name}`)
      .addFields(
        {
          name: "Built-in Commands",
          value: builtInCommands
            .map((c) => `**${c.name}**: ${c.description}`)
            .join("\n"),
        },
        { name: "Custom Commands", value: customCommandList }
      );

    message.channel.send({ embeds: [embed] });
    await logCommandUsage(message.guild.id, `!help`, message.author);
    return;
  }

  if (commandName === "leaderboard") {
    try {
      const leaderboardData = await databases.listDocuments(
        DATABASE_ID,
        USER_LEVELS_COLLECTION_ID,
        [
          Query.equal("guildId", message.guild.id),
          Query.orderDesc("level"),
          Query.orderDesc("xp"),
          Query.limit(10), // Top 10 users
        ]
      );

      const embed = new EmbedBuilder()
        .setColor("#FFD700") // Gold color
        .setTitle(`🏆 Leaderboard for ${message.guild.name}`)
        .setTimestamp();

      if (leaderboardData.documents.length === 0) {
        embed.setDescription(
          "No one has earned any XP yet. Start chatting to get on the board!"
        );
      } else {
        const rankEmojis = ["🥇", "🥈", "🥉"];
        const leaderboardString = leaderboardData.documents
          .map((user, index) => {
            const rank = index + 1;
            const rankDisplay = rank <= 3 ? rankEmojis[index] : `**#${rank}**`;
            return `${rankDisplay} <@${user.userId}> - Level **${
              user.level
            }** (${user.xp.toLocaleString()} XP)`;
          })
          .join("\n");
        embed.setDescription(leaderboardString);
      }

      await message.channel.send({ embeds: [embed] });
      await logCommandUsage(message.guild.id, `!leaderboard`, message.author);
    } catch (error) {
      console.error(
        `Error fetching leaderboard for guild ${message.guild.id}:`,
        error
      );
      message.channel.send(
        "Sorry, I was unable to fetch the leaderboard at this time."
      );
    }
    return;
  }

  // --- Custom Commands ---
  const customCommandResponse = commands?.get(commandName);
  if (customCommandResponse) {
    await message.channel.send(customCommandResponse);
    await logCommandUsage(
      message.guild.id,
      `${COMMAND_PREFIX}${commandName}`,
      message.author
    );
  }
});

async function checkYouTube() {
  const allSubs = await databases.listDocuments(
    DATABASE_ID,
    YOUTUBE_SUBSCRIPTIONS_COLLECTION_ID,
    [Query.limit(5000)]
  );
  if (allSubs.total === 0) return;
  for (const sub of allSubs.documents) {
    try {
      if (!sub.youtubeChannelName) {
        const name = await fetchYoutubeChannelName(sub.youtubeChannelId);
        if (name) {
          console.log(`  -> Fetched missing YouTube channel name: ${name}`);
          await databases.updateDocument(
            DATABASE_ID,
            YOUTUBE_SUBSCRIPTIONS_COLLECTION_ID,
            sub.$id,
            { youtubeChannelName: name }
          );
          sub.youtubeChannelName = name;
        }
      }
      if (!sub.discordChannelName) {
        try {
          const channel = await client.channels.fetch(sub.discordChannelId);
          if (channel) {
            console.log(
              `  -> Fetched missing Discord channel name: #${channel.name}`
            );
            await databases.updateDocument(
              DATABASE_ID,
              YOUTUBE_SUBSCRIPTIONS_COLLECTION_ID,
              sub.$id,
              { discordChannelName: channel.name }
            );
            sub.discordChannelName = channel.name;
          }
        } catch (e) {}
      }
      const response = await fetch(
        `https://www.youtube.com/feeds/videos.xml?channel_id=${sub.youtubeChannelId}`
      );
      if (!response.ok) continue;
      const text = await response.text();
      const videoIdMatch = text.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const videoTitleMatch = text.match(/<entry>.*?<title>(.*?)<\/title>/);
      const newVideoId = videoIdMatch?.[1];
      const videoTitle = videoTitleMatch?.[1] || "A new video";
      if (newVideoId && newVideoId !== sub.latestVideoId) {
        console.log(
          `New video found for ${
            sub.youtubeChannelName || sub.youtubeChannelId
          }: ${newVideoId}`
        );
        const channel = await client.channels.fetch(sub.discordChannelId);
        if (channel?.isTextBased()) {
          const videoUrl = `https://www.youtube.com/watch?v=${newVideoId}`;
          const mention = sub.mentionRoleId
            ? `<@&${sub.mentionRoleId}>`
            : "@everyone";

          // Check if the video is a live stream based on title keywords
          const isLive = /\[live]|live|livestream|🔴/i.test(videoTitle);

          const defaultUploadMessage =
            "📢 Hey {mention}! {channelName} just uploaded a new video!\n\n**{videoTitle}**\n{videoUrl}";
          const defaultLiveMessage =
            "🔴 Hey {mention}! {channelName} is now LIVE!\n\n**{videoTitle}**\n{videoUrl}";

          const messageTemplate = isLive
            ? sub.liveMessage || defaultLiveMessage
            : sub.customMessage || defaultUploadMessage;

          const messageContent = messageTemplate
            .replace("{mention}", mention)
            .replace(
              "{channelName}",
              `**${sub.youtubeChannelName || sub.youtubeChannelId}**`
            )
            .replace("{videoTitle}", videoTitle.trim())
            .replace("{videoUrl}", videoUrl);

          await channel.send(messageContent);
          const dataToUpdate = {
            latestVideoId: newVideoId,
            latestVideoTitle: videoTitle,
            lastVideoTimestamp: new Date().toISOString(),
          };
          await databases.updateDocument(
            DATABASE_ID,
            YOUTUBE_SUBSCRIPTIONS_COLLECTION_ID,
            sub.$id,
            dataToUpdate
          );
        }
      }
    } catch (error) {
      console.error(
        `YouTube Check Error for ${sub.youtubeChannelId}:`,
        error.message
      );
    }
  }
}
cron.schedule("*/5 * * * *", checkYouTube);

async function updateAllServerStats() {
  console.log(
    `[${new Date().toLocaleTimeString()}] Running scheduled server stats update...`
  );
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.members.fetch();
      const memberCount = guild.memberCount;
      const onlineCount = guild.members.cache.filter(
        (m) =>
          m.presence?.status === "online" ||
          m.presence?.status === "dnd" ||
          m.presence?.status === "idle"
      ).size;
      const commandCount = guildCustomCommands.get(guild.id)?.size || 0;
      const statsDoc = await getOrCreateStatsDoc(guild.id);
      if (statsDoc) {
        await databases.updateDocument(
          DATABASE_ID,
          STATS_COLLECTION_ID,
          statsDoc.$id,
          { memberCount, onlineCount, commandCount }
        );
      }
    } catch (error) {
      console.error(
        `Failed to update server stats for ${guild.name}:`,
        error.message
      );
    }
  }
}
cron.schedule("*/5 * * * *", updateAllServerStats);

cron.schedule(
  "0 0 * * *",
  async () => {
    console.log("Resetting daily message counts...");
    try {
      const allStats = await databases.listDocuments(
        DATABASE_ID,
        STATS_COLLECTION_ID,
        [Query.limit(5000)]
      );
      for (const doc of allStats.documents) {
        const updates = { messagesToday: 0 };
        const dayOfWeek = new Date().getDay();
        if (dayOfWeek === 1) {
          // Monday, reset the week
          const weeklyData = JSON.parse(doc.messagesWeekly);
          weeklyData.forEach((day) => (day.count = 0));
          updates.messagesWeekly = JSON.stringify(weeklyData);
        }
        await databases.updateDocument(
          DATABASE_ID,
          STATS_COLLECTION_ID,
          doc.$id,
          updates
        );
      }
      console.log("Daily message count reset complete.");
    } catch (e) {
      console.error("Failed to reset daily message counts:", e.message);
    }
  },
  { scheduled: true, timezone: "UTC" }
);

async function processModerationQueue() {
  try {
    const { documents } = await databases.listDocuments(
      DATABASE_ID,
      MODERATION_QUEUE_COLLECTION_ID
    );
    if (documents.length === 0) return;
    for (const action of documents) {
      try {
        const guild = await client.guilds.fetch(action.guildId);
        const member = await guild.members.fetch(action.targetUserId);
        const initiator = await guild.members.fetch(action.initiatorId);
        if (action.actionType === "kick") {
          await member.kick(action.reason || "No reason provided.");
          await logAuditEvent(
            action.guildId,
            "USER_KICKED",
            initiator.user,
            `Kicked user ${member.user.tag}. Reason: ${action.reason || "None"}`
          );
        } else if (action.actionType === "ban") {
          await member.ban({ reason: action.reason || "No reason provided." });
          await logAuditEvent(
            action.guildId,
            "USER_BANNED",
            initiator.user,
            `Banned user ${member.user.tag}. Reason: ${action.reason || "None"}`
          );
        }
        await databases.deleteDocument(
          DATABASE_ID,
          MODERATION_QUEUE_COLLECTION_ID,
          action.$id
        );
      } catch (err) {
        console.error(
          `Failed to process mod action ${action.$id} for user ${action.targetUsername}:`,
          err.message
        );
        await databases.deleteDocument(
          DATABASE_ID,
          MODERATION_QUEUE_COLLECTION_ID,
          action.$id
        );
      }
    }
  } catch (e) {
    console.error("Error processing moderation queue:", e.message);
  }
}
cron.schedule("*/10 * * * * *", processModerationQueue);

async function syncGuildMembers() {
  console.log(
    `[${new Date().toLocaleTimeString()}] Syncing guild members to database...`
  );
  for (const guild of client.guilds.cache.values()) {
    try {
      const members = await guild.members.fetch();
      for (const member of members.values()) {
        if (member.user.bot) continue;
        const memberData = {
          guildId: guild.id,
          userId: member.id,
          username: member.user.tag,
          userAvatarUrl: member.user.displayAvatarURL(),
          joinedAt: member.joinedAt.toISOString(),
        };
        const existing = await databases.listDocuments(
          DATABASE_ID,
          MEMBERS_COLLECTION_ID,
          [Query.equal("guildId", guild.id), Query.equal("userId", member.id)]
        );
        if (existing.documents.length === 0) {
          await databases.createDocument(
            DATABASE_ID,
            MEMBERS_COLLECTION_ID,
            ID.unique(),
            memberData
          );
        } else {
          await databases.updateDocument(
            DATABASE_ID,
            MEMBERS_COLLECTION_ID,
            existing.documents[0].$id,
            memberData
          );
        }
      }
    } catch (error) {
      console.error(
        `Failed to sync members for guild ${guild.name}:`,
        error.message
      );
    }
  }
}
cron.schedule("0 * * * *", syncGuildMembers);

async function syncServerMetadata() {
  console.log(
    `[${new Date().toLocaleTimeString()}] Syncing server metadata (channels & roles)...`
  );
  for (const guild of client.guilds.cache.values()) {
    try {
      await guild.channels.fetch();
      await guild.roles.fetch();

      const channels = guild.channels.cache
        .filter((c) => c.type === 0) // TEXT CHANNELS ONLY
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const roles = guild.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => ({ id: r.id, name: r.name, color: r.color }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const metadata = {
        guildId: guild.id,
        channels: JSON.stringify(channels),
        roles: JSON.stringify(roles),
      };

      const existing = await databases.listDocuments(
        DATABASE_ID,
        SERVER_METADATA_COLLECTION_ID,
        [Query.equal("guildId", guild.id)]
      );
      if (existing.documents.length === 0) {
        await databases.createDocument(
          DATABASE_ID,
          SERVER_METADATA_COLLECTION_ID,
          ID.unique(),
          metadata
        );
      } else {
        await databases.updateDocument(
          DATABASE_ID,
          SERVER_METADATA_COLLECTION_ID,
          existing.documents[0].$id,
          metadata
        );
      }
    } catch (error) {
      console.error(
        `Failed to sync metadata for guild ${guild.name}:`,
        error.message
      );
    }
  }
}
cron.schedule("*/5 * * * *", syncServerMetadata); // Every 5 minutes

client.login(BOT_TOKEN).catch((error) => {
  console.error("Failed to login to Discord. Please check your BOT_TOKEN.");
  console.error(error.message);
  process.exit(1);
});
