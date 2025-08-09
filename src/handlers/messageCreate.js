

const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const config = require('../config');
const geminiService = require('../services/gemini');
const { guildSettings, guildCustomCommands, xpCooldowns } = require('../utils/cache');
const { logAuditEvent, logCommandUsage } = require('../utils/loggers');
const { databases, Query } = require('../services/appwrite');
const { getOrCreateStatsDoc, calculateXpForLevel, getOrCreateUserLevel } = require('../utils/helpers');

const DB_ID = config.APPWRITE.DATABASE_ID;
const STATS_COLLECTION = config.APPWRITE.COLLECTIONS.STATS;
const USER_LEVELS_COLLECTION = config.APPWRITE.COLLECTIONS.USER_LEVELS;
const GIVEAWAYS_COLLECTION = config.APPWRITE.COLLECTIONS.GIVEAWAYS;

/**
 * Handles basic auto-moderation checks like banned words, links, and invites.
 * @param {import('discord.js').Message} message The message to check.
 * @param {object} settings The guild's settings object.
 * @returns {Promise<boolean>} True if the message was moderated, false otherwise.
 */
async function handleAutoMod(message, settings) {
    if (!settings?.autoMod) {
        return false;
    }

    // If enabled, bypass auto-moderation for administrators.
    if (settings.autoMod.ignoreAdmins && message.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return false;
    }

    const autoMod = settings.autoMod;
    let moderated = false;
    let reason = '';

    // Word Filter
    if (autoMod.wordFilterEnabled && Array.isArray(autoMod.wordBlacklist) && autoMod.wordBlacklist.length > 0) {
        const bannedWord = autoMod.wordBlacklist.find(word => new RegExp(`\\b${word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(message.content));
        if (bannedWord) {
            moderated = true;
            reason = `it contained a banned word ("${bannedWord}")`;
        }
    }

    // Invite Filter
    if (!moderated && autoMod.inviteFilterEnabled) {
        const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[^\s/]+?(?=\s|$)/i;
        if (inviteRegex.test(message.content)) {
            moderated = true;
            reason = 'it contained a Discord invite link';
        }
    }

    // Link Filter
    if (!moderated && autoMod.linkFilterEnabled) {
        const linkRegex = /https?:\/\/[^\s]+/i;
        if (linkRegex.test(message.content)) {
            moderated = true;
            reason = 'sending links is not permitted';
        }
    }

    // Mention Spam
    if (!moderated && autoMod.mentionSpamEnabled) {
        const mentionLimit = autoMod.mentionSpamLimit || 5;
        const uniqueMentions = new Set([...message.mentions.users.values(), ...message.mentions.roles.values()]);
        if (uniqueMentions.size > mentionLimit) {
            moderated = true;
            reason = `mentioning too many users/roles (${uniqueMentions.size} > ${mentionLimit})`;
        }
    }

    if (moderated) {
        console.log(`[AutoMod] Deleting message from ${message.author.tag} in ${message.guild.name}. Reason: ${reason}`);
        message.delete().catch(e => console.error(`[AutoMod] Failed to delete message ${message.id}:`, e.message));
        message.author.send(`Your message in **${message.guild.name}** was removed because ${reason}.`).catch(() => {
            console.log(`[AutoMod] Could not DM user ${message.author.tag} about deleted message.`);
        });
        logAuditEvent(message.guild.id, 'AUTO_MOD_ACTION', 'AutoMod', `Deleted message from ${message.author.tag} because ${reason}.`);
    }

    return moderated;
}

/**
 * Handles the XP and leveling system for a message.
 * @param {import('discord.js').Message} message The message that was sent.
 * @param {object} settings The guild's settings object.
 */
async function handleLeveling(message, settings) {
    if (!settings.leveling?.enabled || (Array.isArray(settings.leveling.blacklistedChannels) && settings.leveling.blacklistedChannels.includes(message.channel.id))) {
        return;
    }

    const now = Date.now();
    const cooldown = (settings.leveling.cooldownSeconds || 60) * 1000;
    const userCooldownKey = `${message.guild.id}-${message.author.id}`;
    const userCooldown = xpCooldowns.get(userCooldownKey);
    
    if (!userCooldown || now - userCooldown > cooldown) {
        xpCooldowns.set(userCooldownKey, now);
        const userLevelData = await getOrCreateUserLevel(message.guild.id, message.author.id, message.author.tag, message.author.displayAvatarURL());
        
        if (userLevelData) {
            const minXp = settings.leveling.xpPerMessageMin || 15;
            const maxXp = settings.leveling.xpPerMessageMax || 25;
            const xpToAdd = Math.floor(Math.random() * (maxXp - minXp + 1)) + minXp;
            const newTotalXp = userLevelData.xp + xpToAdd;
            
            console.log(`[XP] Awarded ${xpToAdd} XP to ${message.author.tag} in ${message.guild.name}. Total: ${newTotalXp}`);

            let newLevel = userLevelData.level;
            let leveledUp = false;
            while (newTotalXp >= calculateXpForLevel(newLevel + 1)) {
                newLevel++;
                leveledUp = true;
            }
            
            if (leveledUp) {
                console.log(`[LevelUp] ${message.author.tag} reached level ${newLevel} in ${message.guild.name}!`);
                
                if (settings.leveling.channelId) {
                    try {
                        const channel = await message.client.channels.fetch(settings.leveling.channelId);
                        if (channel?.isTextBased()) {
                            const levelUpMsg = (settings.leveling.message || "🎉 GG {user}, you just reached level **{level}**!")
                                .replace('{user}', message.author.toString())
                                .replace('{level}', newLevel.toString());
                            await channel.send(levelUpMsg);
                        }
                    } catch(e) { console.error(`[LevelUp] Failed to send level up announcement for ${message.author.tag} in guild ${message.guild.name}:`, e.message) }
                }
                
                const reward = settings.leveling.roleRewards?.find(r => r.level === newLevel);
                if (reward) {
                    try {
                        const role = await message.guild.roles.fetch(reward.roleId);
                        if (role) {
                            await message.member.roles.add(role);
                            console.log(`[LevelUp] Awarded role "${role.name}" to ${message.author.tag} for reaching level ${newLevel}`);
                        }
                    } catch (e) { console.error(`[LevelUp] Failed to apply role reward ${reward.roleId} to ${message.author.tag}:`, e.message) }
                }
            }
            
            await databases.updateDocument(DB_ID, USER_LEVELS_COLLECTION, userLevelData.$id, {
                xp: newTotalXp,
                level: newLevel,
                username: message.author.tag,
                userAvatarUrl: message.author.displayAvatarURL()
            }).catch(e => console.error(`[XP] Failed to update user level doc for ${message.author.tag}:`, e.message));
        }
    }
}

/**
 * Updates the message statistics for the guild.
 * @param {import('discord.js').Message} message The message that was sent.
 */
async function updateMessageStats(message) {
    const statsDoc = await getOrCreateStatsDoc(message.guild.id);
    if (statsDoc) {
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

            let weeklyData = [];
            try {
                const parsed = JSON.parse(statsDoc.messagesWeekly || '[]');
                if (Array.isArray(parsed)) {
                    weeklyData = parsed.filter(item => item && typeof item.date === 'string');
                }
            } catch { weeklyData = []; }

            const todayEntry = weeklyData.find(d => d.date === today);

            if (todayEntry) {
                todayEntry.count = (todayEntry.count || 0) + 1;
            } else {
                weeklyData.push({ date: today, count: 1 });
            }
            
            const prunedData = weeklyData.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

            await databases.updateDocument(DB_ID, STATS_COLLECTION, statsDoc.$id, {
                messagesToday: (statsDoc.messagesToday || 0) + 1,
                messagesWeekly: JSON.stringify(prunedData),
            });
            
        } catch (error) {
            console.error(`[Stats] Error updating message stats for guild ${message.guild.id}:`, error);
        }
    }
}


/**
 * Handles built-in commands like !help and !leaderboard.
 * @param {import('discord.js').Message} message The message containing the command.
 * @param {string} commandName The name of the command.
 * @param {string[]} args The arguments for the command.
 * @returns {Promise<boolean>} True if a built-in command was handled, false otherwise.
 */
async function handleBuiltInCommands(message, commandName, args) {
    const commands = guildCustomCommands.get(message.guild.id);

    if (commandName === 'help') {
        const builtInCommands = [
            { name: '!help', description: 'Shows this list of commands.' },
            { name: '!leaderboard', description: 'Displays the server leaderboard.' },
            { name: '!reroll <message_id>', description: 'Rerolls a giveaway winner (Admin only).' },
        ];
        const customCommandList = commands ? Array.from(commands.keys()).map(name => `\`!${name}\``).join(', ') : 'No custom commands set.';
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`Commands for ${message.guild.name}`)
            .addFields(
                { name: 'Built-in Commands', value: builtInCommands.map(c => `**${c.name}**: ${c.description}`).join('\n') },
                { name: 'Custom Commands', value: customCommandList }
            );
        message.channel.send({ embeds: [embed] });
        await logCommandUsage(message.guild.id, `!help`, message.author);
        console.log(`[CMD] Built-in command '!help' executed by ${message.author.tag} in ${message.guild.name}.`);
        return true;
    }

    if (commandName === 'reroll') {
        if (!message.member.permissions.has('ManageGuild')) {
            message.reply('You need the "Manage Server" permission to use this command.');
            return true;
        }
        const messageId = args[0];
        if (!messageId) {
            message.reply('Please provide the message ID of the giveaway to reroll.');
            return true;
        }
        
        try {
            const { endGiveaway } = require('../cron/giveawayEnd'); // Use require to avoid circular dependency
            const giveawayDocs = await databases.listDocuments(DB_ID, GIVEAWAYS_COLLECTION, [
                Query.equal('guildId', message.guild.id),
                Query.equal('messageId', messageId)
            ]);
            
            if (giveawayDocs.documents.length === 0) {
                message.reply('Could not find an ended giveaway with that message ID.');
                return true;
            }
            
            const giveaway = giveawayDocs.documents[0];
            if (giveaway.status !== 'ended') {
                message.reply('This giveaway has not ended yet.');
                return true;
            }
            
            await endGiveaway(giveaway.$id, true, message.client); // true for reroll
            message.reply(`Rerolling giveaway for **${giveaway.prize}**...`);
            console.log(`[CMD] Built-in command '!reroll' for giveaway ${giveaway.$id} executed by ${message.author.tag} in ${message.guild.name}.`);
        } catch (error) {
            console.error('[CMD] Reroll command error:', error);
            message.reply('An error occurred while trying to reroll the giveaway.');
        }
        return true;
    }

    if (commandName === 'leaderboard') {
        try {
            console.log(`[CMD] Fetching leaderboard for guild ${message.guild.name} (${message.guild.id})`);
            const leaderboardData = await databases.listDocuments(DB_ID, USER_LEVELS_COLLECTION, [
                Query.equal('guildId', message.guild.id),
                Query.orderDesc('level'),
                Query.orderDesc('xp'),
                Query.limit(10)
            ]);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 Leaderboard for ${message.guild.name}`)
                .setTimestamp();

            if (leaderboardData.documents.length === 0) {
                embed.setDescription('No one has earned any XP yet. Start chatting to get on the board!');
            } else {
                const rankEmojis = ['🥇', '🥈', '🥉'];
                const leaderboardString = leaderboardData.documents.map((user, index) => {
                    const rank = index + 1;
                    const rankDisplay = rank <= 3 ? rankEmojis[index] : `**#${rank}**`;
                    return `${rankDisplay} <@${user.userId}> - Level **${user.level}** (${user.xp.toLocaleString()} XP)`;
                }).join('\n');
                embed.setDescription(leaderboardString);
            }

            await message.channel.send({ embeds: [embed] });
            await logCommandUsage(message.guild.id, `!leaderboard`, message.author);
            console.log(`[CMD] Built-in command '!leaderboard' executed by ${message.author.tag} in ${message.guild.name}.`);
        } catch (error) {
            console.error(`[CMD] Error fetching leaderboard for guild ${message.guild.id}:`, error);
            message.channel.send('Sorry, I was unable to fetch the leaderboard at this time.');
        }
        return true;
    }

    return false;
}

