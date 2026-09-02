import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { MailService } from './mail.service';

describe('MailService', () => {
  const setup = (frontendUrl: string) => {
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.frontendUrl') {
          return frontendUrl;
        }
        if (key === 'app.mailFrom') {
          return 'BridgeU <no-reply@localhost>';
        }
        return undefined;
      }),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key === 'app.frontendUrl') {
          return frontendUrl;
        }
        throw new Error(`Missing config: ${key}`);
      }),
    };
    const logger = {
      info: jest.fn(),
    };
    const mailService = new MailService(
      configService as unknown as ConfigService,
      logger as unknown as PinoLogger,
    );
    return { mailService, logger };
  };

  it('logs the verification link instead of sending (log driver)', async () => {
    const { mailService, logger } = setup('http://localhost:3000');

    await mailService.sendVerificationEmail('user@example.com', 'token-123');

    expect(logger.info.mock.calls).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        link: 'http://localhost:3000/verify-email?token=token-123',
      }),
      expect.any(String),
    );
  });
});
