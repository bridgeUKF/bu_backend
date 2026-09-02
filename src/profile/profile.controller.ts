import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.service';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ProfileService } from './profile.service';

@UseGuards(JwtAuthGuard)
@Controller({
  path: 'profile',
  version: '1',
})
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMe(@CurrentUser() authUser: AuthenticatedUser) {
    return this.getByUserIdOrFail(authUser.id);
  }

  @Put('me')
  @HttpCode(HttpStatus.OK)
  upsertMe(
    @CurrentUser() authUser: AuthenticatedUser,
    @Body() upsertProfileDto: UpsertProfileDto,
  ) {
    return this.profileService.upsertMyProfile(authUser.id, upsertProfileDto);
  }

  @Get(':userId')
  getByUserId(@Param('userId') userId: string) {
    return this.getByUserIdOrFail(userId);
  }

  private async getByUserIdOrFail(userId: string) {
    const profile = await this.profileService.getByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    return profile;
  }
}
