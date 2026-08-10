import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller({
  path: 'health',
  version: '1',
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Check application infrastructure health' })
  @ApiOkResponse({
    description: 'Health status for the application and infrastructure',
  })
  getStatus() {
    return this.healthService.getStatus();
  }
}
