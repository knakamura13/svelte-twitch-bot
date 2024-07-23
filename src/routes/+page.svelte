<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';

	// Store to keep the log messages
    const logs = writable<string[]>([]);

    // Function to add a log message
    const addLog = (message: string) => {
        logs.update((currentLogs) => [...currentLogs, message]);
    };

    onMount(() => {
        // Simulate receiving messages from the bot
        const simulateBotMessages = () => {
            setTimeout(() => {
                const message = `[${new Date().toLocaleTimeString()}] Bot: Hello, World!`;
                addLog(message);
                simulateBotMessages();
            }, 5000);
        };

        simulateBotMessages();
    });
</script>

<section class="page">
    <div class="heading">Twitch Bot Log (demo)</div>

    <div class="log">
        {#if $logs.length}
            {#each $logs as log}
                <div class="log-message">{log}</div>
            {/each}
        {:else}
            <div class="log-message">No messages yet.</div>
        {/if}
    </div>
</section>

<style lang="scss">
  .heading {
    font-size: 2rem;
    margin-bottom: 1rem;
    color: #61dafb;
  }

  .log {
    width: 80%;
    max-width: 800px;
    background-color: #1e1e1e;
    border-radius: 8px;
    padding: 16px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .log-message {
    margin-bottom: 8px;
  }

  .log-message:last-child {
    margin-bottom: 0;
  }
</style>
