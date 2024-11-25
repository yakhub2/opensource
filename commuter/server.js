// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// File paths
const DATA_DIR = path.join(__dirname, 'data');
const RESOURCES_FILE = path.join(DATA_DIR, 'resources.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const FACILITIES_FILE = path.join(DATA_DIR, 'facilities.json');

// Ensure data directory exists
async function initializeDataFiles() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Initialize files if they don't exist
        const files = {
            [RESOURCES_FILE]: [],
            [EVENTS_FILE]: [],
            [USERS_FILE]: [],
            [FACILITIES_FILE]: [
                {
                    _id: "1",
                    name: "Gym",
                    availableTimeSlots: [
                        { _id: "slot1", time: "9:00 AM - 10:00 AM", isBooked: false },
                        { _id: "slot2", time: "10:00 AM - 11:00 AM", isBooked: false }
                    ]
                },
                {
                    _id: "2",
                    name: "Library",
                    availableTimeSlots: [
                        { _id: "slot1", time: "2:00 PM - 3:00 PM", isBooked: false },
                        { _id: "slot2", time: "3:00 PM - 4:00 PM", isBooked: false }
                    ]
                }
            ]
        };

        for (const [filePath, initialData] of Object.entries(files)) {
            try {
                await fs.access(filePath);
            } catch {
                await fs.writeFile(filePath, JSON.stringify(initialData, null, 2));
            }
        }
    } catch (error) {
        console.error('Error initializing data files:', error);
    }
}

// Helper functions for file operations
async function readJsonFile(filePath) {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
}

async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Routes
// Resources
app.get('/api/resources', async (req, res) => {
    try {
        const resources = await readJsonFile(RESOURCES_FILE);
        res.json(resources);
    } catch (error) {
        res.status(500).json({ message: 'Error reading resources' });
    }
});

app.post('/api/resources', async (req, res) => {
    try {
        const resources = await readJsonFile(RESOURCES_FILE);
        const newResource = { ...req.body, _id: Date.now().toString() };
        resources.push(newResource);
        await writeJsonFile(RESOURCES_FILE, resources);
        res.status(201).json(newResource);
    } catch (error) {
        res.status(500).json({ message: 'Error creating resource' });
    }
});

// Events
app.get('/api/events', async (req, res) => {
    try {
        const events = await readJsonFile(EVENTS_FILE);
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: 'Error reading events' });
    }
});

app.post('/api/events', async (req, res) => {
    try {
        const events = await readJsonFile(EVENTS_FILE);
        const newEvent = { ...req.body, _id: Date.now().toString() };
        events.push(newEvent);
        await writeJsonFile(EVENTS_FILE, events);
        res.status(201).json(newEvent);
    } catch (error) {
        res.status(500).json({ message: 'Error creating event' });
    }
});

// Facilities
app.get('/api/facilities', async (req, res) => {
    try {
        const facilities = await readJsonFile(FACILITIES_FILE);
        res.json(facilities);
    } catch (error) {
        res.status(500).json({ message: 'Error reading facilities' });
    }
});

app.post('/api/facilities/book', async (req, res) => {
    try {
        const { facilityId, timeSlotId } = req.body;
        const facilities = await readJsonFile(FACILITIES_FILE);

        const facility = facilities.find(f => f._id === facilityId);
        if (!facility) {
            return res.status(404).json({ message: 'Facility not found' });
        }

        const timeSlot = facility.availableTimeSlots.find(slot => slot._id === timeSlotId);
        if (!timeSlot) {
            return res.status(404).json({ message: 'Time slot not found' });
        }

        if (timeSlot.isBooked) {
            return res.status(400).json({ message: 'Time slot is already booked' });
        }

        timeSlot.isBooked = true;
        await writeJsonFile(FACILITIES_FILE, facilities);

        res.json({
            message: 'Time slot booked successfully',
            facility: facility
        });
    } catch (error) {
        res.status(500).json({ message: 'Error booking facility' });
    }
});

// Users
app.post('/api/users/register', async (req, res) => {
    try {
        const users = await readJsonFile(USERS_FILE);
        const newUser = { ...req.body, _id: Date.now().toString(), bookmarkedResources: [] };
        users.push(newUser);
        await writeJsonFile(USERS_FILE, users);
        res.status(201).json(newUser);
    } catch (error) {
        res.status(500).json({ message: 'Error registering user' });
    }
});

