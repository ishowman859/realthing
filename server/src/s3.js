import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET,
  S3_PUBLIC_BASE_URL,
} = process.env;

const canUseS3 =
  !!AWS_REGION && !!AWS_ACCESS_KEY_ID && !!AWS_SECRET_ACCESS_KEY && !!S3_BUCKET;

const s3Client = canUseS3
  ? new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    })
  : null;

export async function uploadBufferToS3({ key, buffer, contentType }) {
  if (!canUseS3 || !s3Client) return null;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  );

  if (S3_PUBLIC_BASE_URL) {
    return `${S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
}
