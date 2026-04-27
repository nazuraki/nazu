<script lang="ts">
import { dueIn } from '$lib/time.js';

type TaskStatus = 'pending' | 'done' | 'blocked' | 'note';

interface Task {
	id: string;
	description: string;
	status: TaskStatus;
	due_date: string | null;
	completion_date: string | null;
	parent_id: string | null;
	sort_order: number;
}

let tasks = $state<Task[]>([]);
let error = $state<string | null>(null);
let newDescription = $state('');
let newIsNote = $state(false);
let editingId = $state<string | null>(null);
let editingValue = $state('');
let dragId = $state<string | null>(null);
let dropId = $state<string | null>(null);
let dueEditingId = $state<string | null>(null);
let addingSubForId = $state<string | null>(null);
let newSubDescription = $state('');
let newSubIsNote = $state(false);

const topLevel = $derived(tasks.filter((t) => !t.parent_id));
function childrenOf(id: string) {
	return tasks.filter((t) => t.parent_id === id);
}

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
		body: JSON.stringify({ description, status: newIsNote ? 'note' : 'pending' }),
	});
	if (r.ok) {
		const created = await r.json();
		tasks = [...tasks, created];
		newDescription = '';
		newIsNote = false;
	}
}

async function addSubtask(parentId: string) {
	const description = newSubDescription.trim();
	if (!description) return;
	const r = await fetch('/api/tasks', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			description,
			parent_id: parentId,
			status: newSubIsNote ? 'note' : 'pending',
		}),
	});
	if (r.ok) {
		const created = await r.json();
		tasks = [...tasks, created];
		newSubDescription = '';
		newSubIsNote = false;
		addingSubForId = null;
	}
}

