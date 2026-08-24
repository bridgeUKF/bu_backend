import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';

export type AccessTokenPayload = {
  sub: string;
  sessionId?: string;
  roles: string[];
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(payload: AccessTokenPayload): string {
    const expiresIn = this.configService.getOrThrow<
      JwtSignOptions['expiresIn']
    >('app.jwtAccessExpiresIn');

    return this.jwtService.sign(
      {
        sub: payload.sub,
        ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
        roles: payload.roles,
      },
      {
        expiresIn,
      },
    );
  }
}
