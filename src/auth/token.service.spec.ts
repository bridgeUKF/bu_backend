import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let jwtService: { sign: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let tokenService: TokenService;

  beforeEach(() => {
    jwtService = { sign: jest.fn() };
    configService = { getOrThrow: jest.fn() };
    configService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'app.jwtAccessExpiresIn') {
        return '15m';
      }
      return undefined;
    });

    tokenService = new TokenService(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  it('signs a minimal access token with user id, session id and roles', () => {
    jwtService.sign.mockReturnValue('signed-access-token');

    const result = tokenService.generateAccessToken({
      sub: 'user-123',
      sessionId: 'session-456',
      roles: ['USER'],
    });

    expect(result).toBe('signed-access-token');
    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        sub: 'user-123',
        sessionId: 'session-456',
        roles: ['USER'],
      },
      { expiresIn: '15m' },
    );
    expect(configService.getOrThrow).toHaveBeenCalledWith(
      'app.jwtAccessExpiresIn',
    );
  });

  it('omits sessionId when it is not provided', () => {
    jwtService.sign.mockReturnValue('token-without-session');

    tokenService.generateAccessToken({
      sub: 'user-123',
      roles: ['USER', 'MODERATOR'],
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      {
        sub: 'user-123',
        roles: ['USER', 'MODERATOR'],
      },
      { expiresIn: '15m' },
    );
  });
});
