<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { SECRET_SET } from '$lib/config/settings';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let busy = $state<string | null>(null);
	let errorMsg = $state<string | null>(null);

	// Per-section editable form state, seeded from loaded values. `list` fields
	// are edited as newline-separated text.
	type FormState = Record<string, Record<string, string>>;
	function seedForms(sections: PageData['sections']): FormState {
		const out: FormState = {};
		for (const s of sections) {
			out[s.key] = {};
			for (const f of s.fields) {
				const v = s.values[f.key];
				out[s.key][f.key] = f.type === 'list' ? (Array.isArray(v) ? v.join('\n') : '') : String(v ?? '');
			}
		}
		return out;
	}
	let forms = $state<FormState>(seedForms(data.sections));

	async function post(body: unknown, key: string) {
		busy = key;
		errorMsg = null;
		try {
			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				const b = await res.json().catch(() => null);
				throw new Error(b?.message ?? `request failed (${res.status})`);
			}
			await invalidateAll();
			forms = seedForms(data.sections);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'failed to save';
		} finally {
			busy = null;
		}
	}

	function saveSection(sectionKey: string) {
		const def = data.sections.find((s) => s.key === sectionKey);
		if (!def) return;
		const config: Record<string, unknown> = {};
		for (const f of def.fields) {
			const raw = forms[sectionKey][f.key] ?? '';
			if (f.type === 'list') {
				config[f.key] = raw.split('\n').map((l) => l.trim()).filter(Boolean);
			} else if (f.type === 'number') {
				config[f.key] = Number(raw);
			} else if (f.type === 'boolean') {
				config[f.key] = raw === 'true';
			} else if (f.type === 'secret' || f.type === 'password') {
				if (raw === '') continue; // blank = leave unchanged
				config[f.key] = raw;
			} else {
				config[f.key] = raw;
			}
		}
		post({ section: sectionKey, config }, sectionKey);
	}

	function toggleFeature(key: string, enabled: boolean) {
		post({ section: 'features', config: { [key]: enabled } }, `feature:${key}`);
	}

	function toggleService(profile: string, enabled: boolean) {
		busy = `svc:${profile}`;
		errorMsg = null;
		fetch('/api/services', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ profile, enabled }),
		})
			.then(async (res) => {
				if (!res.ok) {
					const b = await res.json().catch(() => null);
					throw new Error(b?.message ?? `request failed (${res.status})`);
				}
				await invalidateAll();
			})
			.catch((e) => (errorMsg = e instanceof Error ? e.message : 'failed to update service'))
			.finally(() => (busy = null));
	}
</script>

<svelte:head>
	<title>settings — nazuraki.dev</title>
</svelte:head>

<div class="flex items-center gap-5 mb-8">
	<a href="/" class="font-grotesk text-xs text-secondary hover:text-on-surface-variant transition-colors uppercase tracking-[0.08em]">
		← back
	</a>
	<span class="w-px h-4 bg-outline opacity-30"></span>
	<h1 class="font-grotesk text-sm font-semibold text-on-surface-variant">Settings</h1>
</div>

