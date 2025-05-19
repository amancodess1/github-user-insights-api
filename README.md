# GitHub User Insights API

A backend service that scrapes GitHub user profiles from search results and processes the data using an AI API to extract and summarize relevant developer insights.

## Features

- GitHub user profile scraping with pagination support
- AI-powered analysis of developer profiles
- REST API for accessing enriched developer data
- Dockerized setup for easy deployment

## Tech Stack

- Node.js with Express.js
- Cheerio for web scraping
- Swagger for API documentation
- Docker for containerization
## Installation

### Local Setup

1. Clone this repository:
   ```
   git clone https://github.com/amancodess1/github-user-insights.git
   cd github-user-insights
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:
   ```
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. Start the server:
   ```
   npm start
   ```
5. To test open the given link on browser: 
   ```
   http://localhost:3000/api/v1/github/users?query=cpp+developers&pages=1
   ```


### Docker Setup

1. Build the Docker image:
   ```
   docker build -t github-user-insights .
   ```

2. Run the container:
   ```
   docker run -p 3000:3000 -e GEMINI_API_KEY=you_gemini_api_key github-user-insights
   ```

## API Usage

### Search GitHub Users

#### GET /api/v1/github/users

Query parameters:
- `query` (optional): Search query (e.g., 'javascript developer')
- `pages` (optional): Number of search result pages to scrape (default: 3)

Example:
```
curl -X GET "http://localhost:3000/api/v1/github/users?query=javascript%20developer&pages=2"
```


## API Documentation

Swagger documentation is available at:
```
http://localhost:3000/api/docs
```

## Assumptions Made

1. GitHub's structure won't change significantly during the project lifetime.
2. The API will be used responsibly to avoid hitting GitHub's rate limits.
3. The AI processing provides reasonable inferences based on limited profile data.


## Project Structure

```
github-user-insights/
├── app.js            # Main application file
├── Dockerfile        # Docker configuration
├── package.json      # Project dependencies
├── swagger.json      # API documentation
├── services/         # Business logic modules
│   ├── scraper.js    # GitHub scraping service
│   ├── ai-processor.js # AI processing service
│   └── data-store.js # Data storage and caching service
└── data/             # Directory for storing data files
    ├── results.json  # Cached search results
    └── requests.json # API request history
```