async function patchTask(id: string, body: Record<string, unknown>) {
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

function nextStatus(current: TaskStatus): TaskStatus {
	if (current === 'pending') return 'done';
	if (current === 'done') return 'blocked';
	if (current === 'blocked') return 'pending';
	return current;
}

async function cycleStatus(t: Task) {
	if (t.status === 'note') return;
	await patchTask(t.id, { status: nextStatus(t.status) });
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
	if (r.ok) tasks = tasks.filter((t) => t.id !== id && t.parent_id !== id);
}

async function setDue(id: string, value: string) {
	dueEditingId = null;
	await patchTask(id, { due_date: value || null });
}

function startAddSub(id: string) {
	addingSubForId = id;
	newSubDescription = '';
	newSubIsNote = false;
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
	const top = tasks.filter((t) => !t.parent_id);
	const fromIdx = top.findIndex((t) => t.id === from);
	const toIdx = top.findIndex((t) => t.id === id);
	if (fromIdx < 0 || toIdx < 0) return;
	const reordered = [...top];
	const [moved] = reordered.splice(fromIdx, 1);
	reordered.splice(toIdx, 0, moved);
	tasks = [...reordered, ...tasks.filter((t) => t.parent_id)];
	await fetch('/api/tasks/reorder', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ids: reordered.map((t) => t.id) }),
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

function statusIcon(s: TaskStatus) {
	if (s === 'done') return '✓';
	if (s === 'blocked') return '⊘';
	if (s === 'note') return '—';
	return '○';
}

function focus(node: HTMLElement) {
	node.focus();
}
</script>

{#snippet taskRow(t: Task, isSub: boolean)}
	<div
		class="row"
		class:done={t.status === 'done'}
		class:blocked={t.status === 'blocked'}
		class:note={t.status === 'note'}
		class:sub={isSub}
		class:drop={!isSub && dropId === t.id}
	>
		{#if isSub}
			<span class="indent" aria-hidden="true"></span>
		{:else}
			<span class="handle" aria-label="drag">⋮⋮</span>
		{/if}
		<button
			class="status-btn s-{t.status}"
			type="button"
			aria-label="status: {t.status}"
			onclick={() => cycleStatus(t)}
			disabled={t.status === 'note'}
		>{statusIcon(t.status)}</button>
		{#if editingId === t.id}
			<input
				class="edit"
				type="text"
				bind:value={editingValue}
				onblur={() => saveEdit(t.id)}
				onkeydown={(e) => onKeydown(e, t.id)}
				use:focus
			/>
		{:else}
			<button class="desc" type="button" onclick={() => startEdit(t)}>{t.description}</button>
		{/if}

		<span class="due">
			{#if t.status === 'note'}
				<!-- notes don't carry due dates -->
			{:else if dueEditingId === t.id}
				<input
					class="due-input"
					type="date"
					value={t.due_date ?? ''}
					onchange={(e) => setDue(t.id, (e.currentTarget as HTMLInputElement).value)}
					onblur={() => (dueEditingId = null)}
					use:focus
				/>
			{:else if t.due_date}
				<span class="due-label" title={t.due_date}>{dueIn(t.due_date)}</span>
				<button class="cal" type="button" aria-label="edit due date" onclick={() => (dueEditingId = t.id)}>📅</button>
			{:else}
				<button class="cal" type="button" aria-label="set due date" onclick={() => (dueEditingId = t.id)}>📅</button>
			{/if}
		</span>

		{#if !isSub}
			<button class="add-sub" type="button" aria-label="add subtask" onclick={() => startAddSub(t.id)}>+</button>
		{:else}
			<span class="add-sub-spacer" aria-hidden="true"></span>
		{/if}
		<button class="del" type="button" aria-label="delete" onclick={() => deleteTask(t.id)}>×</button>
	</div>
{/snippet}

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
		<input type="text" placeholder="Add a task…" bind:value={newDescription} />
		<label class="note-toggle">
			<input type="checkbox" bind:checked={newIsNote} />
			<span>Note</span>
		</label>
		<button type="submit" disabled={!newDescription.trim()}>Add</button>
	</form>

	<ul class="list">
		{#each topLevel as t (t.id)}
			<li
				class="group"
				draggable="true"
				ondragstart={(e) => onDragStart(e, t.id)}
				ondragover={(e) => onDragOver(e, t.id)}
				ondrop={(e) => onDrop(e, t.id)}
				ondragend={() => {
					dragId = null;
					dropId = null;
				}}
			>
				{@render taskRow(t, false)}

				{#if addingSubForId === t.id}
					<form
						class="sub-form"
						onsubmit={(e) => {
							e.preventDefault();
							addSubtask(t.id);
						}}
					>
						<span class="indent" aria-hidden="true"></span>
						<input
							class="sub-input"
							type="text"
							placeholder="Add subtask…"
							bind:value={newSubDescription}
							onkeydown={(e) => {
								if (e.key === 'Escape') addingSubForId = null;
							}}
							use:focus
						/>
						<label class="note-toggle">
							<input type="checkbox" bind:checked={newSubIsNote} />
							<span>Note</span>
						</label>
						<button class="sub-add" type="submit" disabled={!newSubDescription.trim()}>Add</button>
						<button class="sub-cancel" type="button" onclick={() => (addingSubForId = null)}>×</button>
					</form>
				{/if}

				{#each childrenOf(t.id) as c (c.id)}
					{@render taskRow(c, true)}
				{/each}
			</li>
		{/each}
	</ul>

	{#if topLevel.length === 0 && !error}
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
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.add input[type="text"] {
		flex: 1;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		background: var(--surface-2);
		color: var(--on-surface);
		border: 1px solid var(--outline);
		border-radius: 4px;
	}

	.add button[type="submit"] {
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

	.add button[type="submit"]:disabled { opacity: 0.4; cursor: not-allowed; }

	.note-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: var(--on-surface-dim);
		cursor: pointer;
		user-select: none;
	}

	.note-toggle input { margin: 0; }

	.list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1rem 1.5rem 1fr auto 1.25rem 1rem;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.5rem;
		border-radius: 4px;
		border: 1px solid transparent;
	}

	.row.sub {
		grid-template-columns: 1.5rem 1.5rem 1fr auto 1.25rem 1rem;
		padding-left: 0.5rem;
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

	.indent {
		display: inline-block;
		border-left: 2px solid var(--outline);
		height: 1rem;
		margin-left: 0.5rem;
		opacity: 0.4;
	}

	.status-btn {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 0.875rem;
		padding: 0;
		width: 1.5rem;
		text-align: center;
		line-height: 1;
		color: var(--on-surface-dim);
	}

	.status-btn:disabled { cursor: default; }
	.status-btn.s-done { color: var(--success, #4ade80); }
	.status-btn.s-blocked { color: var(--warning, #f59e0b); }
	.status-btn.s-note { color: var(--on-surface-dim); }
	.status-btn.s-pending:hover { color: var(--on-surface); }

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

	.row.blocked .desc { color: var(--warning, #f59e0b); }

	.row.note .desc {
		color: var(--on-surface-dim);
		font-style: italic;
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

	.add-sub {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--on-surface-dim);
		font-size: 1rem;
		padding: 0;
		line-height: 1;
		opacity: 0;
	}

	.row:hover .add-sub { opacity: 1; }
	.add-sub:hover { color: var(--secondary); }

	.add-sub-spacer { display: inline-block; }

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

	.sub-form {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto auto auto;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.5rem;
	}

	.sub-input {
		padding: 0.375rem 0.5rem;
		font-size: 0.875rem;
		background: var(--surface-2);
		color: var(--on-surface);
		border: 1px solid var(--outline);
		border-radius: 3px;
	}

	.sub-add {
		padding: 0.25rem 0.625rem;
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		background: var(--primary, var(--secondary));
		color: var(--on-primary, var(--surface));
		border: none;
		border-radius: 3px;
		cursor: pointer;
	}

	.sub-add:disabled { opacity: 0.4; cursor: not-allowed; }

	.sub-cancel {
		background: none;
		border: none;
		color: var(--on-surface-dim);
		font-size: 1rem;
		cursor: pointer;
		padding: 0 0.25rem;
		line-height: 1;
	}

	.sub-cancel:hover { color: var(--error); }
</style>