// Add this endpoint to your existing server.js
app.post('/api/users/bookmark', async (req, res) => {
  try {
      const { userId, resourceId } = req.body;

      // Input validation
      if (!userId || !resourceId) {
          return res.status(400).json({ 
              success: false, 
              message: 'Both userId and resourceId are required' 
          });
      }

      // Read both users and resources data
      const [users, resources] = await Promise.all([
          readJsonFile(USERS_FILE),
          readJsonFile(RESOURCES_FILE)
      ]);

      // Find the user
      const user = users.find(u => u._id === userId);
      if (!user) {
          return res.status(404).json({ 
              success: false, 
              message: 'User not found' 
          });
      }

      // Verify if the resource exists
      const resourceExists = resources.some(r => r._id === resourceId);
      if (!resourceExists) {
          return res.status(404).json({ 
              success: false, 
              message: 'Resource not found' 
          });
      }

      // Initialize bookmarkedResources array if it doesn't exist
      if (!Array.isArray(user.bookmarkedResources)) {
          user.bookmarkedResources = [];
      }

      // Check if already bookmarked
      if (user.bookmarkedResources.includes(resourceId)) {
          return res.status(400).json({ 
              success: false, 
              message: 'Resource is already bookmarked by this user' 
          });
      }

      // Add the bookmark
      user.bookmarkedResources.push(resourceId);

      // Update the user in the users array
      const userIndex = users.findIndex(u => u._id === userId);
      users[userIndex] = user;

      // Save the updated users data
      await writeJsonFile(USERS_FILE, users);

      // Return success response with updated user data
      return res.status(200).json({
          success: true,
          message: 'Resource bookmarked successfully',
          data: {
              user: {
                  _id: user._id,
                  bookmarkedResources: user.bookmarkedResources
              }
          }
      });

  } catch (error) {
      console.error('Bookmark operation failed:', error);
      return res.status(500).json({ 
          success: false, 
          message: 'Internal server error while bookmarking resource',
          error: error.message 
      });
  }
});

// Add these helper endpoints for managing bookmarks
app.get('/api/users/:userId/bookmarks', async (req, res) => {
  try {
      const { userId } = req.params;
      
      // Read both users and resources
      const [users, resources] = await Promise.all([
          readJsonFile(USERS_FILE),
          readJsonFile(RESOURCES_FILE)
      ]);

      // Find the user
      const user = users.find(u => u._id === userId);
      if (!user) {
          return res.status(404).json({ 
              success: false, 
              message: 'User not found' 
          });
      }

      // Get bookmarked resources with full details
      const bookmarkedResources = (user.bookmarkedResources || [])
          .map(bookmarkId => resources.find(r => r._id === bookmarkId))
          .filter(resource => resource !== undefined); // Remove any not found resources

      return res.status(200).json({
          success: true,
          data: {
              bookmarks: bookmarkedResources
          }
      });

  } catch (error) {
      console.error('Error fetching bookmarks:', error);
      return res.status(500).json({ 
          success: false, 
          message: 'Internal server error while fetching bookmarks',
          error: error.message 
      });
  }
});

app.delete('/api/users/:userId/bookmarks/:resourceId', async (req, res) => {
  try {
      const { userId, resourceId } = req.params;
      
      // Read users data
      const users = await readJsonFile(USERS_FILE);

      // Find the user
      const user = users.find(u => u._id === userId);
      if (!user) {
          return res.status(404).json({ 
              success: false, 
              message: 'User not found' 
          });
      }

      // Check if the resource is bookmarked
      if (!Array.isArray(user.bookmarkedResources) || 
          !user.bookmarkedResources.includes(resourceId)) {
          return res.status(404).json({ 
              success: false, 
              message: 'Bookmark not found' 
          });
      }

      // Remove the bookmark
      user.bookmarkedResources = user.bookmarkedResources.filter(id => id !== resourceId);

      // Update the user in the users array
      const userIndex = users.findIndex(u => u._id === userId);
      users[userIndex] = user;

      // Save the updated users data
      await writeJsonFile(USERS_FILE, users);

      return res.status(200).json({
          success: true,
          message: 'Bookmark removed successfully',
          data: {
              user: {
                  _id: user._id,
                  bookmarkedResources: user.bookmarkedResources
              }
          }
      });

  } catch (error) {
      console.error('Error removing bookmark:', error);
      return res.status(500).json({ 
          success: false, 
          message: 'Internal server error while removing bookmark',
          error: error.message 
      });
  }
});


// Initialize data files and start server
const PORT = 5000;
initializeDataFiles().then(() => {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
});