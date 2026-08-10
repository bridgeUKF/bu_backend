import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'node:net';

@Injectable()
export class RedisHealthService {
  constructor(private readonly configService: ConfigService) {}

  async ping(): Promise<void> {
    const redisUrl = new URL(
      this.configService.get<string>('app.redisUrl') ??
        'redis://localhost:6379',
    );
    const host = redisUrl.hostname;
    const port = Number(redisUrl.port || 6379);

    await new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      let settled = false;

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        callback();
      };

      socket.setTimeout(1500);
      socket.once('error', (error) => finish(() => reject(error)));
      socket.once('timeout', () =>
        finish(() => reject(new Error('Redis health check timed out'))),
      );
      socket.connect(port, host, () => {
        socket.write('*1\r\n$4\r\nPING\r\n');
      });
      socket.on('data', (chunk) => {
        const response = chunk.toString('utf8');

        if (response.startsWith('+PONG')) {
          finish(resolve);
          return;
        }

        finish(() =>
          reject(new Error(`Unexpected Redis health response: ${response}`)),
        );
      });
    });
  }
}
