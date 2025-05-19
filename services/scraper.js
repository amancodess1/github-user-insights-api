const axios = require('axios');
const cheerio = require('cheerio');
const { performance } = require('perf_hooks');

class GitHubScraper {
  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.81 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000,
    });

    this.rateLimitDelay = 3000; // Increased tod   avoid rate limits
    this.cache = new Map(); // Simple in-memory cache
    this.batchSize = 3; // Reduced batch size to be more gentle with GitHub's servers
  }

  async searchUsers(query, pages = 3) {
    const startTime = performance.now();
    console.info(`Initiating GitHub search for query: ${query}, pages: ${pages}`);
    
    // Check if the query looks like a valid search term
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      console.error('Invalid search query provided');
      return [];
    }
    
    try {
      // First check if GitHub search is accessible with a simple request
      console.info('Testing GitHub connectivity...');
      await this.testGitHubConnectivity();
      
      const users = await this.fetchAllUsers(query, pages);
      console.info(`Found ${users.length} users before detailed processing`);
      
      if (users.length === 0) {
        console.error('No users found. Check the search query or GitHub page structure.');
        return [];
      }
      
      const detailedUsers = await this.processUserProfilesInBatches(users);

      const endTime = performance.now();
      console.info(`Completed GitHub search in ${((endTime - startTime) / 1000).toFixed(2)} seconds.`);
      return detailedUsers;
    } catch (error) {
      console.error(`Search failed with error: ${error.message}`);
      return [];
    }
  }
  
  async testGitHubConnectivity() {
    try {
      // Make a simple request to GitHub to check connectivity
      const { data } = await this.client.get('https://github.com/');
      if (!data || data.length === 0) {
        throw new Error('Received empty response from GitHub');
      }
      console.info('GitHub connectivity test successful');
      return true;
    } catch (error) {
      console.error(`GitHub connectivity test failed: ${error.message}`);
      throw new Error(`Cannot access GitHub: ${error.message}`);
    }
  }

  async fetchAllUsers(query, pages) {
    const users = [];
    const promises = [];

    for (let page = 1; page <= pages; page++) {
      promises.push(this.scrapeUsersPage(query, page));
    }
   
    const pageResults = await Promise.all(promises);
    
    // Log specific details about each page result
    pageResults.forEach((pageUsers, index) => {
      console.info(`Scraped ${pageUsers.length} users from page ${index + 1}`);
      if (pageUsers.length === 0) {
        console.warn(`No users found on page ${index + 1}. This might indicate a problem.`);
      }
      users.push(...pageUsers);
    });

    return users;
  }

  async scrapeUsersPage(query, page = 1) {
    const cacheKey = `users:${query}:page:${page}`;
    if (this.cache.has(cacheKey)) {
      console.info(`Cache hit for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    const url = `https://github.com/search?q=${encodeURIComponent(query)}&type=users&p=${page}`;
    console.info(`Fetching: ${url}`);

    try {
      const { data } = await this.client.get(url);
      
      // Debug HTML response
      if (!data || data.length === 0) {
        console.error('Received empty response from GitHub');
        return [];
      }
      
      console.info(`Received ${data.length} bytes of HTML from GitHub`);
      
      // Save a snippet of HTML to a file for analysis (first 10000 characters)
      // This will help us analyze what's actually in the response
      const fs = require('fs');
      // try {
      //   fs.writeFileSync(`github_response_page${page}.html`, data.substring(0, 10000));
      //   console.info(`Saved HTML snippet to github_response_page${page}.html`);
      // } catch (err) {
      //   console.error(`Failed to save HTML snippet: ${err.message}`);
      // }
      
      const $ = cheerio.load(data);
      const users = [];

      // Add comprehensive logging for debugging
      console.info('=== HTML STRUCTURE ANALYSIS ===');
      
      // Check if we're being rate limited or blocked
      if (data.includes('rate limit') || data.includes('abuse detection')) {
        console.error('RATE LIMITING DETECTED: GitHub may be blocking the scraper');
      }
      
      // Check if we need to login
      if (data.includes('Sign in to GitHub') && data.includes('login')) {
        console.error('LOGIN REQUIRED: GitHub is asking for authentication');
      }
      
      // Look for common user list containers
      const containers = {
        'div.iwUbcA': $('div.iwUbcA').length,
        'div.ldRxiI': $('div.ldRxiI').length, 
        'data-testid="results-list"': $('div[data-testid="results-list"]').length,
        'user-list': $('.user-list').length,
        'Box': $('.Box').length,
        'Box-row': $('.Box-row').length,
        'user-list-item': $('.user-list-item').length,
        'search-title': $('.search-title').length
      };
      
      console.info('Potential containers found:', containers);
      
      // Check if the page says no results
      const noResultsText = $('div:contains("We couldn\'t find any users matching")').text().trim();
      if (noResultsText) {
        console.warn('GitHub reports no results found:', noResultsText);
      }
      
      // Try to find the page title for context
      const pageTitle = $('title').text().trim();
      console.info('Page title:', pageTitle);
      
      // Updated selector based on the provided HTML sample
      // First try the selectors that match the new GitHub structure
      let userElements = $('div.iwUbcA');
      console.info('New selector "div.iwUbcA" found elements:', userElements.length);
      
      // If the above selector doesn't work, try alternatives
      if (userElements.length === 0) {
        console.warn('Primary selector failed, trying alternatives...');
        
        // Try a broad set of possible selectors
        const potentialSelectors = [
          'div.ldRxiI',
          'div[data-testid="results-list"] > div',
          '.user-list-item',
          '.Box-row',
          '.search-result-item',
          '.user-list > li',
          '.list-item',
          '[data-hovercard-type="user"]',
          '.repo-list > div',
          '.codesearch-results .hx_hit-user',
          '.flex-auto d-flex'
        ];
        
        for (const selector of potentialSelectors) {
          const elements = $(selector);
          console.info(`Selector "${selector}" found: ${elements.length} elements`);
          
          if (elements.length > 0) {
            userElements = elements;
            console.info(`Using selector: ${selector}`);
            break;
          }
        }
        
        // If still nothing found, look for any divs or items that might look like user listings
        if (userElements.length === 0) {
          console.error('Could not find user elements with any known selector');
          
          // Look for ANY divs that might have user-related classes
          const divClasses = new Set();
          $('div').each((_, el) => {
            const classes = $(el).attr('class');
            if (classes) divClasses.add(classes);
          });
          console.debug('Available div classes:', Array.from(divClasses).join(', '));
          
          // Extract and log all link texts to see if we can find usernames
          const allLinks = [];
          $('a').each((_, el) => {
            const linkText = $(el).text().trim();
            const href = $(el).attr('href');
            if (linkText && href && href.includes('/')) {
              allLinks.push({ text: linkText, href });
            }
          });
          console.debug('Potential user links found:', allLinks.length);
          if (allLinks.length > 0) {
            console.debug('Sample links:', allLinks.slice(0, 5));
          }
          
          // Try to find GitHub usernames using a generic approach
          const usernamePattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
          $('a').each((_, el) => {
            const linkText = $(el).text().trim();
            const href = $(el).attr('href');
            
            if (linkText && usernamePattern.test(linkText) && href && href.startsWith('/')) {
              console.info(`Potential username found: ${linkText} at ${href}`);
            }
          });
        }
      }

      userElements.each((_, el) => {
        const userElement = $(el);
        
        // Updated selectors based on the HTML sample
        // Try to get username based on the current structure
        // First attempt - using the element with class 'gbmbF'
        let username = userElement.find('span.gbmbF').text().trim();
        let usernameLink = userElement.find('a.prc-Link-Link-85e08').last();
        
        // If not found, try alternative selectors
        if (!username) {
          const allLinks = userElement.find('a');
          allLinks.each((_, link) => {
            const href = $(link).attr('href');
            if (href && href.startsWith('/') && !href.includes('/') && username === '') {
              username = $(link).text().trim();
              usernameLink = $(link);
            }
          });
        }
        
        // If still not found, try other selectors
        if (!username) {
          usernameLink = userElement.find('a[href*="/"].text-bold');
          if (usernameLink.length === 0) {
            usernameLink = userElement.find('a.mr-1');
          }
          if (usernameLink.length === 0) {
            usernameLink = userElement.find('a[data-hovercard-type="user"]');
          }
          username = usernameLink.text().trim();
        }
        
        if (!username) return;
        
        // Get the profile URL
        const profileUrl = usernameLink.attr('href');
        // Ensure the URL is absolute
        const fullProfileUrl = profileUrl && profileUrl.startsWith('http') ? 
                              profileUrl : 
                              `https://github.com${profileUrl}`;
                              
        // Try different selectors for display name - use text from element with class 'hYFqef'
        let displayName = userElement.find('span.hYFqef').text().trim();
        
        // If not found, try alternate selectors
        if (!displayName) {
          displayName = userElement.find('p.text-gray').text().trim();
        }
        if (!displayName) {
          displayName = userElement.find('.color-fg-muted').text().trim();
        }
        
        // Try to get bio - the element with class 'gKFdvh'
        let bio = userElement.find('span.gKFdvh').text().trim();
        
        users.push({
          username,
          display_name: displayName || null,
          profile_url: fullProfileUrl,
          bio: bio || null,
          raw_data: {},
          ai_insights: {}
        });
      });

      console.info(`Found ${users.length} users on page ${page}`);
      
      this.cache.set(cacheKey, users);
      await this.sleep(this.rateLimitDelay);
      return users;
    } catch (err) {
      console.error(`Error scraping users page ${page}: ${err.message}`);
      console.error(`Stack trace: ${err.stack}`);
      return [];
    }
  }

  async processUserProfilesInBatches(users) {
    const detailedUsers = [];
    for (let i = 0; i < users.length; i += this.batchSize) {
      const batch = users.slice(i, i + this.batchSize);
      const batchPromises = batch.map(user => this.scrapeUserProfile(user));
      const batchResults = await Promise.all(batchPromises);
      detailedUsers.push(...batchResults);
      console.info(`Processed batch of ${batchResults.length} user profiles`);
      if (i + this.batchSize < users.length) await this.sleep(this.rateLimitDelay);
    }
    return detailedUsers;
  }

  async scrapeUserProfile(user) {
    const cacheKey = `profile:${user.username}`;
    if (this.cache.has(cacheKey)) {
      console.info(`Cache hit for ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    try {
      console.info(`Scraping profile: ${user.username}`);
      const { data } = await this.client.get(user.profile_url);
      
      if (!data || data.length === 0) {
        console.error(`Received empty response for ${user.username}'s profile`);
        return user;
      }
      
      const $ = cheerio.load(data);

      const enhancedUser = { ...user };
      
      // Extract contributions - try multiple selector patterns
      let contributionCount = '0';
      const contribText = $('h2:contains("contributions")').text();
      const contribMatch = contribText.match(/(\d+(?:,\d+)*)/);
      
      if (contribMatch && contribMatch[0]) {
        contributionCount = contribMatch[0];
      } else {
        // Try alternative selector for contributions
        const altContribElem = $('.js-yearly-contributions');
        if (altContribElem.length > 0) {
          const altContribText = altContribElem.text();
          const altMatch = altContribText.match(/(\d+(?:,\d+)*)/);
          if (altMatch && altMatch[0]) {
            contributionCount = altMatch[0];
          }
        }
      }
      
      enhancedUser.contribution_count = contributionCount;

      // Extract pinned repositories with more flexible selectors
      const pinnedRepos = [];
      
      // Try multiple selectors for pinned repositories
      const pinnedSelectors = [
        'div.pinned-item-list-item',
        'div.js-pinned-item-list-item',
        'ol.d-flex > li'
      ];
      
      let pinnedElements = $();
      for (const selector of pinnedSelectors) {
        pinnedElements = $(selector);
        if (pinnedElements.length > 0) break;
      }
      
      pinnedElements.each((_, el) => {
        const repoElement = $(el);
        
        // Try different selectors for repo name
        let repoName = repoElement.find('span.repo').text().trim();
        if (!repoName) {
          repoName = repoElement.find('a[itemprop="name codeRepository"]').text().trim();
        }
        if (!repoName) {
          repoName = repoElement.find('.repo').text().trim();
        }
        
        // Try different selectors for description
        let description = repoElement.find('p.pinned-item-desc').text().trim();
        if (!description) {
          description = repoElement.find('.color-fg-muted').text().trim();
          description=description.split('\n')[0];
        }
        
        // Try different selectors for language
        let language = repoElement.find('span[itemprop="programmingLanguage"]').text().trim();
        if (!language) {
          language = repoElement.find('.repo-language-color').next().text().trim();
        }
        
        pinnedRepos.push({
          name: repoName || "Unknown Repository",
          description: description || null,
          language: language || null
        });
      });
      
      enhancedUser.pinned_repositories = pinnedRepos;

      // Extract additional profile data with more resilient selectors
      // Updated selectors to look specifically for follower/following counts
      const followers = $('a[href$="?tab=followers"], a[href*="followers"]').first().text().replace(/\D/g, '') || '0';
      const following = $('a[href$="?tab=following"], a[href*="following"]').first().text().replace(/\D/g, '') || '0';
      
      // Extract organizations
      const organizations = [];
      $('a[data-hovercard-type="organization"], .avatar-group-item').each((_, el) => {
        const orgName = $(el).attr('aria-label') || $(el).text().trim();
        if (orgName) organizations.push(orgName);
      });
      
      // Extract profile readme with multiple possible selectors
      let profileReadme = $('div.js-user-profile-bio').text().trim();
      if (!profileReadme) {
        profileReadme = $('.user-profile-bio').text().trim();
      }
      if (!profileReadme) {
        profileReadme = $('div[itemprop="description"]').text().trim();
      }

      enhancedUser.raw_data = {
        followers,
        following,
        organizations,
        profile_readme: profileReadme || null
      };

      this.cache.set(cacheKey, enhancedUser);
      return enhancedUser;
    } catch (err) {
      console.error(`Error scraping profile ${user.username}: ${err.message}`);
      return {
        ...user,
        raw_data: { error: err.message }
      };
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  clearCache() {
    this.cache.clear();
    console.info('Cache cleared');
  }
}

module.exports = GitHubScraper;