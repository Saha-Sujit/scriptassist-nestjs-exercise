import { ApiProperty } from '@nestjs/swagger';

export class TaskStatisticsDto {
  @ApiProperty({ example: 100 })
  total: number;

  @ApiProperty({ example: 60 })
  completed: number;

  @ApiProperty({ example: 20 })
  inProgress: number;

  @ApiProperty({ example: 15 })
  pending: number;

  @ApiProperty({ example: 25 })
  highPriority: number;
}