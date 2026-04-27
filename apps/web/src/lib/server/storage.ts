import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	CreateBucketCommand,
	HeadBucketCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

let _client: S3Client | null = null;
let _bucketReady = false;

function client(): S3Client {
	if (!_client) {
		const endpoint = env.MINIO_ENDPOINT ?? 'http://minio:9000';
		_client = new S3Client({
			endpoint,
			region: 'us-east-1',
			credentials: {
				accessKeyId: env.MINIO_ACCESS_KEY ?? 'minioadmin',
				secretAccessKey: env.MINIO_SECRET_KEY ?? 'minioadmin'
			},
			forcePathStyle: true
		});
	}
	return _client;
}

function bucket(): string {
	return env.MINIO_BUCKET ?? 'nazu-documents';
}

async function ensureBucket(): Promise<void> {
	if (_bucketReady) return;
	const c = client();
	const b = bucket();
	try {
		await c.send(new HeadBucketCommand({ Bucket: b }));
	} catch {
		await c.send(new CreateBucketCommand({ Bucket: b }));
	}
	_bucketReady = true;
}

export async function uploadDocument(
	key: string,
	content: string,
	contentType = 'text/markdown'
): Promise<void> {
	await ensureBucket();
	await client().send(
		new PutObjectCommand({
			Bucket: bucket(),
			Key: key,
			Body: content,
			ContentType: contentType
		})
	);
}

export async function getDocumentText(key: string): Promise<string> {
	const res = await client().send(
		new GetObjectCommand({ Bucket: bucket(), Key: key })
	);
	return res.Body?.transformToString() ?? '';
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
	return getSignedUrl(
		client(),
		new GetObjectCommand({ Bucket: bucket(), Key: key }),
		{ expiresIn }
	);
}
