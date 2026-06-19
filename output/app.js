const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// GET /api/hello
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello World' });
});

// GET /api/users - 示例用户列表
const users = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
  { id: 3, name: 'Charlie' }
];

app.get('/api/users', (req, res) => {
  res.json(users);
});

// 基本的错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.listen(port, () => {
  console.log('Server running on port ' + port);
});