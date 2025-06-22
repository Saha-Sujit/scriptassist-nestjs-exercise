import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, HttpException, HttpStatus, UseInterceptors, NotFoundException, HttpCode } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TaskStatus } from './enums/task-status.enum';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { PaginatedTasksDto } from './dto/paginated-tasks.dto';

// Added AuthModule for JwtAuthGuard and RateLimitGuard for request throttling
// class JwtAuthGuard {}

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard, RateLimitGuard)
@RateLimit({ limit: 100, windowMs: 60000 })
@ApiBearerAuth()
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    // Anti-pattern: should be removed or commented out
    // @InjectRepository(Task)
    // private taskRepository: Repository<Task>
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@Body() createTaskDto: CreateTaskDto) {
    return this.tasksService.create(createTaskDto);
  }

  @Get()
  @ApiOperation({ summary: 'Find all tasks with optional filtering' })
  async findAll(@Query() query: QueryTasksDto): Promise<PaginatedTasksDto> {
    // Clean: Filtering and pagination handled by service/database
    return await this.tasksService.findAll(query);
  }


  @Get('stats')
  @ApiOperation({ summary: 'Get task statistics' })
  async getStats() {
    // Optimized: Uses SQL aggregation instead of in-memory filtering
    return this.tasksService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Find a task by ID' })
  async findOne(@Param('id') id: string) {
    const task = await this.tasksService.findOne(id);

    if (!task) {
      // Improved error handling: Generic message using NotFoundException
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task' })
  async update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto) {
    // Ensures task exists before attempting update
    const task = await this.tasksService.findOne(id);

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return await this.tasksService.update(id, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Batch process multiple tasks' })
  async batchProcess(
    @Body() operations: { tasks: string[]; action: string },
  ): Promise<any[]> {
    const { tasks: taskIds, action } = operations;

    if (!['complete', 'delete'].includes(action)) {
      throw new HttpException(`Unknown action: ${action}`, HttpStatus.BAD_REQUEST);
    }

    const promises = taskIds.map(async (taskId) => {
      try {
        let result;

        switch (action) {
          case 'complete':
            // Update task status to COMPLETED
            result = await this.tasksService.update(taskId, {
              status: TaskStatus.COMPLETED,
            });
            break;

          case 'delete':
            // Remove task and return success message
            await this.tasksService.remove(taskId);
            result = { message: 'Task deleted successfully' };
            break;
        }

        return { taskId, success: true, result };
      } catch (error) {
        // handle errors for each task
        return {
          taskId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });

    return await Promise.all(promises);
  }

} 