import { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const loginDto = {
    email: 'user@example.com',
    password: 'secret123',
  };

  const loginResult = {
    accessToken: 'signed-access-token',
    refreshToken: 'opaque-refresh-token',
    user: {
      id: 'user-1',
      email: loginDto.email,
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'ACTIVE' as const,
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T08:00:00.000Z'),
    },
  };

  it.each([
    ['production', true],
    ['development', false],
  ])('sets a secure refresh cookie only in %s', async (nodeEnv, secure) => {
    const authService = {
      login: jest.fn().mockResolvedValue(loginResult),
    };
    const configService = {
      get: jest.fn().mockReturnValue(nodeEnv),
    };
    const reply = {
      setCookie: jest.fn(),
    };
    const controller = new AuthController(
      authService as unknown as AuthService,
      configService as unknown as ConfigService,
    );

    await expect(
      controller.login(loginDto, reply as unknown as FastifyReply),
    ).resolves.toEqual({
      accessToken: loginResult.accessToken,
      user: loginResult.user,
    });

    expect(reply.setCookie).toHaveBeenCalledWith(
      'refresh_token',
      loginResult.refreshToken,
      {
        path: '/',
        httpOnly: true,
        secure,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      },
    );
  });
});
