import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
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
  @ApiOperation({
    summary: 'Register a new user (PENDING, verification email sent)',
  })
  @ApiCreatedResponse({
    description: 'User registered (safe UserRecord, no token)',
  })
  @ApiConflictResponse({ description: 'Email already exists' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email by token (PENDING → ACTIVE)' })
  @ApiOkResponse({ description: 'Email verified (ACTIVE UserRecord)' })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification token',
  })
  verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend verification email (always 200, anti-enumeration)',
  })
  @ApiOkResponse({
    description: 'Always {} (silent no-op for unknown/non-PENDING)',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto,
  ) {
    await this.authService.resendVerification(resendVerificationDto.email);

    return {};
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login (ACTIVE only) → access JWT + refresh cookie',
  })
  @ApiOkResponse({
    description: '{ accessToken, user }; refresh_token in HttpOnly cookie',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiBadRequestResponse({ description: 'Validation failed' })
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
  @ApiOperation({
    summary: 'Rotate refresh token → new access JWT + new cookie',
  })
  @ApiOkResponse({
    description: '{ accessToken, user }; old refresh invalidated',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ description: 'Safe UserRecord' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  me(@CurrentUser() authUser: AuthenticatedUser) {
    return authUser.user;
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user first/last name' })
  @ApiOkResponse({ description: 'Updated UserRecord' })
  @ApiBadRequestResponse({
    description: 'Nothing to update / validation failed',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  updateMe(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() updateMeDto: UpdateMeDto,
  ) {
    return this.authService.updateMe(authUser.id, updateMeDto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (revokes all sessions)' })
  @ApiOkResponse({ description: '{}; client must re-login' })
  @ApiUnauthorizedResponse({
    description: 'Invalid access token / current password',
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  async changePassword(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      authUser.id,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );

    return {};
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout current session (idempotent, clears cookie)',
  })
  @ApiOkResponse({ description: '{}' })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions of current user' })
  @ApiOkResponse({ description: '{ revoked: n }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
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
