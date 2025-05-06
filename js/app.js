// 自定义指令：自动聚焦编辑输入框
Vue.directive('focus', {
  inserted: function (el) {
    el.focus();
  }
});

// 创建Vue应用
new Vue({
  el: '#app',
  
  // 数据
  data: {
    // 视图控制
    currentView: 'daily', // 当前视图: 'strategy', 'daily', 'timeline'
    currentFilter: 'all',  // 当前过滤器: 'all', 'active', 'completed'
    selectedDate: new Date().toISOString().split('T')[0], // 当前选中日期，默认为今天
    
    // 任务数据
    tasks: [],
    newTask: '',
    newTaskDate: new Date().toISOString().split('T')[0], // 默认为今天的日期
    newTaskStartTime: '', // 开始时间
    newTaskEndTime: '', // 结束时间
    editingTaskCache: {}, // 用于存储编辑前的任务信息，以便取消编辑时恢复
    nextTaskId: 1, // 用于生成唯一ID
    
    // 战略规划数据
    strategies: [],
    newStrategy: {
      title: '',
      description: ''
    },
    editingStrategyCache: {}, // 用于存储编辑前的规划信息
    nextStrategyId: 1 // 用于生成唯一ID
  },
  
  // 计算属性
  computed: {
    // 未完成任务数量
    activeTasksCount() {
      return this.tasks.filter(task => !task.completed).length;
    },
    
    // A已完成任务数量
    completedTasksCount() {
      return this.tasks.filter(task => task.completed).length;
    },
    
    // 今天的日期 (YYYY-MM-DD 格式)
    today() {
      return new Date().toISOString().split('T')[0];
    },
    
    // 根据过滤条件筛选后的任务
    filteredTasks() {
      // 首先按日期筛选
      const dateFilteredTasks = this.tasks.filter(task => task.date === this.selectedDate);
      
      // 然后按完成状态筛选
      switch (this.currentFilter) {
        case 'all':
          return dateFilteredTasks;
          
        case 'active':
          return dateFilteredTasks.filter(task => !task.completed);
          
        case 'completed':
          return dateFilteredTasks.filter(task => task.completed);
          
        default:
          return dateFilteredTasks;
      }
    },
    
    // 获取所有任务的日期列表（不重复）
    uniqueDates() {
      const dates = this.tasks.map(task => task.date);
      return [...new Set(dates)].sort();
    },
    
    // 用于时间轴的任务（有开始和结束时间）
    tasksForTimeline() {
      return this.tasks.filter(task => 
        task.date === this.selectedDate && 
        task.startTime && 
        task.endTime
      );
    },
    
    // 无时间信息的任务
    tasksWithoutTime() {
      return this.tasks.filter(task => 
        task.date === this.selectedDate && 
        (!task.startTime || !task.endTime)
      );
    }
  },
  
  // 在Vue实例创建后立即调用
  created() {
    // 从本地存储加载数据
    this.loadData();
    
    // 每分钟更新一次时间轴上的当前时间指示器
    if (this.isToday(this.selectedDate)) {
      this.startTimeUpdater();
    }
  },
  
  // 在Vue实例销毁前停止计时器
  beforeDestroy() {
    this.stopTimeUpdater();
  },
  
  // 方法
  methods: {
    // ===== 视图控制 =====
    // 切换视图
    switchView(view) {
      this.currentView = view;
      
      // 如果切换到时间轴视图并且是今天，启动时间更新器
      if (view === 'timeline' && this.isToday(this.selectedDate)) {
        this.startTimeUpdater();
      } else {
        this.stopTimeUpdater();
      }
    },
    
    // 设置任务过滤器
    setFilter(filter) {
      this.currentFilter = filter;
    },
    
    // 选择日期
    selectDate(date) {
      this.selectedDate = date;
      
      // 如果是在时间轴视图且选择了今天的日期，启动时间更新器
      if (this.currentView === 'timeline' && this.isToday(date)) {
        this.startTimeUpdater();
      } else {
        this.stopTimeUpdater();
      }
    },
    
    // ===== 战略规划功能 =====
    // 添加新规划
    addStrategy() {
      const strategyTitle = this.newStrategy.title.trim();
      const strategyDesc = this.newStrategy.description.trim();
      
      // 如果标题为空，不添加
      if (!strategyTitle) return;
      
      // 创建新规划对象
      const newStrategy = {
        id: this.nextStrategyId++,
        title: strategyTitle,
        description: strategyDesc,
        completed: false,
        editing: false,
        createdAt: new Date().toISOString()
      };
      
      // 添加到规划列表
      this.strategies.push(newStrategy);
      
      // 清空输入
      this.newStrategy.title = '';
      this.newStrategy.description = '';
      
      // 保存到本地存储
      this.saveData();
    },
    
    // 编辑规划
    editStrategy(index) {
      // 缓存当前规划，以便取消编辑时恢复
      this.editingStrategyCache = { ...this.strategies[index] };
      
      // 设置编辑状态
      this.strategies[index].editing = true;
    },
    
    // 完成编辑规划
    finishEditStrategy(index) {
      const strategy = this.strategies[index];
      
      // 如果标题为空，删除该规划
      if (!strategy.title.trim()) {
        this.deleteStrategy(index);
        return;
      }
      
      // 取消编辑状态
      strategy.editing = false;
      
      // 清除缓存
      this.editingStrategyCache = {};
      
      // 保存到本地存储
      this.saveData();
    },
    
    // 取消编辑规划
    cancelEditStrategy(index) {
      // 恢复原规划数据
      this.strategies[index] = { ...this.editingStrategyCache };
      
      // 清除缓存
      this.editingStrategyCache = {};
    },
    
    // 删除规划
    deleteStrategy(index) {
      this.strategies.splice(index, 1);
      this.saveData();
    },
    
    // ===== 每日任务功能 =====
    // 添加新任务
    addTask() {
      const taskTitle = this.newTask.trim();
      
      // 如果任务标题为空，不添加
      if (!taskTitle) return;
      
      // 创建新任务对象
      const newTask = {
        id: this.nextTaskId++,
        title: taskTitle,
        completed: false,
        editing: false,
        date: this.newTaskDate, // 使用设置的日期
        startTime: this.newTaskStartTime, // 开始时间
        endTime: this.newTaskEndTime, // 结束时间
        createdAt: new Date().toISOString()
      };
      
      // 添加到任务列表
      this.tasks.unshift(newTask);
      
      // 清空输入框
      this.newTask = '';
      
      // 保存到本地存储
      this.saveData();
    },
    
    // 删除任务
    deleteTask(task) {
      const index = this.tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        this.tasks.splice(index, 1);
        this.saveData();
      }
    },
    
    // 开始编辑任务
    editTask(task) {
      // 先取消所有其他任务的编辑状态
      this.tasks.forEach(t => {
        if (t.id !== task.id) {
          t.editing = false;
        }
      });
      
      // 缓存当前任务，以便取消编辑时恢复
      this.editingTaskCache = { ...task };
      
      // 设置当前任务为编辑状态
      task.editing = true;
    },
    
    // 完成编辑任务
    doneEdit(task) {
      // 如果标题为空，删除该任务
      if (!task.title.trim()) {
        this.deleteTask(task);
        return;
      }
      
      // 取消编辑状态
      task.editing = false;
      
      // 清除缓存
      this.editingTaskCache = {};
      
      // 保存到本地存储
      this.saveData();
    },
    
    // 取消编辑任务
    cancelEdit(task) {
      // 恢复原任务数据
      const index = this.tasks.findIndex(t => t.id === task.id);
      if (index !== -1) {
        Object.assign(task, this.editingTaskCache);
      }
      
      // 取消编辑状态
      task.editing = false;
      
      // 清除缓存
      this.editingTaskCache = {};
    },
    
    // 清除所有已完成任务
    clearCompleted() {
      this.tasks = this.tasks.filter(task => !task.completed);
      this.saveData();
    },
    
    // ===== 时间轴功能 =====
    // 获取任务在时间轴上的样式
    getTaskTimeStyle(task) {
      if (!task.startTime || !task.endTime) return {};
      
      // 将时间转换为分钟数
      const startMinutes = this.timeToMinutes(task.startTime);
      const endMinutes = this.timeToMinutes(task.endTime);
      
      // 计算时间轴上的位置和高度
      const top = (startMinutes / (24 * 60)) * 600; // 时间轴高度为600px
      const height = ((endMinutes - startMinutes) / (24 * 60)) * 600;
      
      return {
        top: top + 'px',
        height: Math.max(height, 30) + 'px' // 最小高度30px以确保可见
      };
    },
    
    // 获取当前时间线的样式
    getCurrentTimeStyle() {
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const totalMinutes = hours * 60 + minutes;
      
      // 计算在时间轴上的位置
      const top = (totalMinutes / (24 * 60)) * 600; // 时间轴高度为600px
      
      return {
        top: top + 'px'
      };
    },
    
    // 时间字符串转换为分钟数
    timeToMinutes(timeString) {
      if (!timeString) return 0;
      
      const [hours, minutes] = timeString.split(':').map(Number);
      return hours * 60 + minutes;
    },
    
    // 启动时间更新器
    startTimeUpdater() {
      // 先清除可能存在的计时器
      this.stopTimeUpdater();
      
      // 创建新的计时器，每分钟更新一次
      this.timeUpdater = setInterval(() => {
        // 强制Vue更新计算属性
        this.$forceUpdate();
      }, 60000); // 60000毫秒 = 1分钟
    },
    
    // 停止时间更新器
    stopTimeUpdater() {
      if (this.timeUpdater) {
        clearInterval(this.timeUpdater);
        this.timeUpdater = null;
      }
    },
    
    // ===== 辅助功能 =====
    // 格式化日期显示
    formatDate(dateString) {
      if (!dateString) return '';
      
      const date = new Date(dateString);
      
      // 判断是否为今天
      if (dateString === this.today) {
        return '今天 (' + date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ')';
      }
      
      return date.toLocaleDateString('zh-CN', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        weekday: 'short' 
      });
    },
    
    // 判断日期是否为今天
    isToday(dateString) {
      return dateString === this.today;
    },
    
    // ===== 数据持久化 =====
    // 保存数据到本地存储
    saveData() {
      const data = {
        tasks: this.tasks,
        strategies: this.strategies,
        nextTaskId: this.nextTaskId,
        nextStrategyId: this.nextStrategyId
      };
      localStorage.setItem('todoList', JSON.stringify(data));
    },
    
    // 从本地存储加载数据
    loadData() {
      const savedData = localStorage.getItem('todoList');
      if (savedData) {
        const data = JSON.parse(savedData);
        
        // 加载任务数据
        if (data.tasks) {
          this.tasks = data.tasks;
          this.nextTaskId = data.nextTaskId || (Math.max(0, ...this.tasks.map(t => t.id)) + 1);
        }
        
        // 加载规划数据
        if (data.strategies) {
          this.strategies = data.strategies;
          this.nextStrategyId = data.nextStrategyId || (Math.max(0, ...this.strategies.map(s => s.id)) + 1);
        }
      }
    },
    
    // 导出数据为JSON文件
    exportData() {
      // 创建数据对象
      const data = {
        tasks: this.tasks,
        strategies: this.strategies,
        nextTaskId: this.nextTaskId,
        nextStrategyId: this.nextStrategyId,
        exportedAt: new Date().toISOString()
      };
      
      // 转换为JSON字符串
      const jsonData = JSON.stringify(data, null, 2);
      
      // 创建Blob对象
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      // 创建URL
      const url = URL.createObjectURL(blob);
      
      // 创建下载链接
      const a = document.createElement('a');
      a.href = url;
      a.download = `todo-list-backup-${new Date().toISOString().split('T')[0]}.json`;
      
      // 模拟点击下载
      document.body.appendChild(a);
      a.click();
      
      // 清理
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    
    // 导入数据
    importData(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          
          // 验证数据结构
          if (Array.isArray(data.tasks)) {
            this.tasks = data.tasks;
            this.nextTaskId = data.nextTaskId || (Math.max(0, ...this.tasks.map(t => t.id)) + 1);
            
            // 加载规划数据（如果存在）
            if (Array.isArray(data.strategies)) {
              this.strategies = data.strategies;
              this.nextStrategyId = data.nextStrategyId || (Math.max(0, ...this.strategies.map(s => s.id)) + 1);
            }
            
            this.saveData();
            alert('数据导入成功！');
          } else {
            alert('导入失败：无效的数据格式');
          }
        } catch (error) {
          alert('导入失败：' + error.message);
        }
      };
      
      reader.readAsText(file);
      
      // 重置文件输入，允许重复导入同一文件
      event.target.value = '';
    }
  }
}); 