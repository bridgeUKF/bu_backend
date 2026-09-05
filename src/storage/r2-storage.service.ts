import {
  DeleteObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { StorageService, type StoredObject } from './storage.service';

@Injectable()
export class R2StorageService extends StorageService {
  constructor(
    private readonly s3: S3Client,
    private readonly bucket: string,
    private readonly publicUrl: string,
  ) {
    super();
  }

  async upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredObject> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return { url: `${this.publicUrl}/${key}` };
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