{#if errorMsg}
	<div class="bg-surface-low border-l-2 border-error rounded p-4 mb-6 font-inter text-sm text-error">
		{errorMsg}
	</div>
{/if}

<!-- Features -->
<section class="mb-14">
	<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim mb-5">
		Features
	</h2>
	<div class="grid grid-cols-1 gap-3">
		{#each data.features as feat (feat.key)}
			<div class="bg-surface-low rounded p-5 flex items-center justify-between gap-4">
				<div class="min-w-0">
					<div class="font-grotesk font-semibold text-on-surface">{feat.label}</div>
					<div class="font-inter text-sm text-on-surface-variant mt-1">{feat.description}</div>
				</div>
				<button
					onclick={() => toggleFeature(feat.key, !feat.enabled)}
					disabled={busy !== null}
					class="font-grotesk text-xs uppercase tracking-[0.08em] px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed
						{feat.enabled
							? 'bg-surface-container text-on-surface-variant hover:bg-surface'
							: 'bg-primary text-on-primary hover:opacity-90'}"
				>
					{busy === `feature:${feat.key}` ? '…' : feat.enabled ? 'Disable' : 'Enable'}
				</button>
			</div>
		{/each}
	</div>
</section>

<!-- Config sections -->
{#each data.sections as section (section.key)}
	<section class="mb-14">
		<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim mb-2">
			{section.label}
		</h2>
		{#if section.description}
			<p class="font-inter text-sm text-on-surface-variant mb-5">{section.description}</p>
		{/if}
		<div class="bg-surface-low rounded p-5 flex flex-col gap-4">
			{#each section.fields as field (field.key)}
				<label class="flex flex-col gap-1">
					<span class="font-grotesk text-xs uppercase tracking-[0.06em] text-on-surface-dim">
						{field.label}
					</span>
					{#if field.type === 'list'}
						<textarea
							bind:value={forms[section.key][field.key]}
							rows="3"
							class="bg-surface-container rounded px-3 py-2 font-inter text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary resize-y"
						></textarea>
					{:else if field.type === 'secret' || field.type === 'password'}
						<input
							type="password"
							bind:value={forms[section.key][field.key]}
							placeholder={section.secretSet[field.key] ? `${SECRET_SET} (leave blank to keep)` : 'not set'}
							autocomplete="new-password"
							class="bg-surface-container rounded px-3 py-2 font-inter text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary"
						/>
					{:else if field.type === 'number'}
						<input
							type="number"
							bind:value={forms[section.key][field.key]}
							class="bg-surface-container rounded px-3 py-2 font-inter text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary"
						/>
					{:else if field.type === 'boolean'}
						<input
							type="checkbox"
							checked={forms[section.key][field.key] === 'true'}
							onchange={(e) => (forms[section.key][field.key] = String(e.currentTarget.checked))}
							class="self-start w-4 h-4 accent-primary"
						/>
					{:else}
						<input
							type="text"
							bind:value={forms[section.key][field.key]}
							class="bg-surface-container rounded px-3 py-2 font-inter text-sm text-on-surface outline-none focus:ring-1 focus:ring-primary"
						/>
					{/if}
					{#if field.help}
						<span class="font-inter text-xs text-on-surface-dim">{field.help}</span>
					{/if}
				</label>
			{/each}
			<div>
				<button
					onclick={() => saveSection(section.key)}
					disabled={busy !== null}
					class="font-grotesk text-xs uppercase tracking-[0.08em] px-4 py-2 rounded bg-primary text-on-primary hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
				>
					{busy === section.key ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>
	</section>
{/each}

<!-- Optional services -->
<section class="mb-14">
	<h2 class="font-grotesk text-xs font-bold uppercase tracking-[0.1em] text-on-surface-dim mb-5">
		Optional services
	</h2>
	<div class="grid grid-cols-1 gap-3">
		{#each data.services as svc (svc.profile)}
			{@const blocked = svc.missingEnv.length > 0}
			<div class="bg-surface-low rounded p-5 flex items-center justify-between gap-4">
				<div class="min-w-0">
					<div class="font-grotesk font-semibold text-on-surface">{svc.label}</div>
					<div class="font-inter text-sm text-on-surface-variant mt-1">
						{#if blocked}
							Missing config: {svc.missingEnv.join(', ')}
						{:else if svc.running}
							Running
						{:else}
							Stopped
						{/if}
					</div>
				</div>
				<button
					onclick={() => toggleService(svc.profile, !svc.enabled)}
					disabled={busy !== null || (blocked && !svc.enabled)}
					class="font-grotesk text-xs uppercase tracking-[0.08em] px-4 py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed
						{svc.enabled
							? 'bg-surface-container text-on-surface-variant hover:bg-surface'
							: 'bg-primary text-on-primary hover:opacity-90'}"
				>
					{busy === `svc:${svc.profile}` ? '…' : svc.enabled ? 'Disable' : 'Enable'}
				</button>
			</div>
		{/each}
	</div>
</section>
