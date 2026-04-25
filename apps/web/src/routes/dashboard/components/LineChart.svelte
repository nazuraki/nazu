<script lang="ts">
const { data }: { data: { date: string; tokens_input: number; tokens_output: number }[] } =
	$props();

const VW = 200;
const TOP = 14;
const BOT = 12;
const CH = 52;
const Y0 = TOP + CH;

function fmtTokens(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}

function fmtDateShort(date: string): string {
	return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

const maxVal = $derived(
	Math.max(...data.map((d) => d.tokens_input), ...data.map((d) => d.tokens_output), 1)
);
const minVal = $derived(
	Math.min(...data.map((d) => d.tokens_input), ...data.map((d) => d.tokens_output))
);
const range = $derived(maxVal - minVal || 1);

function px(i: number): number {
	return data.length < 2 ? VW / 2 : (i / (data.length - 1)) * VW;
}

function py(val: number): number {
	return Y0 - ((val - minVal) / range) * CH;
}

const inputPoints = $derived(data.map((d, i) => `${px(i)},${py(d.tokens_input)}`).join(" "));
const outputPoints = $derived(data.map((d, i) => `${px(i)},${py(d.tokens_output)}`).join(" "));

const inputMax = $derived(
	data.reduce((m, d) => (d.tokens_input > data[m].tokens_input ? data.indexOf(d) : m), 0)
);
const outputMax = $derived(
	data.reduce((m, d) => (d.tokens_output > data[m].tokens_output ? data.indexOf(d) : m), 0)
);
</script>

{#if data.length > 0}
<svg viewBox="0 0 {VW} {TOP + CH + BOT}" class="chart" aria-label="30-day token usage">
  {#if data.length > 1}
    <polyline points={inputPoints} fill="none" stroke="var(--primary)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
  {:else}
    <circle cx={px(0)} cy={py(data[0].tokens_input)} r="2.5" fill="var(--primary)" />
  {/if}

  {#if data.length > 1}
    <polyline points={outputPoints} fill="none" stroke="var(--secondary)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />
  {:else}
    <circle cx={px(0)} cy={py(data[0].tokens_output)} r="2.5" fill="var(--secondary)" />
  {/if}

  <circle cx={px(inputMax)} cy={py(data[inputMax].tokens_input)} r="2.5" fill="var(--primary)" />
  <text
    x={px(inputMax)}
    y={py(data[inputMax].tokens_input) - 4}
    text-anchor={inputMax < 3 ? 'start' : inputMax > data.length - 4 ? 'end' : 'middle'}
    class="annotation"
  >{fmtTokens(data[inputMax].tokens_input)}</text>

  <circle cx={px(outputMax)} cy={py(data[outputMax].tokens_output)} r="2.5" fill="var(--secondary)" />
  <text
    x={px(outputMax)}
    y={py(data[outputMax].tokens_output) - 4}
    text-anchor={outputMax < 3 ? 'start' : outputMax > data.length - 4 ? 'end' : 'middle'}
    class="annotation secondary"
  >{fmtTokens(data[outputMax].tokens_output)}</text>

  <line x1="0" y1={TOP + CH + BOT - 5} x2="5" y2={TOP + CH + BOT - 5} stroke="var(--primary)" stroke-width="1.5" />
  <text x="7" y={TOP + CH + BOT - 2} class="legend">in</text>
  <line x1="17" y1={TOP + CH + BOT - 5} x2="22" y2={TOP + CH + BOT - 5} stroke="var(--secondary)" stroke-width="1.5" />
  <text x="24" y={TOP + CH + BOT - 2} class="legend">out</text>

  <text x={VW} y={TOP + CH + BOT - 1} text-anchor="end" class="date-label">{fmtDateShort(data[data.length - 1].date)}</text>
</svg>
{/if}

<style>
  .chart { width: 100%; display: block; }

  .annotation {
    font-family: var(--font-display);
    font-size: 7px;
    font-weight: 700;
    fill: var(--primary);
  }

  .annotation.secondary { fill: var(--secondary); }

  .date-label {
    font-family: var(--font-display);
    font-size: 6.5px;
    fill: var(--outline);
    letter-spacing: 0.03em;
  }

  .legend {
    font-family: var(--font-display);
    font-size: 6px;
    font-weight: 700;
    fill: var(--outline);
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
</style>