/**
 * Handles custom commands created by users.
 * @param {import('discord.js').Message} message The message containing the command.
 * @param {string} commandName The name of the command.
 * @returns {Promise<boolean>} True if a custom command was handled, false otherwise.
 */
async function handleCustomCommands(message, commandName) {
    const commands = guildCustomCommands.get(message.guild.id);
    const customCommandData = commands?.get(commandName);

    if (customCommandData) {
        if (customCommandData.isEmbed) {
            try {
                const embedData = JSON.parse(customCommandData.embedContent);
                const embed = new EmbedBuilder()
                    .setTitle(embedData.title || null)
                    .setDescription(embedData.description || null)
                    .setColor(embedData.color || '#5865F2');
                await message.channel.send({ embeds: [embed] });
            } catch (e) {
                console.error(`[CMD] Failed to send embed for command !${commandName} in guild ${message.guild.id}:`, e.message);
                await message.channel.send("Sorry, there was an error displaying this embed command.");
            }
        } else {
            await message.channel.send(customCommandData.response);
        }
        await logCommandUsage(message.guild.id, `${config.COMMAND_PREFIX}${commandName}`, message.author);
        console.log(`[CMD] Custom command '!${commandName}' executed by ${message.author.tag} in ${message.guild.name}.`);
        return true;
    }
    return false;
}

