import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { R2StorageService } from './r2-storage.service';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { StubStorageService } from './stub-storage.service';

const buildModule = (
  values: Record<string, string | undefined>,
): Promise<TestingModule> => {
  @Global()
  @Module({
    providers: [
      {
        provide: ConfigService,
        useValue: {
          get: (key: string): string | undefined => values[key],
        },
      },
    ],
    exports: [ConfigService],
  })
  class TestConfigModule {}

  return Test.createTestingModule({
    imports: [TestConfigModule, StorageModule],
  }).compile();
};

const r2Values: Record<string, string> = {
  'app.storageDriver': 'r2',
  'app.r2AccountId': 'test-account',
  'app.r2AccessKeyId': 'test-access',
  'app.r2SecretAccessKey': 'test-secret',
  'app.r2BucketName': 'bridgeukf',
  'app.r2PublicUrl': 'https://pub-test.r2.dev',
};

describe('StorageModule', () => {
  it('provides the stub when driver is stub', async () => {
    const moduleFixture = await buildModule({ 'app.storageDriver': 'stub' });
    await moduleFixture.init();

    expect(moduleFixture.get(StorageService)).toBeInstanceOf(
      StubStorageService,
    );

    await moduleFixture.close();
  });

  it('fails fast on boot when driver is r2 but creds are incomplete', async () => {
    await expect(buildModule({ 'app.storageDriver': 'r2' })).rejects.toThrow(
      'R2 storage driver selected but R2 credentials are incomplete',
    );
  });

  it('provides r2 storage when fully configured', async () => {
    const moduleFixture = await buildModule(r2Values);
    await moduleFixture.init();

    expect(moduleFixture.get(StorageService)).toBeInstanceOf(R2StorageService);

    await moduleFixture.close();
  });
});
