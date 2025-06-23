import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { TasksService } from '../../modules/tasks/tasks.service';
import { TaskStatus } from '@modules/tasks/enums/task-status.enum';
import { chunk } from 'lodash';

@Injectable()
@Processor('task-processing')
export class TaskProcessorService extends WorkerHost {
  private readonly logger = new Logger(TaskProcessorService.name);

  constructor(private readonly tasksService: TasksService, 
    @InjectQueue('task-processing') private readonly taskQueue: Queue) {
    super();
  }
  
  async enqueueOverdueTasks(taskIds: string[]) {
    await this.taskQueue.add('process-overdue-task', { taskIds }, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 10000,
      },
      removeOnComplete: true,
      removeOnFail: false,
      priority: 1,
    });
  }

  async enqueueStatusUpdate(taskId: string, status: string) {
    await this.taskQueue.add('task-status-update', { taskId, status }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: true,
      removeOnFail: false,
      priority: 2,
    });
  }

  async process(job: Job): Promise<any> {
    this.logger.debug(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      switch (job.name) {
        case 'task-status-update':
          return await this.handleStatusUpdate(job);
        case 'process-overdue-task':
          return await this.handleOverdueTasks(job);
        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return { success: false, error: 'Unknown job type' };
      }
    } catch (error) {
      this.logger.error(`Error processing job ${job.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  private async handleStatusUpdate(job: Job) {
    const { taskId, status } = job.data;

    if (!taskId || !status) {
      this.logger.warn(`Invalid data for job ${job.id}: ${JSON.stringify(job.data)}`);
      return { success: false, error: 'Missing required data' };
    }

    // Adding enum validation
    if (!Object.values(TaskStatus).includes(status)) {
      this.logger.warn(`Invalid status value: ${status}`);
      return { success: false, error: 'Invalid status value' };
    }

    try {
      const task = await this.tasksService.updateStatus(taskId, status);

      this.logger.log(`Updated task ${task.id} to status ${task.status}`);

      return {
        success: true,
        taskId: task.id,
        newStatus: task.status,
      };
    } catch (error: any) {
      // BullMQ will retry based on attempts/backoff
      this.logger.error(`Failed to update status for task ${taskId}: ${error.message}`);
      throw error; 
    }
  }

  private async handleOverdueTasks(job: Job) {
    const { taskIds } = job.data;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      this.logger.warn('No overdue tasks provided for notification');
      return { success: false, message: 'No tasks to process' };
    }

    this.logger.debug(`Processing ${taskIds.length} overdue task notifications`);

    const chunked = chunk(taskIds, 20);
    let successCount = 0;
    let failureCount = 0;

    for (const group of chunked) {
      await Promise.allSettled(group.map(async (taskId: string) => {
        try {
          // we can call a below service to send email/notification/update DB
          // await this.tasksService.notifyOverdue(taskId);
          this.logger.debug(`Notified for overdue task ${taskId}`);
          successCount++;
        } catch (error: any) {
          this.logger.warn(`Failed to notify for overdue task ${taskId}: ${error.message}`);
          failureCount++;
        }
      }));
    }

    return {
      success: failureCount === 0,
      processed: successCount,
      failed: failureCount,
    };
  }
} 