import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { R2StorageService } from './r2-storage.service';
import { StorageService } from './storage.service';
import { StubStorageService } from './stub-storage.service';

@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): StorageService => {
        const driver = configService.get<string>('app.storageDriver') ?? 'stub';

        if (driver !== 'r2') {
          return new StubStorageService();
        }

        const accountId = configService.get<string>('app.r2AccountId');
        const accessKeyId = configService.get<string>('app.r2AccessKeyId');
        const secretAccessKey = configService.get<string>(
          'app.r2SecretAccessKey',
        );
        const bucketName = configService.get<string>('app.r2BucketName');
        const publicUrl = configService.get<string>('app.r2PublicUrl');

        if (
          !accountId ||
          !accessKeyId ||
          !secretAccessKey ||
          !bucketName ||
          !publicUrl
        ) {
          throw new Error(
            'R2 storage driver selected but R2 credentials are incomplete ' +
              '(R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL)',
          );
        }

        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId, secretAccessKey },
        });

        return new R2StorageService(s3, bucketName, publicUrl);
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
