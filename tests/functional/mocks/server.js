import Fastify from "fastify";

const app = Fastify({ logger: false });

const SERVICES = ["github"];

const fixtures = new Map();
const calls = new Map();
for (const s of SERVICES) {
	fixtures.set(s, []);
	calls.set(s, []);
}

function key(method, path) {
	return `${method.toUpperCase()} ${path}`;
}

function findFixture(service, method, path) {
	const list = fixtures.get(service) ?? [];
	return list.find((f) => key(f.method ?? "GET", f.path) === key(method, path));
}

app.get("/__admin__/health", async () => ({ ok: true }));

app.post("/__admin__/reset", async () => {
	for (const s of SERVICES) {
		fixtures.set(s, []);
		calls.set(s, []);
	}
	return { ok: true };
});

app.post("/__admin__/fixtures/:service", async (req, reply) => {
	const service = req.params.service;
	if (!SERVICES.includes(service)) return reply.code(404).send({ error: "unknown service" });
	const list = fixtures.get(service);
	list.push(req.body);
	return { ok: true, count: list.length };
});

app.get("/__admin__/calls/:service", async (req, reply) => {
	const service = req.params.service;
	if (!SERVICES.includes(service)) return reply.code(404).send({ error: "unknown service" });
	return calls.get(service) ?? [];
});

app.all("/:service/*", async (req, reply) => {
	const service = req.params.service;
	if (!SERVICES.includes(service)) return reply.code(404).send({ error: "unknown service" });

	const subPath = "/" + (req.params["*"] ?? "");
	calls.get(service).push({
		method: req.method,
		path: subPath,
		headers: req.headers,
		body: req.body ?? null,
		timestamp: Date.now(),
	});

	const fixture = findFixture(service, req.method, subPath);
	if (!fixture) {
		return reply.code(501).send({
			error: "no fixture configured",
			service,
			method: req.method,
			path: subPath,
		});
	}

	if (fixture.headers) {
		for (const [k, v] of Object.entries(fixture.headers)) reply.header(k, v);
	}
	return reply.code(fixture.status ?? 200).send(fixture.body ?? {});
});

const port = Number(process.env.PORT ?? 8080);
await app.listen({ host: "0.0.0.0", port });
console.log(`mocks listening on :${port}`);
