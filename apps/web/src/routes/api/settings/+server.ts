import { json, error } from '@sveltejs/kit';
import { listSettings, featureStates, setSection } from '$lib/server/settings.js';

export async function GET() {
	return json({
		sections: await listSettings(),
		features: await featureStates(),
	});
}

export async function POST({ request }) {
	const body = await request.json().catch(() => null);
	const section = (body?.section ?? '').trim();
	if (!section) throw error(400, 'section required');
	if (typeof body.config !== 'object' || body.config === null) {
		throw error(400, 'config (object) required');
	}

	await setSection(section, body.config);

	return json({
		sections: await listSettings(),
		features: await featureStates(),
	});
}
