// services/data-store.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class DataStore {
  constructor() {
    // Create data directory if it doesn't exist
    this.dataDir = path.join(__dirname, '..', 'data');
    this.ensureDirectory(this.dataDir);
    
    // Path to requests file
    this.requestsFile = path.join(this.dataDir, 'requests.json');
 
    this.resultsFile = path.join(this.dataDir, 'results.json');
    
    // Initialize data structures
    this.requests = this.loadFromFile(this.requestsFile, []);
    this.results = this.loadFromFile(this.resultsFile, []);
  }

  /**
   * Ensure a directory exists
   * @param {string} dir - Directory path
   */
  ensureDirectory(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.info(`Created directory: ${dir}`);
    }
  }

  /**
   * Load data from a JSON file
   * @param {string} file - File path
   * @param {*} defaultValue - Default value if file doesn't exist
   * @returns {*} - Loaded data
   */
  loadFromFile(file, defaultValue) {
    try {
      if (fs.existsSync(file)) {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
      }
      return defaultValue;
    } catch (error) {
      console.error(`Error loading from ${file}: ${error.message}`);
      return defaultValue;
    }
  }

  /**
   * Save data to a JSON file
   * @param {string} file - File path
   * @param {*} data - Data to save
   */
  saveToFile(file, data) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error saving to ${file}: ${error.message}`);
    }
  }

  /**
   * Log a new API request
   * @param {string} query - Search query
   * @param {number} pages - Number of pages
   * @returns {string} - Request ID
   */
  logRequest(query, pages) {
    const requestId = crypto.randomBytes(16).toString('hex');

    const request = {
      id: requestId,
      query,
      pages,
      timestamp: new Date().toISOString(),
      status: 'pending',
      completed_at: null,
      result_count: null
    };

    this.requests.push(request);
    this.saveToFile(this.requestsFile, this.requests);

    return requestId;
  }

  /**
   * Log a response to an API request
   * @param {string} requestId - Request ID
   * @param {number} resultCount - Number of results
   */
  // logResponse(requestId, resultCount) {
  //   const requestIndex = this.requests.findIndex(r => r.id === requestId);

  //   if (requestIndex !== -1) {
  //     this.requests[requestIndex].status = 'completed';
  //     this.requests[requestIndex].completed_at = new Date().toISOString();
  //     this.requests[requestIndex].result_count = resultCount;

  //     this.saveToFile(this.requestsFile, this.requests);
  //     console.info(`Updated request ${requestId} with ${resultCount} results`);
  //   } else {
  //     console.warn(`Request ${requestId} not found for logging response`);
  //   }
  // }
  saveResults(result) {
   try {
    this.results.push(result);
    this.saveToFile(this.resultsFile, this.results);
    console.info(`Saved ${results.length} results to ${this.resultsFile}`); 
   } catch (error) {

   }
  }

  /**
   * Get request history
   * @returns {Array} - Request historyd
   */
  getRequestHistory() {
    return this.requests;
  }
}

module.exports = DataStore;
