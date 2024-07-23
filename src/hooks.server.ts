import type { Handle } from '@sveltejs/kit';
import { startTwitchBot } from '$lib/twitchBot';

export const handle: Handle = async ({ event, resolve }) => {
    // Start the Twitch bot when the server starts
    startTwitchBot();

    // Proceed with the SvelteKit handling
    return resolve(event);
};
