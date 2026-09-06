import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({
  path: 'notifications',
  version: '1',
})
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List own notifications (newest first)' })
  @ApiOkResponse({ description: '{ items, total }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  list(
    @CurrentUser() authUser: AuthenticatedUser,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationService.listMine(authUser, {
      limit: query.limit ?? 20,
      offset: query.offset ?? 0,
    });
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all own unread notifications as read' })
  @ApiOkResponse({ description: '{ read: n }' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  readAll(@CurrentUser() authUser: AuthenticatedUser) {
    return this.notificationService.markAllAsRead(authUser);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single own notification as read' })
  @ApiOkResponse({ description: 'Read Notification' })
  @ApiNotFoundResponse({ description: 'Notification not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid access token' })
  read(@CurrentUser() authUser: AuthenticatedUser, @Param('id') id: string) {
    return this.notificationService.markAsRead(authUser, id);
  }
}
