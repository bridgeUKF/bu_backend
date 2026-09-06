import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const makeContext = (): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '10.0.0.1',
        method: 'GET',
        headers: {},
      }),
      getResponse: () => ({
        header: jest.fn(),
      }),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  }) as unknown as ExecutionContext;

describe('Throttling (guard mechanics)', () => {
  let moduleFixture: TestingModule;
  let guard: ThrottlerGuard;

  beforeEach(async () => {
    moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 2 }]),
      ],
      providers: [Reflector, ThrottlerGuard],
    }).compile();
    await moduleFixture.init();

    guard = moduleFixture.get(ThrottlerGuard);
  });

  afterEach(async () => {
    await moduleFixture.close();
  });

  it('allows requests within the limit and rejects past it with 429', async () => {
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);
    await expect(guard.canActivate(makeContext())).resolves.toBe(true);

    let status = 0;
    try {
      await guard.canActivate(makeContext());
    } catch (error) {
      status =
        typeof (error as { getStatus?: unknown }).getStatus === 'function'
          ? (error as { getStatus: () => number }).getStatus()
          : 0;
    }

    expect(status).toBe(429);
  });
});
