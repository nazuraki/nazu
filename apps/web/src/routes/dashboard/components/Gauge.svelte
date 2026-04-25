<script lang="ts">
const {
	value,
	max,
	label,
	displayValue,
	maxLabel,
	color = "var(--primary)",
}: {
	value: number;
	max: number;
	label: string;
	displayValue: string;
	maxLabel?: string;
	color?: string;
} = $props();

const R = 76;
const CX = 100;
const CY = 100;
const ARC = Math.PI * R;

const pct = $derived(Math.min(Math.max(value / max, 0), 1));
const filled = $derived(pct * ARC);
const offset = $derived(ARC - filled);
</script>

<svg viewBox="0 0 200 118" class="gauge" aria-label="{label}: {displayValue}">
  <path
    d="M {CX - R},{CY} A {R},{R} 0 0,1 {CX + R},{CY}"
    fill="none"
    stroke="var(--surface-3)"
    stroke-width="10"
    stroke-linecap="round"
  />
  <path
    d="M {CX - R},{CY} A {R},{R} 0 0,1 {CX + R},{CY}"
    fill="none"
    stroke={color}
    stroke-width="10"
    stroke-linecap="round"
    stroke-dasharray="{ARC} {ARC}"
    stroke-dashoffset={offset}
  />
  <text x={CX} y={CY - 8} text-anchor="middle" class="val">{displayValue}</text>
  <text x={CX} y={CY + 10} text-anchor="middle" class="lbl">{label}</text>
  <text x={CX - R + 2} y={CY + 16} text-anchor="middle" class="scale">0</text>
  <text x={CX + R - 2} y={CY + 16} text-anchor="middle" class="scale">{maxLabel ?? max}</text>
</svg>

<style>
  .gauge { width: 100%; display: block; }

  .val {
    font-family: var(--font-display);
    font-size: 22px;
    font-weight: 700;
    fill: var(--on-surface);
  }

  .lbl {
    font-family: var(--font-display);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    fill: var(--on-surface-dim);
  }

  .scale {
    font-family: var(--font-display);
    font-size: 7px;
    fill: var(--outline);
  }
</style>
