const cron = require('node-cron');
const Task = require('../models/Task');
const { addCrawlerTask } = require('./crawlerQueue');

class SchedulerService {
  constructor() {
    this.cronJob = null;
  }

  async start() {
    console.log('🚀 启动定时任务调度器...');
    
    // 每分钟检查一次是否有需要执行的任务
    this.cronJob = cron.schedule('* * * * *', async () => {
      try {
        await this.checkAndRunScheduledTasks();
      } catch (error) {
        console.error('⚠️  定时任务检查失败:', error);
      }
    });

    console.log('✅ 定时任务调度器已启动');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('⏹️  定时任务调度器已停止');
    }
  }

  async checkAndRunScheduledTasks() {
    console.log('🔍 检查需要执行的定时任务...');
    
    const now = new Date();
    
    // 查找所有启用了定时采集且未在运行的任务
    const scheduledTasks = await Task.find({
      'schedule.enabled': true,
      status: { $ne: 'running' } // 只处理非运行状态的任务
    });
    
    if (scheduledTasks.length === 0) {
      console.log('📋 没有需要执行的定时任务');
      return;
    }
    
    console.log(`📋 找到 ${scheduledTasks.length} 个启用了定时采集的任务`);
    
    for (const task of scheduledTasks) {
      try {
        await this.checkTaskExecution(task, now);
      } catch (error) {
        console.error(`⚠️  处理任务 ${task._id} 时出错:`, error);
      }
    }
  }

  async checkTaskExecution(task, now) {
    const { lastRunTime, interval } = task.schedule;
    const intervalMs = interval * 60 * 60 * 1000; // 转换为毫秒
    
    // 检查是否需要执行任务
    const shouldRun = !lastRunTime || (now - lastRunTime) >= intervalMs;
    
    if (shouldRun) {
      console.log(`🚀 准备执行定时任务: ${task.name || task.forumUrl}`);

      // 状态流转统一委托 taskService（D3 收敛：重置计数、记录本轮调度时间）
      await taskService.markScheduledRun(task, now);

      // 异步启动爬虫任务，不阻塞主进程（crawlType 需显式传递，否则批量任务会按单帖执行）
      try {
        await addCrawlerTask(
          task._id.toString(),
          task.crawlType === 'batch' ? task.sectionUrl : task.forumUrl,
          task.taskType,
          task.config,
          task.crawlType
        );
        console.log(`✅ 定时任务已加入队列: ${task._id}`);
      } catch (error) {
        console.error(`❌ 启动定时任务失败:`, error);
        await taskService.markFailed(task._id.toString(), error);
      }
    } else {
      // 计算下次执行时间
      if (lastRunTime) {
        const nextRunTime = new Date(lastRunTime.getTime() + intervalMs);
        console.log(`⏰ 任务 ${task.name || task.forumUrl} 下次执行时间: ${nextRunTime}`);
      } else {
        // 如果从未运行过，下次执行时间为当前时间加上间隔
        const nextRunTime = new Date(now.getTime() + intervalMs);
        console.log(`⏰ 任务 ${task.name || task.forumUrl} 下次执行时间: ${nextRunTime}`);
      }
    }
  }
}

// 导出单例实例
module.exports = new SchedulerService();