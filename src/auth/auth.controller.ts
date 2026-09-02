import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller({
  path: 'auth',
  version: '1',
})
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(loginDto);

    this.setRefreshCookie(res, refreshToken);

    return {
      accessToken,
      user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const { accessToken, refreshToken, user } = await this.authService.refresh(
      req.cookies?.refresh_token,
    );

    this.setRefreshCookie(res, refreshToken);

    return {
      accessToken,
      user,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() authUser: AuthenticatedUser) {
    return authUser.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.authService.logout(req.cookies?.refresh_token);

    this.clearRefreshCookie(res);

    return {};
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() authUser: AuthenticatedUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const revoked = await this.authService.logoutAll(authUser.id);

    this.clearRefreshCookie(res);

    return { revoked };
  }

  private setRefreshCookie(res: FastifyReply, refreshToken: string): void {
    res.setCookie('refresh_token', refreshToken, {
      path: '/',
      httpOnly: true,
      secure: this.configService.get<string>('app.nodeEnv') === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
    });
  }

  private clearRefreshCookie(res: FastifyReply): void {
    res.clearCookie('refresh_token', { path: '/' });
  }
}
