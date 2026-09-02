import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthenticatedUser, AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const createContext = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  const authUser: AuthenticatedUser = {
    id: 'user-1',
    sessionId: 'session-1',
    roles: ['USER'],
    user: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'ACTIVE' as const,
      emailVerifiedAt: null,
      createdAt: new Date('2026-08-15T08:00:00.000Z'),
      updatedAt: new Date('2026-08-15T08:00:00.000Z'),
    },
  };

  const setup = () => {
    const authService = {
      validateAccess: jest.fn(),
    };
    const guard = new JwtAuthGuard(authService as unknown as AuthService);
    return { authService, guard };
  };

  it('allows a request with a valid bearer token and attaches the user', async () => {
    const { authService, guard } = setup();
    authService.validateAccess.mockResolvedValue(authUser);
    const request: { headers: Record<string, string>; user?: unknown } = {
      headers: { authorization: 'Bearer valid-token' },
    };

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);

    expect(authService.validateAccess).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual(authUser);
  });

  it('rejects a missing authorization header', async () => {
    const { authService, guard } = setup();
    const request = { headers: {} };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );

    expect(authService.validateAccess).not.toHaveBeenCalled();
  });

  it('rejects a non-bearer scheme', async () => {
    const { authService, guard } = setup();
    const request = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );

    expect(authService.validateAccess).not.toHaveBeenCalled();
  });

  it('rejects a malformed header without a token', async () => {
    const { authService, guard } = setup();
    const request = { headers: { authorization: 'Bearer' } };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );

    expect(authService.validateAccess).not.toHaveBeenCalled();
  });

  it('rejects when access validation fails', async () => {
    const { authService, guard } = setup();
    authService.validateAccess.mockRejectedValue(
      new UnauthorizedException('Invalid access token'),
    );
    const request = { headers: { authorization: 'Bearer bad-token' } };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      new UnauthorizedException('Invalid access token'),
    );
  });
});
