import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
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

  describe('refresh', () => {
    const refreshResult = {
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      user: loginResult.user,
    };

    it.each([
      ['production', true],
      ['development', false],
    ])(
      'rotates the refresh cookie only in %s (secure=%s)',
      async (nodeEnv, secure) => {
        const authService = {
          refresh: jest.fn().mockResolvedValue(refreshResult),
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
        const request = {
          cookies: { refresh_token: 'incoming-refresh-token' },
        };

        await expect(
          controller.refresh(
            request as unknown as FastifyRequest,
            reply as unknown as FastifyReply,
          ),
        ).resolves.toEqual({
          accessToken: refreshResult.accessToken,
          user: refreshResult.user,
        });

        expect(authService.refresh).toHaveBeenCalledWith(
          'incoming-refresh-token',
        );
        expect(reply.setCookie).toHaveBeenCalledWith(
          'refresh_token',
          refreshResult.refreshToken,
          {
            path: '/',
            httpOnly: true,
            secure,
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60,
          },
        );
      },
    );

    it('forwards a missing cookie as undefined', async () => {
      const authService = {
        refresh: jest.fn().mockResolvedValue(refreshResult),
      };
      const configService = {
        get: jest.fn().mockReturnValue('development'),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );

      await controller.refresh(
        { cookies: {} } as unknown as FastifyRequest,
        { setCookie: jest.fn() } as unknown as FastifyReply,
      );

      expect(authService.refresh).toHaveBeenCalledWith(undefined);
    });
  });

  describe('me', () => {
    it('returns the current user payload', () => {
      const controller = new AuthController(
        {} as unknown as AuthService,
        {} as unknown as ConfigService,
      );
      const authUser = {
        id: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
        user: loginResult.user,
      };

      expect(controller.me(authUser)).toEqual(loginResult.user);
    });
  });

  describe('logout', () => {
    it('revokes the current session and clears the refresh cookie', async () => {
      const authService = {
        logout: jest.fn().mockResolvedValue(undefined),
      };
      const configService = {
        get: jest.fn(),
      };
      const reply = {
        clearCookie: jest.fn(),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );

      await expect(
        controller.logout(
          {
            cookies: { refresh_token: 'current-refresh-token' },
          } as unknown as FastifyRequest,
          reply as unknown as FastifyReply,
        ),
      ).resolves.toEqual({});

      expect(authService.logout).toHaveBeenCalledWith('current-refresh-token');
      expect(reply.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/',
      });
    });
  });

  describe('logoutAll', () => {
    it('revokes all sessions and clears the refresh cookie', async () => {
      const authService = {
        logoutAll: jest.fn().mockResolvedValue(3),
      };
      const configService = {
        get: jest.fn(),
      };
      const reply = {
        clearCookie: jest.fn(),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );
      const authUser = {
        id: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
        user: loginResult.user,
      };

      await expect(
        controller.logoutAll(authUser, reply as unknown as FastifyReply),
      ).resolves.toEqual({ revoked: 3 });

      expect(authService.logoutAll).toHaveBeenCalledWith('user-1');
      expect(reply.clearCookie).toHaveBeenCalledWith('refresh_token', {
        path: '/',
      });
    });
  });

  describe('register', () => {
    const registerResult = {
      user: loginResult.user,
      verificationToken: 'verify-token-123',
    };

    it('exposes the verification token outside production', async () => {
      const authService = {
        register: jest.fn().mockResolvedValue(registerResult),
      };
      const configService = {
        get: jest.fn().mockReturnValue('development'),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );

      await expect(
        controller.register({
          email: 'new@example.com',
          password: 'secret123',
          firstName: 'Grace',
          lastName: 'Hopper',
        }),
      ).resolves.toEqual({
        ...registerResult.user,
        verificationToken: registerResult.verificationToken,
      });
    });

    it('hides the verification token in production', async () => {
      const authService = {
        register: jest.fn().mockResolvedValue(registerResult),
      };
      const configService = {
        get: jest.fn().mockReturnValue('production'),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        configService as unknown as ConfigService,
      );

      const response = await controller.register({
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'Grace',
        lastName: 'Hopper',
      });

      expect(response).toEqual(registerResult.user);
      expect(response).not.toHaveProperty('verificationToken');
    });
  });

  describe('verifyEmail', () => {
    it('delegates verification to the service', async () => {
      const authService = {
        verifyEmail: jest.fn().mockResolvedValue(loginResult.user),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        {} as unknown as ConfigService,
      );

      await expect(
        controller.verifyEmail({ token: 'incoming-token' }),
      ).resolves.toEqual(loginResult.user);

      expect(authService.verifyEmail).toHaveBeenCalledWith('incoming-token');
    });
  });

  describe('updateMe', () => {
    it('delegates the profile update to the service', async () => {
      const authService = {
        updateMe: jest.fn().mockResolvedValue(loginResult.user),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        {} as unknown as ConfigService,
      );
      const authUser = {
        id: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
        user: loginResult.user,
      };

      await expect(
        controller.updateMe(authUser, { firstName: 'Grace' }),
      ).resolves.toEqual(loginResult.user);

      expect(authService.updateMe).toHaveBeenCalledWith('user-1', {
        firstName: 'Grace',
      });
    });
  });

  describe('changePassword', () => {
    it('delegates the password change to the service', async () => {
      const authService = {
        changePassword: jest.fn().mockResolvedValue(undefined),
      };
      const controller = new AuthController(
        authService as unknown as AuthService,
        {} as unknown as ConfigService,
      );
      const authUser = {
        id: 'user-1',
        sessionId: 'session-1',
        roles: ['USER'],
        user: loginResult.user,
      };

      await expect(
        controller.changePassword(authUser, {
          currentPassword: 'old-secret',
          newPassword: 'new-secret123',
        }),
      ).resolves.toEqual({});

      expect(authService.changePassword).toHaveBeenCalledWith(
        'user-1',
        'old-secret',
        'new-secret123',
      );
    });
  });
});
