import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  const send = jest.fn();
  const client = { send } as unknown as S3Client;
  const storage = new R2StorageService(
    client,
    'bridgeukf',
    'https://pub-c2f7a44879c548c8aac5405ddfdcd7cc.r2.dev',
  );

  beforeEach(() => {
    send.mockReset();
  });

  it('upload puts the object and returns the public url', async () => {
    send.mockResolvedValue({});

    const result = await storage.upload(
      'avatars/user-1/key.png',
      Buffer.from('img'),
      'image/png',
    );

    expect(result).toEqual({
      url: 'https://pub-c2f7a44879c548c8aac5405ddfdcd7cc.r2.dev/avatars/user-1/key.png',
    });
    expect(send.mock.calls).toHaveLength(1);
    const [command] = send.mock.calls[0] as [PutObjectCommand];
    expect(command.input).toMatchObject({
      Bucket: 'bridgeukf',
      Key: 'avatars/user-1/key.png',
      ContentType: 'image/png',
    });
  });

  it('delete removes the object', async () => {
    send.mockResolvedValue({});

    await storage.delete('avatars/user-1/key.png');

    expect(send.mock.calls).toHaveLength(1);
    const [command] = send.mock.calls[0] as [DeleteObjectCommand];
    expect(command.input).toMatchObject({
      Bucket: 'bridgeukf',
      Key: 'avatars/user-1/key.png',
    });
  });
});