/**
 * Main handler for the 'messageCreate' event.
 * @param {import('discord.js').Message} message The message that was created.
 */
async function onMessageCreate(message) {
    if (message.author.bot || !message.content || !message.guild) return;

    const settings = guildSettings.get(message.guild.id);
    if (!settings) return;

    // --- Moderation ---
    const wasModerated = await handleAutoMod(message, settings);
    if (wasModerated) return;

    if (settings.autoMod?.aiEnabled && geminiService) {
        const moderationResponse = await geminiService.moderateContent(message.content);
        if (moderationResponse === 'FLAG') {
            console.log(`[AI Mod] Flagged and deleted message from ${message.author.tag} in ${message.guild.name}.`);
            message.delete().catch(e => console.error(`[AI Mod] Failed to delete message ${message.id}:`, e.message));
            message.author.send(`Your message in **${message.guild.name}** was automatically removed for potentially violating server rules.`).catch(()=>{
                console.log(`[AI Mod] Could not DM user ${message.author.tag} about flagged message.`);
            });
            logAuditEvent(message.guild.id, 'AI_MODERATION', 'AutoMod', `Deleted message from ${message.author.tag} for potential violation.\nContent: "${message.content}"`);
            return;
        }
    }

    // --- Leveling and Stats ---
    await handleLeveling(message, settings);
    await updateMessageStats(message);

    // --- Command Handling ---
    if (!message.content.startsWith(config.COMMAND_PREFIX)) return;
    
    const args = message.content.slice(config.COMMAND_PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    const builtInHandled = await handleBuiltInCommands(message, commandName, args);
    if (builtInHandled) return;

    const customHandled = await handleCustomCommands(message, commandName);
    if (customHandled) return;
}

module.exports = onMessageCreate;
