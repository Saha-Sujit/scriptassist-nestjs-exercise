import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { TaskStatisticsDto } from './dto/task-statistics.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { PaginatedTasksDto } from './dto/paginated-tasks.dto';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private readonly dataSource: DataSource,
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    let savedTask!: Task;

    await this.dataSource.transaction(async (manager) => {
      const task = manager.create(Task, createTaskDto);
      savedTask = await manager.save(task);
    });

    // Queueing outside transaction to avoid blocking DB commit
    try {
      await this.taskQueue.add('task-status-update', {
        taskId: savedTask.id,
        status: savedTask.status,
      });
    } catch (err) {
      // Optional: handle or log queue error
      console.error('Failed to queue task status update:', err);
    }

    return savedTask;
  }


  async findAll(query: QueryTasksDto): Promise<PaginatedTasksDto> {
    // Efficient: Supports pagination and filtering, avoids loading unnecessary relations
    const { status, priority, page = 1, limit = 10 } = query;

    const qb = this.tasksRepository.createQueryBuilder('tasks');

    if (status) {
      qb.andWhere('tasks.status = :status', { status });
    }

    if (priority) {
      qb.andWhere('tasks.priority = :priority', { priority });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      count: data.length,
      total,
    };
  }



  async findOne(id: string): Promise<Task> {
    // Optimized: Single DB call for fetch and check
    const task = await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    return await this.dataSource.transaction(async (manager) => {
      const task = await manager.findOne(Task, {
        where: { id },
        relations: ['user'],
      });

      if (!task) {
        throw new NotFoundException(`Task with ID ${id} not found`);
      }

      const originalStatus = task.status;

      // Clean update: map only allowed fields
      Object.assign(task, updateTaskDto);

      const updatedTask = await manager.save(task);

      // Handle status change queue safely
      if (originalStatus !== updatedTask.status) {
        try {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask.id,
            status: updatedTask.status,
          });
        } catch (err) {
          // You can log or handle the error based on importance
          console.error('Failed to enqueue task status update:', err);
        }
      }

      return updatedTask;
    });
  }

  // Optimized: uses a single delete operation instead of fetching first
  // Validates existence via affected row check to avoid silent failures
  // Returns a user-friendly success message instead of a raw boolean
  async remove(id: string): Promise<{ message: string }> {
    const result = await this.tasksRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

      return { message: 'Task deleted successfully' };
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
  // Optimized: Uses QueryBuilder for better readability and security
  return this.tasksRepository
    .createQueryBuilder('task')
    .where('task.status = :status', { status })
    .getMany();
  }

  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    // Optimized: Uses enum type and validates task existence before update
    const task = await this.findOne(id);
    task.status = status;
    return await this.tasksRepository.save(task);
  }

  async getStatistics(): Promise<TaskStatisticsDto> {
    // Optimized: Uses SQL aggregation instead of in-memory filtering
    const qb = this.tasksRepository.createQueryBuilder('task');

    const result = await qb
      .select([
        'COUNT(*) as total',
        `SUM(CASE WHEN task.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed`,
        `SUM(CASE WHEN task.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgress`,
        `SUM(CASE WHEN task.status = 'PENDING' THEN 1 ELSE 0 END) as pending`,
        `SUM(CASE WHEN task.priority = 'HIGH' THEN 1 ELSE 0 END) as highPriority`,
      ])
      .getRawOne();

    return {
      total: Number(result.total),
      completed: Number(result.completed),
      inProgress: Number(result.inProgress),
      pending: Number(result.pending),
      highPriority: Number(result.highPriority),
    };
  }
}
