import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { RateLimitGuard } from '@common/guards/rate-limit.guard';
import { AuthModule } from '@modules/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    AuthModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, RateLimitGuard],
  exports: [TasksService, TypeOrmModule],
})
export class TasksModule {} 