const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected ✅"))
    .catch(err => console.error("MongoDB connection failed ❌:", err));
// ====== Register API ======
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).send({ error: "Username exists" });

        const user = new User({ username, password });
        await user.save();
        res.send({ message: "User registered successfully" });
    } catch (err) {
        console.error("Register error:", err);  // <-- full error will show here
        res.status(500).send({ error: "Server error" });
    }
});


// ====== Login API ======
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).send({ error: "Username and password required" });

    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(400).send({ error: "User not found" });

        const isMatch = await user.comparePassword(password);
        if (!isMatch) return res.status(400).send({ error: "Incorrect password" });

        const token = jwt.sign({ id: user._id, username: user.username }, process.env.JWT_SECRET);
        res.send({ token, username: user.username });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).send({ error: "Server error" });
    }
});

// ====== Get messages by room ======
app.get('/messages/:room', async (req, res) => {
    try {
        const messages = await Message.find({ room: req.params.room }).sort({ createdAt: 1 });
        res.send(messages);
    } catch (err) {
        console.error("Get messages error:", err);
        res.status(500).send({ error: "Server error" });
    }
});

// ====== Socket.io ======
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const onlineUsers = {};

io.on('connection', (socket) => {
    console.log("User connected:", socket.id);

    socket.on('joinRoom', ({ room, username }) => {
        socket.join(room);
        onlineUsers[socket.id] = { username, room };
        io.to(room).emit('onlineUsers', Object.values(onlineUsers).filter(u => u.room === room));
    });

    socket.on('sendMessage', async ({ room, user, text }) => {
        if (!text || !user || !room) return;
        const message = new Message({ room, user, text });
        await message.save();
        io.to(room).emit('receiveMessage', message);
    });

    socket.on('disconnect', () => {
        const user = onlineUsers[socket.id];
        if (user) {
            delete onlineUsers[socket.id];
            io.to(user.room).emit('onlineUsers', Object.values(onlineUsers).filter(u => u.room === user.room));
        }
        console.log("User disconnected:", socket.id);
    });
});

// ====== Start server ======
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
