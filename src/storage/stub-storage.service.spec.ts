import { ServiceUnavailableException } from '@nestjs/common';
import { StubStorageService } from './stub-storage.service';

describe('StubStorageService', () => {
  const storage = new StubStorageService();

  it('upload rejects with 503 when storage is not configured', async () => {
    await expect(
      storage.upload('avatars/user-1/key.png', Buffer.from('img'), 'image/png'),
    ).rejects.toThrow(
      new ServiceUnavailableException('File storage is not configured'),
    );
  });

  it('delete rejects with 503 when storage is not configured', async () => {
    await expect(storage.delete('avatars/user-1/key.png')).rejects.toThrow(
      new ServiceUnavailableException('File storage is not configured'),
    );
  });
});
