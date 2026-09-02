import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { UserAuthRecord, UserRecord, UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionRepository } from './session.repository';
import { TokenService } from './token.service';

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserRecord;
};

export type AuthenticatedUser = {
  id: string;
  sessionId: string;
  roles: string[];
  user: UserRecord;
};

@Injectable()
export class AuthService {
  private static readonly invalidCredentialsMessage =
    'Invalid email or password';
  private static readonly invalidRefreshTokenMessage = 'Invalid refresh token';
  private static readonly invalidAccessTokenMessage = 'Invalid access token';

  constructor(
    private readonly userService: UserService,
    private readonly tokenService: TokenService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponse> {
    const user = await this.userService.findByEmail(loginDto.email);

    if (!user || !this.canAuthenticate(user.status)) {
      throw new UnauthorizedException(AuthService.invalidCredentialsMessage);
    }

    const passwordMatches = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(AuthService.invalidCredentialsMessage);
    }

    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.sessionRepository.create({
      userId: user.id,
      refreshTokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lastUsedAt: new Date(),
    });

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      sessionId: session.id,
      roles: user.roles.map((userRole) => userRole.role.name),
    });

    return {
      accessToken,
      refreshToken,
      user: this.toUserRecord(user),
    };
  }

  async refresh(refreshToken: string | undefined): Promise<LoginResponse> {
    if (!refreshToken) {
      throw new UnauthorizedException(AuthService.invalidRefreshTokenMessage);
    }

    const session = await this.sessionRepository.findByRefreshTokenHash(
      this.hashRefreshToken(refreshToken),
    );

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException(AuthService.invalidRefreshTokenMessage);
    }

    const user = await this.userService.findAuthById(session.userId);

    if (!user || !this.canAuthenticate(user.status)) {
      throw new UnauthorizedException(AuthService.invalidRefreshTokenMessage);
    }

    const nextRefreshToken = this.generateRefreshToken();
    const updatedSession = await this.sessionRepository.updateRefreshToken(
      session.id,
      this.hashRefreshToken(nextRefreshToken),
    );

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      sessionId: updatedSession.id,
      roles: user.roles.map((userRole) => userRole.role.name),
    });

    return {
      accessToken,
      refreshToken: nextRefreshToken,
      user: this.toUserRecord(user),
    };
  }

  async validateAccess(token: string): Promise<AuthenticatedUser> {
    const payload = this.tokenService.verifyAccessToken(token);

    if (!payload.sessionId) {
      throw new UnauthorizedException(AuthService.invalidAccessTokenMessage);
    }

    const session = await this.sessionRepository.findById(payload.sessionId);

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.userId !== payload.sub
    ) {
      throw new UnauthorizedException(AuthService.invalidAccessTokenMessage);
    }

    const user = await this.userService.findAuthById(payload.sub);

    if (!user || !this.canAuthenticate(user.status)) {
      throw new UnauthorizedException(AuthService.invalidAccessTokenMessage);
    }

    return {
      id: user.id,
      sessionId: session.id,
      roles: payload.roles,
      user: this.toUserRecord(user),
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }

    const session = await this.sessionRepository.findByRefreshTokenHash(
      this.hashRefreshToken(refreshToken),
    );

    if (!session || session.revokedAt) {
      return;
    }

    await this.sessionRepository.revoke(session.id);
  }

  logoutAll(userId: string): Promise<number> {
    return this.sessionRepository.revokeAllForUser(userId);
  }

  async register(registerDto: RegisterDto): Promise<UserRecord> {
    const existingUser = await this.userService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    try {
      return await this.userService.createWithRole(
        {
          email: registerDto.email,
          passwordHash,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          status: UserStatus.PENDING,
          emailVerifiedAt: null,
        },
        'USER',
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already exists');
      }

      throw error;
    }
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private canAuthenticate(status: UserStatus): boolean {
    return status === UserStatus.ACTIVE;
  }

  private toUserRecord(user: UserAuthRecord): UserRecord {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
