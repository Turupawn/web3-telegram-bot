require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { ethers } = require("ethers");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const requiredTokenBalance = ethers.parseUnits("1000", 18); // Required balance of 1000 SRC tokens
const tokenAddress = "0xd29687c813D741E2F938F4aC377128810E217b1b"; 
const rpcUrl = "https://rpc.ankr.com/scroll";
const provider = new ethers.JsonRpcProvider(rpcUrl);
const abi = ["function balanceOf(address owner) view returns (uint256)"];
const contract = new ethers.Contract(tokenAddress, abi, provider);
const CHAT_ID = process.env.CHAT_ID;

const pendingVerifications = new Map();

// Fetch bot info at startup
(async () => {
    try {
        bot.botInfo = await bot.getMe();
        console.log("\n🤖 Bot info loaded:", bot.botInfo);
    } catch (error) {
        console.error("❌ Failed to fetch bot info:", error.message);
        process.exit(1);
    }
})();

// Handle general messages
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const isGroup = msg.chat.type === "group" || msg.chat.type === "supergroup";
    const text = msg.text || "";
    
    // Look for an Ethereum address in the message
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    const match = ethAddressRegex.exec(text);

    console.log(msg);

    if (match) {
        const ethAddress = match[0];
        console.log("\n🔍 Ethereum Address Found:", ethAddress);

        try {
            const balance = await contract.balanceOf(ethAddress);
            const formattedBalance = ethers.formatUnits(balance, 18);
            console.log(`✅ Balance of ${ethAddress}: ${formattedBalance} tokens`);

            if (BigInt(balance) >= BigInt(requiredTokenBalance)) {
                console.log(`✅ User has at least 1000 SRC tokens.`);
                bot.sendMessage(chatId, `Balance for ${ethAddress}: ${formattedBalance} SRC tokens. You are good to go!`);
            } else {
                console.log(`❌ User does not have enough SRC tokens.`);
                bot.sendMessage(chatId, `Sorry, you need at least 1000 SRC tokens.`);
                // Optionally kick the user from the group if needed
                //if (isGroup) {
                    await bot.banChatMember(CHAT_ID, msg.from.id);
                    console.log(`✅ User ${msg.from.id} has been kicked out for insufficient balance.`);
                //}
            }
        } catch (error) {
            console.error("\n❌ Error fetching balance:");
            console.error({
                ethAddress,
                errorMessage: error.message,
                errorCode: error.code,
            });

            bot.sendMessage(chatId, "Error checking balance. Please try again.");
        }
    }

    // Additional logic for new members (only in groups)
    if (msg.new_chat_members) {
        console.log("\n🚀 New member(s) joined!");

        for (const member of msg.new_chat_members) {
            const userId = member.id;
            console.log(`\n🔹 Processing new member:`);
            console.log({
                userId,
                username: member.username || "No username",
                firstName: member.first_name,
                isBot: member.is_bot,
            });

            if (member.is_bot) {
                console.log(`❌ Ignoring bot user ${userId}`);
                continue;
            }

            try {
                console.log(`\n🔍 Checking bot admin status in chat ${chatId}...`);

                if (!bot.botInfo) {
                    console.warn("⚠️ bot.botInfo is undefined. Skipping verification.");
                    continue;
                }

                const botMember = await bot.getChatMember(chatId, bot.botInfo.id);
                console.log(`✅ Bot is in chat as: ${botMember.status}`);

                if (botMember.status !== "administrator") {
                    console.warn("⚠️ Bot is NOT an admin! Skipping direct message.");
                    continue;
                }

                console.log(`📩 Attempting to send DM to ${userId}...`);
                await bot.sendMessage(
                    userId,
                    "Welcome! Send me your Ethereum address so I can verify your token balance."
                );
                pendingVerifications.set(userId, chatId);
                console.log(`✅ Successfully sent welcome message to ${userId}`);

            } catch (error) {
                console.error("\n❌ Error sending message to user:");
                console.error({
                    chatId,
                    userId,
                    errorMessage: error.message,
                    errorCode: error.code,
                });

                if (error.code === "ETELEGRAM") {
                    console.log("⚠️ User has not started a DM with the bot. Sending message in group...");
                    await bot.sendMessage(
                        chatId,
                        `Welcome <a href="tg://user?id=${userId}">${member.first_name}</a>! Send me your Ethereum address to verify your token balance.`,
                        { parse_mode: "HTML" }
                    );
                }
            }
        }
    }
});

console.log("\n🚀 Bot is running...");