export interface StoredObject {
  url: string;
}

export abstract class StorageService {
  abstract upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<StoredObject>;

  abstract delete(key: string): Promise<void>;
}
