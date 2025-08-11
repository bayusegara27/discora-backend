const { GoogleGenAI } = require('@google/genai');
const config = require('../config');

let geminiService = null;

if (config.GEMINI.API_KEY && !config.GEMINI.API_KEY.includes('YOUR_GEMINI_API_KEY')) {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI.API_KEY });
    geminiService = {
        moderateContent: async (content) => {
            try {
                const systemInstruction = "You are an AI moderator for a Discord server. Your task is to determine if a message violates community guidelines (e.g., contains hate speech, spam, explicit content, or excessive toxicity). Respond with only one of two words: 'FLAG' if the message is inappropriate, or 'OK' if the message is acceptable. Do not provide any explanation or other text.";
                const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: content, config: { systemInstruction } });
                return response.text.trim();
            } catch (error) {
                console.error(`[Gemini] Moderation call failed for content "${content.substring(0, 50)}...":`, error.message);
                return 'OK'; // Fail-safe to avoid false positives
            }
        }
    };
    console.log("✅ Gemini AI Auto-moderation service initialized.");
} else {
    console.warn("⚠️ Gemini API key not found or is a placeholder. AI Auto-moderation will be disabled.");
}

module.exports = geminiService;
