<script lang="ts">
	import { sendChat } from '$lib/nazu/chat-client';
	import type { ChatMessage, ChatSource } from '$lib/nazu/types';
	import ChatMessageView from './ChatMessage.svelte';

	interface Turn {
		role: 'user' | 'assistant';
		content: string;
		sources: ChatSource[];
	}

	let input = $state('');
	let turns = $state<Turn[]>([]);
	let busy = $state(false);
	let errorMsg = $state('');

	async function ask(e: Event) {
		e.preventDefault();
		const q = input.trim();
		if (!q || busy) return;
		input = '';
		errorMsg = '';
		busy = true;

		turns.push({ role: 'user', content: q, sources: [] });
		turns.push({ role: 'assistant', content: '', sources: [] });
		// Index of the assistant turn we stream into. Mutate via `turns[idx]` (not a
		// captured reference) so Svelte's deep-state proxy tracks the updates.
		const idx = turns.length - 1;

		const history: ChatMessage[] = turns
			.slice(0, idx)
			.map((t) => ({ role: t.role, content: t.content }));

		await sendChat(history, {
			onSources: (s) => {
				turns[idx].sources = s;
			},
			onDelta: (t) => {
				turns[idx].content += t;
			},
			onError: (m) => {
				errorMsg = m;
			}
		});
		busy = false;
	}
</script>

<div class="label-sm text-on-surface-faint mb-4">Ask</div>
<form onsubmit={ask}>
	<div class="relative">
		<input
			bind:value={input}
			type="text"
			placeholder="Ask your second brain…"
			disabled={busy}
			class="display-lg w-full bg-transparent text-on-surface outline-none border-none caret-primary disabled:opacity-60"
			style="font-size: clamp(1.5rem, 4vw, 3rem);"
		/>
		<button
			type="submit"
			disabled={busy}
			class="absolute right-0 top-1/2 -translate-y-1/2 text-on-surface-faint hover:text-primary transition-colors p-2 disabled:opacity-40"
			aria-label="Ask"
		>
			⌕
		</button>
	</div>
	<div class="h-px bg-surface-high mt-4 relative">
		<div
			class="absolute inset-0 bg-gradient-to-r from-primary/40 to-transparent transition-opacity {input
				? 'opacity-100'
				: 'opacity-0'}"
		></div>
	</div>
</form>

{#if errorMsg}
	<div class="label-sm text-on-surface-faint mt-6">{errorMsg}</div>
{/if}

{#if turns.length > 0}
	<div class="flex flex-col gap-6 mt-8">
		{#each turns as turn, i (i)}
			<ChatMessageView
				role={turn.role}
				content={turn.content}
				sources={turn.sources}
				streaming={busy && i === turns.length - 1}
			/>
		{/each}
	</div>
{/if}
