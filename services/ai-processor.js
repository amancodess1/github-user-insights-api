// services/ai-processor.js
const axios = require('axios');
const dotenv = require('dotenv');
const { performance } = require('perf_hooks');

dotenv.config();

class AIProcessor {
  constructor() {
    // Gemini API key from .env
    this.geminiApiKey = process.env.GEMINI_API_KEY;

    // Rate limit handling
    this.requestQueue = [];
    this.processingQueue = false;
    this.rateLimitDelay = 1000; // 1 second between requests
  }

  async processUser(user) {
    const startTime = performance.now();
    console.info(`Processing user ${user.username} with AI`);

    try {
      const userContent = this.prepareUserContent(user);
      const prompt = this.createPrompt(userContent);
      const aiResponse = await this.queueAIRequest(prompt);
      const insights = this.parseAIResponse(aiResponse);

      const endTime = performance.now();
      console.info(`AI processing for ${user.username} completed in ${((endTime - startTime) / 1000).toFixed(2)} seconds`);

      return insights;
    } catch (error) {
      console.error(`Error in AI processing for user ${user.username}: ${error.message}`);
      return {
        error: error.message,
        status: 'error',
        timestamp: new Date().toISOString()
      };
    }
  }

  prepareUserContent(user) {
    let content = `GitHub Username: ${user.username}\n`;

    if (user.display_name) content += `Display Name: ${user.display_name}\n`;
    if (user.bio) content += `Bio: ${user.bio}\n`;
    if (user.location) content += `Location: ${user.location}\n`;
    if (user.contribution_count) content += `Contribution Count: ${user.contribution_count}\n`;

    if (user.pinned_repositories && user.pinned_repositories.length > 0) {
      content += "\nPinned Repositories:\n";
      user.pinned_repositories.forEach((repo, index) => {
        content += `${index + 1}. ${repo.name}${repo.language ? ` (${repo.language})` : ''}\n`;
        if (repo.description) {
          content += `   Description: ${repo.description}\n`;
        }
      });
    }

    if (user.raw_data) {
      if (user.raw_data.followers) content += `\nFollowers: ${user.raw_data.followers}\n`;
      if (user.raw_data.following) content += `Following: ${user.raw_data.following}\n`;
      if (user.raw_data.organizations?.length)
        content += `Organizations: ${user.raw_data.organizations.join(', ')}\n`;
      if (user.raw_data.profile_readme)
        content += `\nProfile README:\n${user.raw_data.profile_readme}\n`;
    }

    return content;
  }

  createPrompt(userContent) {
    return `
Analyze the following GitHub user profile and provide structured insights:

${userContent}

Based on the information above, please provide a structured analysis with the following:

1. Primary skills (as a comma-separated list)
2. Tech stack (specific technologies and frameworks they seem familiar with)
3. Experience level (beginner, intermediate, advanced, or expert)
4. Notable contributions or focus areas
5. Brief professional summary (2-3 sentences)

Format the response as a JSON object with keys: "primary_skills", "tech_stack", "experience_level", "notable_contributions", and "professional_summary".
    `;
  }

  async queueAIRequest(prompt) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ prompt, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processingQueue || this.requestQueue.length === 0) return;

    this.processingQueue = true;
    const { prompt, resolve, reject } = this.requestQueue.shift();

    try {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const response = await this.sendToGemini(prompt);
          resolve(response);
          break;
        } catch (error) {
          attempts++;
          if (attempts >= maxAttempts) throw error;

          const retryDelay = this.rateLimitDelay * attempts;
          console.warn(`AI request failed, attempt ${attempts}/${maxAttempts}. Retrying in ${retryDelay}ms...`);
          await this.sleep(retryDelay);
        }
      }
    } catch (error) {
      reject(error);
    } finally {
      this.processingQueue = false;
      setTimeout(() => this.processQueue(), this.rateLimitDelay);
    }
  }

  async sendToGemini(prompt) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`;

    const body = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    };

    try {
      console.log(`[DEBUG] Sending request to Gemini API...`);
      
      const response = await axios.post(endpoint, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });
      
      // Debug the full response structure (omitting sensitive datas)
      // console.log(`[DEBUG] Gemini API response structure:`, 
      //   JSON.stringify({
      //     status: response.status,
      //     headers: response.headers,
      //     dataKeys: Object.keys(response.data || {}),
      //     candidates: response.data?.candidates ? 
      //       `Found ${response.data.candidates.length} candidates` : 
      //       'No candidates'
      //   }, null, 2)
      // );

      const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        console.error('[DEBUG] Empty content in Gemini response:', JSON.stringify(response.data, null, 2));
        throw new Error('Empty response from Gemini');
      }
      
      // console.log(`[DEBUG]Gemini response content (first 100 chars): ${content.substring(0, 100)}...`);
      
      return content;
    } catch (error) {
      console.error(`[DEBUG] Gemini API error:`, error);
      if (error.response) {
        console.error(`[DEBUG] Error response data:`, JSON.stringify(error.response.data, null, 2));
        console.error(`[DEBUG] Error response status:`, error.response.status);
        console.error(`[DEBUG] Error response headers:`, error.response.headers);
      }
      throw error;
    }
  }

  parseAIResponse(aiResponse) {
    // console.log(`[DEBUG] Parsing AI response (length: ${aiResponse.length}):`);
    // console.log(`[DEBUG] Raw response: ${aiResponse.substring(0, 300)}...`);
    
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        // console.log(`[DEBUG] Found JSON pattern in response`);
        try {
          const jsonString = jsonMatch[0];
          // console.log(`[DEBUG] Extracted JSON string: ${jsonString.substring(0, 100)}...`);
          
          const insights = JSON.parse(jsonString);
         // console.log(`[DEBUG] Successfully parsed JSON response with keys:`, Object.keys(insights));
          
          insights.raw_response = aiResponse;
          insights.timestamp = new Date().toISOString();
          return insights;
        } catch (jsonError) {
          console.error(`[DEBUG] JSON parsing error: ${jsonError.message}`);
          console.error(`[DEBUG] Problematic JSON string: ${jsonMatch[0]}`);
          throw jsonError;
        }
      } else {
        console.log(`[DEBUG] No JSON pattern found, falling back to line parsing`);
      }

      const lines = aiResponse.split('\n');
     //console.log(`[DEBUG] Split response into ${lines.length} lines`);
      
      const insights = {
        primary_skills: this.extractSection(lines, 'Primary skills'),
        tech_stack: this.extractSection(lines, 'Tech stack'),
        experience_level: this.extractSection(lines, 'Experience level'),
        notable_contributions: this.extractSection(lines, 'Notable contributions'),
        professional_summary: this.extractSection(lines, 'Brief professional summary'),
        raw_response: aiResponse,
        timestamp: new Date().toISOString()
      };
      
      console.log(`[DEBUG] Extracted insights:`, JSON.stringify(insights, null, 2));
      return insights;
    } catch (error) {
      console.error(`[DEBUG] Error parsing AI response: ${error.message}`);
      return {
        error: "Failed to parse AI response",
        raw_response: aiResponse,
        timestamp: new Date().toISOString()
      };
    }
  }

  extractSection(lines, sectionName) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(sectionName)) {
        let content = lines[i].split(':')[1]?.trim() || '';
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(':') && lines[j].trim()) {
          content += ' ' + lines[j].trim();
          j++;
        }
        console.log(`[DEBUG] Extracted '${sectionName}': ${content}`);
        return content;
      }
    }
    console.log(`[DEBUG] Section '${sectionName}' not found`);
    return '';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = AIProcessor;