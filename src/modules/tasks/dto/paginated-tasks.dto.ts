import { ApiProperty } from '@nestjs/swagger';
import { Task } from '../entities/task.entity';

export class PaginatedTasksDto {
  @ApiProperty({ type: [Task] })
  data: Task[];

  @ApiProperty({ example: 10 })
  count: number;

  @ApiProperty({ example: 100 })
  total: number;
}
