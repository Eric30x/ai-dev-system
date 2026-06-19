const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// 内存数据存储
let todos = [
  { id: 1, title: '学习Node.js', completed: false }
];

// 获取所有Todo
app.get('/todos', (req, res) => {
  res.json(todos);
});

// 根据ID获取单个Todo
app.get('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find(t => t.id === id);
  if (!todo) {
    return res.status(404).json({ error: 'Todo未找到' });
  }
  res.json(todo);
});

// 创建新Todo
app.post('/todos', (req, res) => {
  const { title, completed } = req.body;
  if (!title) {
    return res.status(400).json({ error: '标题是必需的' });
  }
  const newTodo = {
    id: todos.length > 0 ? Math.max(...todos.map(t => t.id)) + 1 : 1,
    title,
    completed: completed || false
  };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

// 更新Todo
app.put('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Todo未找到' });
  }
  const { title, completed } = req.body;
  todos[index] = {
    ...todos[index],
    title: title !== undefined ? title : todos[index].title,
    completed: completed !== undefined ? completed : todos[index].completed
  };
  res.json(todos[index]);
});

// 删除Todo
app.delete('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Todo未找到' });
  }
  todos.splice(index, 1);
  res.status(204).send();
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
});