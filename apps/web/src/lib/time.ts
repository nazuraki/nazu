export function dueIn(dateStr: string | null): string {
	if (!dateStr) return "";
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const due = new Date(dateStr);
	due.setHours(0, 0, 0, 0);
	const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days === -1) return "yesterday";
	const abs = Math.abs(days);
	const suffix = days < 0 ? " ago" : "";
	const prefix = days > 1 ? "in " : "";
	if (abs < 30) return `${prefix}${abs} days${suffix}`;
	const months = Math.round(abs / 30);
	if (months < 12) return `${prefix}${months} month${months === 1 ? '' : 's'}${suffix}`;
	const years = Math.round(abs / 365);
	return `${prefix}${years} year${years === 1 ? '' : 's'}${suffix}`;
}

export function timeAgo(dateStr: string | null): string {
	if (!dateStr) return "never";
	const seconds = Math.floor((Date.now() - Date.parse(dateStr)) / 1000);
	if (seconds < 60) return "just now";
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	return `${Math.floor(months / 12)}y ago`;
}
