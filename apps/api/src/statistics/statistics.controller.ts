import { Controller, Get, Query } from '@nestjs/common';
import {
  statisticsQuerySchema,
  type StatisticsQuery,
  type StatisticsResponse,
} from '@privatura/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StatisticsService } from './statistics.service';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get()
  summary(
    @Query(new ZodValidationPipe(statisticsQuerySchema)) query: StatisticsQuery,
  ): Promise<StatisticsResponse> {
    return this.statistics.summary(query);
  }
}
