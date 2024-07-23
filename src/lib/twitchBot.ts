import _ from 'lodash';
import colors from 'chalk';
import { Chat } from 'twitch-js';
import { Database, OPEN_READWRITE } from 'sqlite3';

import { env } from '$lib/env';

// Function to start the Twitch bot
export function startTwitchBot(): void {
    // Sqlite3 initialization
    const db = new Database('sqlite3_db', OPEN_READWRITE, (err) => {
        if (err) {
            console.error(colors.red('Error opening database:', err.message));
        }
        db.run('CREATE TABLE IF NOT EXISTS chat_user_stats (Channel TEXT, UserName TEXT UNIQUE, MessageCount INT)', VOID_CALLBACK);
    });

    // Toggle ability to send real messages to Twitch channels
    const DRY_RUN = false;

    // Configure hype parameters
    const HYPE_MIN_MSG_LEN = 1;
    const HYPE_MAX_MSG_LEN = 256;
    const HYPE_MAX_QUEUE_LEN = 10;
    const HYPE_THRESHOLD = 5;
    const HYPE_THROTTLE = 30000;
    const HYPE_DEQUEUE_TIMER = HYPE_THROTTLE * 2;
    const MSG_SEND_DELAY = 150;
    const HYPE_USER_IGNORE_LIST = ['nightbot'];

    const TWITCH_PREFERENCES = {
        channels: ['squishy_life', 'northernlion'],
        credentials: {
            username: env.TWITCH_USERNAME?.toLowerCase() ?? '',
            token: env.TWITCH_PASSWORD ?? ''
        }
    };

    // Regex for detecting a URI
    const REGEX_CONTAINS_URI = new RegExp('(http|ftp|https)://([\\w_-]+(?:\\.[\\w_-]+)+)([\\w.,@?^=%&:/~+#-]*[\\w@?^=%&/~+#-])');

    interface MessageQueue {
        [channel: string]: string[];
    }

    let messageQueues: MessageQueue = {};

    // Create an instance of TwitchJS.
    const chat = new Chat({
        username: TWITCH_PREFERENCES.credentials.username,
        token: TWITCH_PREFERENCES.credentials.token,
        log: { level: 'error' }
    });

    // Extends TwitchJS functionality with addition of a limiter to queue message sending processes
    chat.say = limiter((msg: string, channel: string) => {
        if (DRY_RUN) {
            console.log(`${colors.gray(getFormattedTime())} ${msg} -- (DRY RUN ENABLED)`);
            return;
        }

        setTimeout(() => {
            chat.send(`PRIVMSG #${channel} :${msg}`);
        }, MSG_SEND_DELAY);
    }, 1500);

    const getFormattedTime = (): string =>
        `[${new Date().toLocaleString('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: true
        })}]`;

    function limiter(fn: (...args: any[]) => void, wait: number): (...args: any[]) => void {
        let isCalled = false;
        const calls: Array<() => void> = [];

        const caller = function () {
            if (calls.length && !isCalled) {
                isCalled = true;
                calls.shift()!.call();
                setTimeout(() => {
                    isCalled = false;
                    caller();
                }, wait);
            }
        };

        return function (...args: any[]) {
            calls.push(fn.bind(this, ...args));
            caller();
        };
    }

    function VOID_CALLBACK(): null {
        return null;
    }

    function sendHypeMessage(channel: string, message: string): void {
        recordUserChatStats(channel, TWITCH_PREFERENCES.credentials.username);

        console.log(`${colors.gray(getFormattedTime())} '${channel}': "${message}".`);
        chat.say(message, channel);
    }

    const sendHypeMessageThrottled = _.throttle(sendHypeMessage, HYPE_THROTTLE, { trailing: false });

    function detectHype(channel: string): void {
        const messageCounts: { [message: string]: number } = {};

        for (const message of messageQueues[channel]) {
            if (!Number.isInteger(messageCounts[message])) messageCounts[message] = 0;

            messageCounts[message] += 1;

            if (messageCounts[message] >= HYPE_THRESHOLD) {
                messageQueues[channel] = [];
                sendHypeMessageThrottled(channel, message);
                return;
            }
        }
    }

    function startDequeueDisposalProcess(): void {
        setInterval(() => {
            messageQueues = {};
        }, HYPE_DEQUEUE_TIMER);
    }

    function enqueueChatMessage(
        channel: string,
        username: string,
        message: string,
        isModerator: boolean,
        emote: string | null = null
    ): void {
        message = emote ? emote : message;

        if (filterEnqueueMessage(channel, username, message, isModerator)) return;

        recordUserChatStats(channel, username);

        if (!Array.isArray(messageQueues[channel])) messageQueues[channel] = [];

        if (messageQueues[channel].length >= HYPE_MAX_QUEUE_LEN) messageQueues[channel].shift();

        if (message.length >= HYPE_MIN_MSG_LEN && message.length <= HYPE_MAX_MSG_LEN) {
            messageQueues[channel].push(message);
            detectHype(channel);
        }
    }

    function filterEnqueueMessage(channel: string, username: string, message: string, isModerator: boolean): boolean {
        if (isModerator || HYPE_USER_IGNORE_LIST.includes(username.toLowerCase())) return true;

        if (message.charAt(0) === '!') return true;

        if (REGEX_CONTAINS_URI.test(message)) return true;

        return false;
    }

    function recordUserChatStats(channel: string, username: string): void {
        db.serialize(() => {
            let stmt = db.prepare('INSERT INTO chat_user_stats (Channel, UserName, MessageCount) VALUES (?, ?, 0)');
            stmt.run([channel, username], VOID_CALLBACK);
            stmt.finalize();

            stmt = db.prepare('UPDATE chat_user_stats SET MessageCount = MessageCount + 1 WHERE UserName = ?');
            stmt.run(username, VOID_CALLBACK);
            stmt.finalize();
        });
    }

    function handleMyMessage(channel: string, username: string, message: string): void {
        console.log(`${getFormattedTime()} <${colors.cyanBright(username)}> ${message}`);
    }

    function handleOtherMessage(channel: string, username: string, message: string): void {
        if (message.toLowerCase().includes('@' + TWITCH_PREFERENCES.credentials.username)) {
            const iterableMessage = message.split(' ').entries();

            let _message = '';

            for (let [index, word] of iterableMessage) {
                if (word.toLowerCase().includes('@' + TWITCH_PREFERENCES.credentials.username)) word = colors.whiteBright.bold(word);

                if (index > 0) _message += ' ';

                _message += word;
            }

            console.log(colors.bgRed(`${getFormattedTime()} <${username}> ${_message}`));
        }
    }

    chat.on('PRIVMSG', (msg) => {
        let emote: string | undefined;
        if (msg.tags.emotes?.length) {
            const { start, end } = msg.tags.emotes[0];
            emote = msg.message.substring(start, end + 1);
        }

        const channel = msg.channel.replace('#', '');
        const { username, message } = msg;

        if (!username || !message) return;

        const params = [channel, username, message];

        if (username === TWITCH_PREFERENCES.credentials.username) {
            handleMyMessage(...params);
        } else {
            handleOtherMessage(...params);
        }

        enqueueChatMessage(...params, msg.isModerator || false, emote || null);
    });

    chat.connect()
        .then(() => {
            for (const channel of TWITCH_PREFERENCES.channels) chat.join(channel);

            console.clear();
            console.log(colors.greenBright(`Connection established with @${env.TWITCH_USERNAME}\n`));

            startDequeueDisposalProcess();
        })
        .catch((err) => {
            console.error(colors.red('Error connecting to Twitch:', err.message));
        });
}
