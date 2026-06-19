#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 数据文件路径
const DATA_FILE = path.join(process.cwd(), 'todos.json');

// 读取任务列表
function loadTodos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('读取任务失败:', error.message);
  }
  return [];
}

// 保存任务列表
function saveTodos(todos) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2));
    return true;
  } catch (error) {
    console.error('保存任务失败:', error.message);
    return false;
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
Todo List CLI 工具

使用方法:
  todo add <任务描述>      添加新任务
  todo list               列出所有任务
  todo done <任务ID>       标记任务为完成
  todo rm <任务ID>         删除任务
  todo help               显示帮助信息

示例:
  todo add 买牛奶
  todo list
  todo done 1
`);
}

// 添加任务
function addTodo(description) {
  if (!description) {
    console.error('错误: 请提供任务描述');
    return;
  }
  
  const todos = loadTodos();
  const newTodo = {
    id: todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1,
    description,
    completed: false,
    createdAt: new Date().toISOString()
  };
  
  todos.push(newTodo);
  
  if (saveTodos(todos)) {
    console.log(`任务已添加: [${newTodo.id}] ${newTodo.description}`);
  }
}

// 列出任务
function listTodos() {
  const todos = loadTodos();
  
  if (todos.length === 0) {
    console.log('暂无任务');
    return;
  }
  
  console.log('\n任务列表:');
  console.log('─'.repeat(50));
  
  todos.forEach(todo => {
    const status = todo.completed ? '✓' : '○';
    const id = String(todo.id).padStart(3);
    console.log(`  ${status} [${id}] ${todo.description}`);
  });
  
  console.log('─'.repeat(50));
  console.log(`共 ${todos.length} 个任务`);
}

// 标记任务完成
function completeTodo(id) {
  const todoId = parseInt(id);
  if (isNaN(todoId)) {
    console.error('错误: 请提供有效的任务ID');
    return;
  }
  
  const todos = loadTodos();
  const todoIndex = todos.findIndex(t => t.id === todoId);
  
  if (todoIndex === -1) {
    console.error(`错误: 找不到ID为 ${todoId} 的任务`);
    return;
  }
  
  if (todos[todoIndex].completed) {
    console.log(`任务 ${todoId} 已经完成`);
    return;
  }
  
  todos[todoIndex].completed = true;
  todos[todoIndex].completedAt = new Date().toISOString();
  
  if (saveTodos(todos)) {
    console.log(`任务 ${todoId} 已标记为完成`);
  }
}

// 删除任务
function removeTodo(id) {
  const todoId = parseInt(id);
  if (isNaN(todoId)) {
    console.error('错误: 请提供有效的任务ID');
    return;
  }
  
  const todos = loadTodos();
  const todoIndex = todos.findIndex(t => t.id === todoId);
  
  if (todoIndex === -1) {
    console.error(`错误: 找不到ID为 ${todoId} 的任务`);
    return;
  }
  
  const removedTodo = todos.splice(todoIndex, 1)[0];
  
  if (saveTodos(todos)) {
    console.log(`任务已删除: [${removedTodo.id}] ${removedTodo.description}`);
  }
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'add':
      addTodo(args.slice(1).join(' '));
      break;
      
    case 'list':
      listTodos();
      break;
      
    case 'done':
      completeTodo(args[1]);
      break;
      
    case 'rm':
      removeTodo(args[1]);
      break;
      
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
      
    default:
      if (!command) {
        listTodos();
      } else {
        console.error(`未知命令: ${command}`);
        console.error('使用 "todo help" 查看帮助信息');
      }
  }
}

// 执行主函数
main();