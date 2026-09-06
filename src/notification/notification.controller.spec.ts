import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';

describe('NotificationController', () => {
  const authUser = {
    id: 'user-1',
    sessionId: 'session-1',
    roles: ['USER'],
    user: {
      id: 'user-1',
      email: 'user@example.com',
      firstName: 'Ada',
      lastName: 'Lovelace',
      status: 'ACTIVE' as const,
      emailVerifiedAt: new Date('2026-09-03T08:00:00.000Z'),
      updatedAt: new Date('2026-09-03T08:00:00.000Z'),
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
    },
  };

  const notification = {
    id: 'notification-1',
    userId: 'user-1',
    type: NotificationType.REPORT_RESOLVED,
    title: 'Your report has been resolved',
    body: null,
    link: '/reports/report-1',
    readAt: null,
    createdAt: new Date('2026-09-03T08:00:00.000Z'),
  };

  const setup = () => {
    const notificationService = {
      listMine: jest.fn(),
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
    };
    const controller = new NotificationController(
      notificationService as unknown as NotificationService,
    );
    return { notificationService, controller };
  };

  it('list returns only own notifications', async () => {
    const { notificationService, controller } = setup();
    notificationService.listMine.mockResolvedValue({
      items: [notification],
      total: 1,
    });

    await expect(
      controller.list(authUser, { limit: 20, offset: 0 }),
    ).resolves.toEqual({ items: [notification], total: 1 });
    expect(notificationService.listMine.mock.calls).toEqual([
      [authUser, { limit: 20, offset: 0 }],
    ]);
  });

  it('read marks a single notification', async () => {
    const { notificationService, controller } = setup();
    notificationService.markAsRead.mockResolvedValue({
      ...notification,
      readAt: new Date('2026-09-04T08:00:00.000Z'),
    });

    await expect(
      controller.read(authUser, 'notification-1'),
    ).resolves.toMatchObject({ id: 'notification-1' });
    expect(notificationService.markAsRead.mock.calls).toEqual([
      [authUser, 'notification-1'],
    ]);
  });

  it('read throws 404 when there is no such notification', async () => {
    const { notificationService, controller } = setup();
    notificationService.markAsRead.mockRejectedValue(
      new NotFoundException('Notification not found'),
    );

    await expect(controller.read(authUser, 'missing')).rejects.toThrow(
      new NotFoundException('Notification not found'),
    );
  });

  it('readAll marks every unread notification', async () => {
    const { notificationService, controller } = setup();
    notificationService.markAllAsRead.mockResolvedValue({ read: 2 });

    await expect(controller.readAll(authUser)).resolves.toEqual({ read: 2 });
    expect(notificationService.markAllAsRead.mock.calls).toEqual([[authUser]]);
  });
});
