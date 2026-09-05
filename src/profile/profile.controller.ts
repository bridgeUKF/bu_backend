import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Put,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ProfileService } from './profile.service';

@ApiTags('profile')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'profile',
  version: '1',
})
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own student profile' })
  @ApiOkResponse({ description: 'StudentProfile' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  getMe(@CurrentUser() authUser: AuthenticatedUser) {
    return this.getByUserIdOrFail(authUser.id);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update own student profile (upsert)' })
  @ApiOkResponse({ description: 'Upserted StudentProfile' })
  @ApiBadRequestResponse({
    description: 'Nothing to update / validation failed',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  upsertMe(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() upsertProfileDto: UpsertProfileDto,
  ) {
    return this.profileService.upsertMyProfile(authUser.id, upsertProfileDto);
  }

  @Get(':userId')
  @ApiOperation({
    summary: 'Get public student profile by user id (authenticated)',
  })
  @ApiOkResponse({ description: 'StudentProfile' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  getByUserId(@Param('userId') userId: string) {
    return this.getByUserIdOrFail(userId);
  }

  @Put('me/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload own avatar (multipart file)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOkResponse({ description: 'StudentProfile with avatarUrl' })
  @ApiBadRequestResponse({ description: 'File is required / bad mime' })
  @ApiPayloadTooLargeResponse({ description: 'File is too large (max 2MB)' })
  @ApiServiceUnavailableResponse({
    description: 'File storage is not configured',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  async uploadAvatar(
    @CurrentUser() authUser: AuthenticatedUser,
    @Req()
    req: FastifyRequest & { file: () => Promise<MultipartFile | undefined> },
  ) {
    let data: MultipartFile | undefined;

    try {
      data = await req.file();
    } catch {
      throw new PayloadTooLargeException('File is too large');
    }

    if (!data) {
      throw new BadRequestException('File is required');
    }

    let buffer: Buffer;

    try {
      buffer = await data.toBuffer();
    } catch {
      throw new PayloadTooLargeException('File is too large');
    }

    return this.profileService.setAvatar(authUser.id, {
      buffer,
      mimetype: data.mimetype,
      size: buffer.byteLength,
    });
  }

  @Delete('me/avatar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete own avatar (idempotent)' })
  @ApiOkResponse({ description: 'StudentProfile without avatar' })
  @ApiNotFoundResponse({ description: 'Profile not found' })
  @ApiServiceUnavailableResponse({
    description: 'File storage is not configured',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  async removeAvatar(@CurrentUser() authUser: AuthenticatedUser) {
    const profile = await this.profileService.removeAvatar(authUser.id);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }

  private async getByUserIdOrFail(userId: string) {
    const profile = await this.profileService.getByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }
}
