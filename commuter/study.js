// server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_DIR = path.join(DATA_DIR, 'messages');

// Initialize data storage
async function initializeStorage() {
    try {
        // Create data directory if it doesn't exist
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(MESSAGES_DIR, { recursive: true });

        // Initialize groups.json if it doesn't exist
        try {
            await fs.access(GROUPS_FILE);
        } catch {
            await fs.writeFile(GROUPS_FILE, JSON.stringify({}));
        }

        // Initialize users.json if it doesn't exist
        try {
            await fs.access(USERS_FILE);
        } catch {
            await fs.writeFile(USERS_FILE, JSON.stringify({}));
        }
    } catch (error) {
        console.error('Error initializing storage:', error);
        process.exit(1);
    }
}

// Helper functions for data management
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error);
        return {};
    }
}

async function writeJsonFile(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Error writing to ${filePath}:`, error);
        throw error;
    }
}

async function getGroupMessages(groupName) {
    const messagesFile = path.join(MESSAGES_DIR, `${groupName}.json`);
    try {
        await fs.access(messagesFile);
        return await readJsonFile(messagesFile);
    } catch {
        return [];
    }
}

async function saveGroupMessages(groupName, messages) {
    const messagesFile = path.join(MESSAGES_DIR, `${groupName}.json`);
    await writeJsonFile(messagesFile, messages);
}

// API Routes

// Create a new group
app.post('/api/groups/create', async (req, res) => {
    try {
        const { groupName, password, username, isAdmin } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);

        if (groups[groupName]) {
            return res.status(400).json({ message: 'Group already exists' });
        }

        groups[groupName] = {
            name: groupName,
            password: password,
            admin: isAdmin ? username : null,
            users: [username],
            createdAt: new Date().toISOString()
        };

        await writeJsonFile(GROUPS_FILE, groups);
        await saveGroupMessages(groupName, []);

        res.status(201).json({
            message: 'Group created successfully',
            groupName,
            isAdmin
        });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Join a group
app.post('/api/groups/join', async (req, res) => {
    try {
        const { groupName, password, username } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        if (group.password !== password) {
            return res.status(401).json({ message: 'Incorrect password' });
        }

        if (!group.users.includes(username)) {
            group.users.push(username);
            await writeJsonFile(GROUPS_FILE, groups);
        }

        const messages = await getGroupMessages(groupName);

        res.json({
            message: 'Joined group successfully',
            isAdmin: group.admin === username,
            users: group.users,
            messages
        });
    } catch (error) {
        console.error('Error joining group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Send a message
app.post('/api/messages/send', async (req, res) => {
    try {
        const { groupName, username, message } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (!group || !group.users.includes(username)) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const messages = await getGroupMessages(groupName);
        const newMessage = {
            id: Date.now(),
            username,
            message,
            timestamp: new Date().toISOString()
        };

        messages.push(newMessage);
        await saveGroupMessages(groupName, messages);

        res.json({
            message: 'Message sent',
            messageData: newMessage
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get messages for a group
app.get('/api/messages/:groupName', async (req, res) => {
    try {
        const { groupName } = req.params;
        const messages = await getGroupMessages(groupName);
        res.json(messages);
    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get active users in a group
app.get('/api/groups/:groupName/users', async (req, res) => {
    try {
        const { groupName } = req.params;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (!group) {
            return res.status(404).json({ message: 'Group not found' });
        }

        res.json({
            users: group.users,
            admin: group.admin
        });
    } catch (error) {
        console.error('Error getting users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Leave group
app.post('/api/groups/leave', async (req, res) => {
    try {
        const { groupName, username } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (group) {
            group.users = group.users.filter(user => user !== username);
            await writeJsonFile(GROUPS_FILE, groups);

            const messages = await getGroupMessages(groupName);
            messages.push({
                id: Date.now(),
                username: 'System',
                message: `${username} has left the group`,
                timestamp: new Date().toISOString()
            });
            await saveGroupMessages(groupName, messages);
        }

        res.json({ message: 'Left group successfully' });
    } catch (error) {
        console.error('Error leaving group:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Clear chat
app.post('/api/admin/clear-chat', async (req, res) => {
    try {
        const { groupName, username } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (!group || group.admin !== username) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await saveGroupMessages(groupName, []);
        res.json({ message: 'Chat cleared successfully' });
    } catch (error) {
        console.error('Error clearing chat:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin: Remove user
app.post('/api/admin/remove-user', async (req, res) => {
    try {
        const { groupName, adminUsername, userToRemove } = req.body;
        const groups = await readJsonFile(GROUPS_FILE);
        const group = groups[groupName];

        if (!group || group.admin !== adminUsername) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        group.users = group.users.filter(user => user !== userToRemove);
        await writeJsonFile(GROUPS_FILE, groups);

        const messages = await getGroupMessages(groupName);
        messages.push({
            id: Date.now(),
            username: 'System',
            message: `${userToRemove} has been removed by admin`,
            timestamp: new Date().toISOString()
        });
        await saveGroupMessages(groupName, messages);

        res.json({
            message: 'User removed successfully',
            users: group.users
        });
    } catch (error) {
        console.error('Error removing user:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Initialize storage and start server
const PORT = process.env.PORT || 3000;

initializeStorage().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Data directory: ${DATA_DIR}`);
    });
}).catch(error => {
    console.error('Failed to initialize storage:', error);
});