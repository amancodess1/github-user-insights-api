// app.js - Main application file
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');
const dotenv = require('dotenv');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// Import our modules
const GitHubScraper = require('./services/scraper');
const AIProcessor = require('./services/ai-processor');
const DataStore = require('./services/data-store');

// Load environment variables
dotenv.config();
// Initialize Expresss
const app = express();
app.use(cors())

// Middleware
app.use(express.json());

// Setup logging
const accessLogStream = fs.createWriteStream(
  path.join(__dirname, 'access.log'), 
  { flags: 'a' }
);
app.use(morgan('combined', { stream: accessLogStream }));
app.use(morgan('dev'));

// Initialize our components
const dataStore = new DataStore();
const scraper = new GitHubScraper();
const aiProcessor = new AIProcessor();

// Swagger API documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
app.get('/api/v1/github/users', async (req, res) => {
    console.log("starting request");
   // console.log(`Received request for query: ${query}, pages: ${pages}`);
  try {
    const query = req.query.query || 'javascript developer';
    const pages = parseInt(req.query.pages || 3);
    
    // Log request
    const requestId = dataStore.logRequest(query, pages);
    console.info(`Processing request ${requestId} for query: ${query}, pages: ${pages}`);
    
    // Scrape GitHub users
    const users = await scraper.searchUsers(query, pages);
    console.info(`Found ${users.length} users for query: ${query}`);
    
    // Process with AI
    const enrichedUsers = [];
    for (const user of users) {
      try {
        // Get AI insights
        const aiInsights = await aiProcessor.processUser(user);
        user.ai_insights = aiInsights;
        enrichedUsers.push(user);
      } catch (error) {
        console.error(`Error processing user ${user.username}: ${error.message}`);
        user.ai_insights = { error: error.message };
        enrichedUsers.push(user);
      }
    }
    
    
    result={
        request_id: requestId,
        query: query,
        count: enrichedUsers.length,
        results: enrichedUsers
      }
    // Save results
    dataStore.saveResults(result);
    res.json(result);
  } catch (error) {
    console.error(`Error in searchGitHubUsers: ${error.message}`);
    res.status(500).json({
       msg: "Internal server error",
      status: "error"
    });
  }
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;