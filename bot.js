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

(async () => {
    try {
        bot.botInfo = await bot.getMe();
    } catch (error) {
        process.exit(1);
    }
})();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || "";
    const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
    const match = ethAddressRegex.exec(text);
    if (match) {
        const ethAddress = match[0];
        try {
            const balance = await contract.balanceOf(ethAddress);
            const formattedBalance = ethers.formatUnits(balance, 18);
            if (BigInt(balance) >= BigInt(requiredTokenBalance)) {
                bot.sendMessage(chatId, `Balance for ${ethAddress}: ${formattedBalance} SRC tokens. You are good to go!`);
            } else {
                bot.sendMessage(chatId, `Sorry, you need at least 1000 SRC tokens.`);
                await bot.banChatMember(CHAT_ID, msg.from.id);
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
    if (msg.new_chat_members) {
        for (const member of msg.new_chat_members) {
            const userId = member.id;
            if (member.is_bot) {
                continue;
            }
            try {
                if (!bot.botInfo) {
                    continue;
                }
                const botMember = await bot.getChatMember(chatId, bot.botInfo.id);
                if (botMember.status !== "administrator") {
                    continue;
                }
                await bot.sendMessage(
                    userId,
                    "Welcome! Send me your Ethereum address so I can verify your token balance."
                );
                pendingVerifications.set(userId, chatId);
            } catch (error) {
                console.error({
                    chatId,
                    userId,
                    errorMessage: error.message,
                    errorCode: error.code,
                });
                if (error.code === "ETELEGRAM") {
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
console.log("\nBot is running...");