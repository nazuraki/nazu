import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface ChartSeries {
	label: string;
	points: [number, number | null][];
}

interface ChartProps {
	title: string;
	series: ChartSeries[];
	/** Format a y value for the axis/legend, e.g. bytes or percent. */
	formatY?: (v: number | null) => string;
}

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#39c5cf'];

/** Minimal uPlot wrapper: aligns all series onto the union of timestamps. */
export function Chart({ title, series, formatY }: ChartProps): React.JSX.Element {
	const el = useRef<HTMLDivElement>(null);
	const plot = useRef<uPlot | null>(null);

	useEffect(() => {
		if (!el.current) return;

		const timestamps = [...new Set(series.flatMap((s) => s.points.map(([t]) => t)))].sort(
			(a, b) => a - b,
		);
		const index = new Map(timestamps.map((t, i) => [t, i]));
		const data: uPlot.AlignedData = [
			timestamps,
			...series.map((s) => {
				const col = new Array<number | null>(timestamps.length).fill(null);
				for (const [t, v] of s.points) col[index.get(t)!] = v;
				return col;
			}),
		];

		const opts: uPlot.Options = {
			title,
			width: el.current.clientWidth || 480,
			height: 200,
			series: [
				{},
				...series.map((s, i) => ({
					label: s.label,
					stroke: COLORS[i % COLORS.length],
					width: 1.5,
					value: formatY ? (_u: uPlot, v: number | null): string => formatY(v) : undefined,
				})),
			],
			axes: [
				{ stroke: '#8b949e', grid: { stroke: '#21262d' } },
				{
					stroke: '#8b949e',
					grid: { stroke: '#21262d' },
					values: formatY
						? (_u: uPlot, vals: number[]): string[] => vals.map((v) => formatY(v))
						: undefined,
				},
			],
			legend: { show: series.length > 1 },
		};

		plot.current?.destroy();
		plot.current = new uPlot(opts, data, el.current);
		return () => {
			plot.current?.destroy();
			plot.current = null;
		};
	}, [title, series, formatY]);

	return <div ref={el} />;
}

export function formatBytes(v: number | null): string {
	if (v === null || Number.isNaN(v)) return '—';
	if (v >= 1 << 30) return `${(v / (1 << 30)).toFixed(1)}G`;
	if (v >= 1 << 20) return `${(v / (1 << 20)).toFixed(0)}M`;
	if (v >= 1 << 10) return `${(v / (1 << 10)).toFixed(0)}K`;
	return `${v.toFixed(0)}B`;
}

export function formatCpu(v: number | null): string {
	if (v === null || Number.isNaN(v)) return '—';
	return `${(v * 100).toFixed(1)}%`;
}
