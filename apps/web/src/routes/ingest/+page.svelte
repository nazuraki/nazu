<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types.js';

	let { form }: { form: ActionData } = $props();

	const TYPES = ['article', 'note', 'reference', 'research'];

	let submitting = $state(false);
</script>

<svelte:head>
	<title>Ingest — nazu</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	<h1 class="mb-8 text-2xl font-semibold">Ingest document</h1>

	{#if form?.error}
		<div class="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				update();
			};
		}}
		class="flex flex-col gap-5"
	>
		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Title <span class="text-red-500">*</span></span>
			<input
				name="title"
				type="text"
				required
				value={form?.values?.title ?? ''}
				placeholder="Document title"
				class="rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Type</span>
			<select
				name="type"
				class="rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
			>
				{#each TYPES as t (t)}
					<option value={t} selected={form?.values?.type === t || t === 'note'}>{t}</option>
				{/each}
			</select>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Content <span class="text-red-500">*</span></span>
			<textarea
				name="content"
				required
				rows={16}
				placeholder="Paste markdown or plain text…"
				class="rounded border border-neutral-300 px-3 py-2 font-mono text-sm focus:border-neutral-500 focus:outline-none"
			>{form?.values?.content ?? ''}</textarea>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Tags</span>
			<input
				name="tags"
				type="text"
				value={form?.values?.tags ?? ''}
				placeholder="comma-separated, e.g. ai, research, tools"
				class="rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Author</span>
			<input
				name="author"
				type="text"
				value={form?.values?.author ?? ''}
				placeholder="Optional"
				class="rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
			/>
		</label>

		<label class="flex flex-col gap-1">
			<span class="text-sm font-medium">Source URL</span>
			<input
				name="source_url"
				type="url"
				value={form?.values?.source_url ?? ''}
				placeholder="https://…"
				class="rounded border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
			/>
		</label>

		<button
			type="submit"
			disabled={submitting}
			class="mt-2 rounded bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
		>
			{submitting ? 'Ingesting…' : 'Ingest'}
		</button>
	</form>
</div>
