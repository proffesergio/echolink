export async function storeSnapshot(snapshot) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  if (!process.env.AWS_ENDPOINT_URL_S3 || !process.env.STORAGE_BUCKET) throw new Error('Object storage not configured');
  const key = `telemetry/${new Date().toISOString().replaceAll(':', '-')}.json`;
  const client = new S3Client({ forcePathStyle: true });
  try {
    await client.send(new PutObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key, Body: JSON.stringify(snapshot), ContentType: 'application/json' }));
    return key;
  } finally { client.destroy(); }
}
