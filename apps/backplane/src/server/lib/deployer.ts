import type { DeployAction, DeployRecord, DeployTrigger, Project, Registry } from './registry.js';
import type { DeployTarget } from './targets/compose.js';

/**
 * Runs deploys/restarts through the target, serialized per project, with each
 * run recorded (status + captured log) in the registry's deploy history.
 */
export class Deployer {
	private chains = new Map<string, Promise<void>>();

	constructor(
		private readonly registry: Registry,
		private readonly target: DeployTarget,
	) {}

	/** Queue a run and return its history record immediately. */
	start(project: Project, action: DeployAction, trigger: DeployTrigger): DeployRecord {
		const record = this.registry.createDeploy(project.name, action, trigger);
		const prev = this.chains.get(project.name) ?? Promise.resolve();
		const next = prev.then(() => this.run(project, action, record.id));
		this.chains.set(project.name, next);
		return record;
	}

	/** Resolves when every queued run for the project has finished (test hook). */
	async settled(projectName: string): Promise<void> {
		await this.chains.get(projectName);
	}

	private async run(project: Project, action: DeployAction, deployId: number): Promise<void> {
		const log = (line: string): void => this.registry.appendDeployLog(deployId, line);
		try {
			if (action === 'deploy') await this.target.deploy(project, log);
			else if (action === 'update') await this.target.update(project, log);
			else await this.target.restart(project, log);
			this.registry.finishDeploy(deployId, 'succeeded');
		} catch (err) {
			log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
			this.registry.finishDeploy(deployId, 'failed');
		}
	}
}
