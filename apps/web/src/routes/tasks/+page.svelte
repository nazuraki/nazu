<script lang="ts">
import { dueIn } from '$lib/time.js';

interface Task {
	id: string;
	description: string;
	status: string;
	due_date: string | null;
	sort_order: number;
}

let tasks = $state<Task[]>([]);
let error = $state<string | null>(null);
let newDescription = $state('');
let editingId = $state<string | null>(null);
let editingValue = $state('');
let dragId = $state<string | null>(null);
let dropId = $state<string | null>(null);
let dueEditingId = $state<string | null>(null);

async function load() {
	try {
		const r = await fetch('/api/tasks');
		if (!r.ok) throw new Error(`HTTP ${r.status}`);
		tasks = await r.json();
		error = null;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to load';
	}
}

$effect(() => {
	load();
});

async function addTask() {
	const description = newDescription.trim();
	if (!description) return;
	const r = await fetch('/api/tasks', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ description }),
	});
	if (r.ok) {
		const created = await r.json();
		tasks = [...tasks, created];
		newDescription = '';
	}
}

async function patchTask(id: string, body: Partial<Task>) {
	const r = await fetch(`/api/tasks/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (r.ok) {
		const updated = await r.json();
		tasks = tasks.map((t) => (t.id === id ? updated : t));
	}
}

async function toggleStatus(t: Task) {
	const next = t.status === 'done' ? 'pending' : 'done';
	tasks = tasks.map((x) => (x.id === t.id ? { ...x, status: next } : x));
	await patchTask(t.id, { status: next });
}

function startEdit(t: Task) {
	editingId = t.id;
	editingValue = t.description;
}

async function saveEdit(id: string) {
	const v = editingValue.trim();
	editingId = null;
	if (!v) return;
	const t = tasks.find((x) => x.id === id);
	if (!t || v === t.description) return;
	await patchTask(id, { description: v });
}

async function deleteTask(id: string) {
	const r = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
	if (r.ok) tasks = tasks.filter((t) => t.id !== id);
}

async function setDue(id: string, value: string) {
	dueEditingId = null;
	await patchTask(id, { due_date: value || null });
}

function onDragStart(e: DragEvent, id: string) {
	dragId = id;
	if (e.dataTransfer) {
		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('text/plain', id);
	}
}

function onDragOver(e: DragEvent, id: string) {
	e.preventDefault();
	dropId = id;
}

async function onDrop(e: DragEvent, id: string) {
	e.preventDefault();
	const from = dragId;
	dragId = null;
	dropId = null;
	if (!from || from === id) return;
	const fromIdx = tasks.findIndex((t) => t.id === from);
	const toIdx = tasks.findIndex((t) => t.id === id);
	if (fromIdx < 0 || toIdx < 0) return;
	const next = [...tasks];
	const [moved] = next.splice(fromIdx, 1);
	next.splice(toIdx, 0, moved);
	tasks = next;
	await fetch('/api/tasks/reorder', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ids: next.map((t) => t.id) }),
	});
}

function onKeydown(e: KeyboardEvent, id: string) {
	if (e.key === 'Enter') {
		e.preventDefault();
		saveEdit(id);
	} else if (e.key === 'Escape') {
		editingId = null;
	}
}
</script>

<div class="page">
	<header>
		<h1>Tasks</h1>
	</header>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<form
		class="add"
		onsubmit={(e) => {
			e.preventDefault();
			addTask();
		}}
	>
		<input
			type="text"
			placeholder="Add a task…"
			bind:value={newDescription}
		/>
		<button type="submit" disabled={!newDescription.trim()}>Add</button>
	</form>

	<ul class="list">
		{#each tasks as t (t.id)}
			<li
				class="row"
				class:done={t.status === 'done'}
				class:drop={dropId === t.id}
				draggable="true"
				ondragstart={(e) => onDragStart(e, t.id)}
				ondragover={(e) => onDragOver(e, t.id)}
				ondrop={(e) => onDrop(e, t.id)}
				ondragend={() => { dragId = null; dropId = null; }}
			>
				<span class="handle" aria-label="drag">⋮⋮</span>
				<input
					type="checkbox"
					checked={t.status === 'done'}
					onchange={() => toggleStatus(t)}
				/>
				{#if editingId === t.id}
					<input
						class="edit"
						type="text"
						bind:value={editingValue}
						onblur={() => saveEdit(t.id)}
						onkeydown={(e) => onKeydown(e, t.id)}
						autofocus
					/>
				{:else}
					<button
						class="desc"
						type="button"
						onclick={() => startEdit(t)}
					>{t.description}</button>
				{/if}

				<span class="due">
					{#if dueEditingId === t.id}
						<input
							class="due-input"
							type="date"
							value={t.due_date ?? ''}
							onchange={(e) => setDue(t.id, (e.currentTarget as HTMLInputElement).value)}
							onblur={() => (dueEditingId = null)}
							autofocus
						/>
					{:else if t.due_date}
						<span class="due-label" title={t.due_date}>{dueIn(t.due_date)}</span>
						<button class="cal" type="button" aria-label="edit due date" onclick={() => (dueEditingId = t.id)}>📅</button>
					{:else}
						<button class="cal" type="button" aria-label="set due date" onclick={() => (dueEditingId = t.id)}>📅</button>
					{/if}
				</span>

				<button class="del" type="button" aria-label="delete" onclick={() => deleteTask(t.id)}>×</button>
			</li>
		{/each}
	</ul>

	{#if tasks.length === 0 && !error}
		<p class="empty">No tasks yet.</p>
	{/if}
</div>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
	}

	header { margin-bottom: 1.5rem; }

	h1 {
		font-family: var(--font-display);
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--on-surface);
		margin: 0;
	}

	.error { color: var(--error); font-size: 0.875rem; }
	.empty { color: var(--on-surface-dim); font-size: 0.875rem; }

	.add {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
	}

	.add input {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		background: var(--surface-2);
		color: var(--on-surface);
		border: 1px solid var(--outline);
		border-radius: 4px;
	}

	.add button {
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: var(--primary, var(--secondary));
		color: var(--on-primary, var(--surface));
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.add button:disabled { opacity: 0.4; cursor: not-allowed; }

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1rem auto 1fr auto auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.5rem;
		border-radius: 4px;
		border: 1px solid transparent;
	}

	.row:hover { background: var(--surface-3); }
	.row.drop { border-color: var(--secondary); }

	.handle {
		cursor: grab;
		color: var(--on-surface-dim);
		font-size: 0.75rem;
		user-select: none;
		letter-spacing: -2px;
	}

	.handle:active { cursor: grabbing; }

	.desc {
		text-align: left;
		background: none;
		border: none;
		padding: 0.25rem 0.25rem;
		color: var(--on-surface);
		font-size: 0.875rem;
		cursor: text;
		font-family: inherit;
	}

	.row.done .desc {
		text-decoration: line-through;
		color: var(--on-surface-dim);
	}

	.edit {
		padding: 0.25rem 0.25rem;
		font-size: 0.875rem;
		background: var(--surface-2);
		color: var(--on-surface);
		border: 1px solid var(--outline);
		border-radius: 3px;
		font-family: inherit;
	}

	.due {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--on-surface-dim);
	}

	.due-label { font-variant-numeric: tabular-nums; }

	.due-input {
		font-size: 0.75rem;
		background: var(--surface-2);
		color: var(--on-surface);
		border: 1px solid var(--outline);
		border-radius: 3px;
		padding: 0.125rem 0.25rem;
	}

	.cal {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.75rem;
		opacity: 0.5;
		padding: 0.125rem;
	}

	.cal:hover { opacity: 1; }

	.del {
		background: none;
		border: none;
		color: var(--on-surface-dim);
		font-size: 1rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.del:hover { color: var(--error); }
</style>
