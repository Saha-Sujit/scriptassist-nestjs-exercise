import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(query: QueryTasksDto): Promise<PaginatedTasksDto> {
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
    // Inefficient implementation: two separate database calls
    const count = await this.tasksRepository.count({ where: { id } });

    if (count === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return (await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    })) as Task;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Inefficient implementation: multiple database calls
    // and no transaction handling
    const task = await this.findOne(id);

    const originalStatus = task.status;

    // Directly update each field individually
    if (updateTaskDto.title) task.title = updateTaskDto.title;
    if (updateTaskDto.description) task.description = updateTaskDto.description;
    if (updateTaskDto.status) task.status = updateTaskDto.status;
    if (updateTaskDto.priority) task.priority = updateTaskDto.priority;
    if (updateTaskDto.dueDate) task.dueDate = updateTaskDto.dueDate;

    const updatedTask = await this.tasksRepository.save(task);

    // Add to queue if status changed, but without proper error handling
    if (originalStatus !== updatedTask.status) {
      this.taskQueue.add('task-status-update', {
        taskId: updatedTask.id,
        status: updatedTask.status,
      });
    }

    return updatedTask;
  }

  async remove(id: string): Promise<void> {
    // Inefficient implementation: two separate database calls
    const task = await this.findOne(id);
    await this.tasksRepository.remove(task);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
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
