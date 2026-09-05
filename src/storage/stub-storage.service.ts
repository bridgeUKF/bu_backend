import { ServiceUnavailableException } from '@nestjs/common';
import { StorageService, type StoredObject } from './storage.service';

export class StubStorageService extends StorageService {
  upload(): Promise<StoredObject> {
    return Promise.reject(
      new ServiceUnavailableException('File storage is not configured'),
    );
  }

  delete(): Promise<void> {
    return Promise.reject(
      new ServiceUnavailableException('File storage is not configured'),
    );
  }
}
