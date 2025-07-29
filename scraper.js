


const puppeteer = require('puppeteer');
const fs = require('fs').promises;

// Configuration variable for headless mode
const headlessMode = true; // Set to false to show browser window

class WebScraper {
    constructor() {
        this.browser = null;
        this.page = null;
        this.activeTimeouts = new Set();
    }

    // Method to get client configuration from file
    async getClientConfig() {
        try {
            const configData = await fs.readFile('client-configs.json', 'utf8');
            const configs = JSON.parse(configData);
            
            // Use timestamp to ensure different config each run
            const timestamp = Date.now();
            const configIndex = timestamp % configs.length;
            const config = configs[configIndex];
            
            console.log(`🌍 Using client config #${config.id}: ${config.platform} from ${config.location}`);
            console.log(`🔧 User-Agent: ${config.userAgent.split(' ')[0]}...`);
            console.log(`📱 Viewport: ${config.viewport.width}x${config.viewport.height}`);
            console.log(`🌐 Language: ${config.language.split(',')[0]}`);
            
            return config;
        } catch (error) {
            console.error('❌ Error reading client configs:', error.message);
            // Fallback to basic config
            return {
                id: 1,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                language: 'es-ES,es;q=0.9,en;q=0.8',
                platform: 'Windows',
                location: 'Madrid, Spain',
                coordinates: { latitude: 40.4168, longitude: -3.7038 },
                timezone: 'Europe/Madrid'
            };
        }
    }

    async init(options = {}) {
        // Get client configuration from file and fingerprint
        const clientConfig = await this.getClientConfig();
        const clientFingerprint = this.generateClientFingerprint();
        
        const defaultOptions = {
            headless: headlessMode,
            slowMo: headlessMode ? 0 : 50,
            defaultViewport: clientConfig.viewport,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                `--lang=${clientConfig.language.split(',')[0]}`,
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        };
        
        this.browser = await puppeteer.launch({ ...defaultOptions, ...options });
        this.page = await this.browser.newPage();
        
        // Remove automation indicators and set client fingerprint
        await this.page.evaluateOnNewDocument((fingerprint, config) => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // Remove chrome automation flags
            delete window.chrome.runtime.onConnect;
            delete window.chrome.runtime.onMessage;
            
            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // Override languages based on client config
            Object.defineProperty(navigator, 'languages', {
                get: () => [config.language.split(',')[0], 'es', 'en'],
            });
            
            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Set unique client identifiers in localStorage and sessionStorage
            localStorage.setItem('clientId', fingerprint.deviceId);
            localStorage.setItem('browserId', fingerprint.browserId);
            localStorage.setItem('sessionStart', fingerprint.timestamp.toString());
            sessionStorage.setItem('sessionId', fingerprint.sessionId);
            sessionStorage.setItem('deviceFingerprint', JSON.stringify(fingerprint));
            
            // Override navigator platform
            Object.defineProperty(navigator, 'platform', {
                get: () => config.platform === 'Windows' ? 'Win32' : 
                           config.platform === 'macOS' ? 'MacIntel' : 'Linux x86_64',
            });
            
            // Set unique device characteristics
            Object.defineProperty(screen, 'width', {
                get: () => config.viewport.width,
            });
            Object.defineProperty(screen, 'height', {
                get: () => config.viewport.height,
            });
            
        }, clientFingerprint, clientConfig);
        
        // Set randomized headers based on client config
        await this.page.setUserAgent(clientConfig.userAgent);
        
        // Extract Chrome version from User-Agent
        const chromeVersionMatch = clientConfig.userAgent.match(/Chrome\/(\d+)/);
        const chromeVersion = chromeVersionMatch ? chromeVersionMatch[1] : '120';
        
        // Set platform-specific headers
        const platformHeaders = {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': clientConfig.language + ',en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Charset': 'ISO-8859-1,utf-8;q=0.7,*;q=0.3',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': `"Not_A Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`,
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': `"${clientConfig.platform}"`,
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        };
        
        await this.page.setExtraHTTPHeaders(platformHeaders);
        
        // Set geolocation override to match the client location
        await this.page.setGeolocation(clientConfig.coordinates);
        
        console.log(`🔧 Configured as ${clientConfig.userAgent.split(' ')[0]} browser from ${clientConfig.location}`);
    }


    // Method to generate random client fingerprint
    generateClientFingerprint() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000000);
        const deviceId = `client_${timestamp}_${random}`;
        const sessionId = `session_${Math.random().toString(36).substring(2, 15)}`;
        const browserId = `browser_${Math.random().toString(36).substring(2, 12)}`;
        
        console.log(`🆔 Generated client fingerprint: ${deviceId}`);
        return {
            deviceId,
            sessionId,
            browserId,
            timestamp
        };
    }

    async navigateTo(url, retries = 3) {
        if (!this.page) {
            throw new Error('Browser not initialized. Call init() first.');
        }
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`Navigating to: ${url} (attempt ${attempt}/${retries})`);
                await this.page.goto(url, { 
                    waitUntil: 'domcontentloaded', 
                    timeout: 60000 
                });
                console.log(`Successfully navigated to: ${url}`);
                return;
            } catch (error) {
                console.log(`Navigation attempt ${attempt} failed:`, error.message);
                if (attempt === retries) {
                    throw error;
                }
                console.log(`Waiting 3 seconds before retry...`);
                await this.safeTimeout(3000);
            }
        }
    }

    async waitForSelector(selector, timeout = 5000) {
        return await this.page.waitForSelector(selector, { timeout });
    }

    async click(selector) {
        await this.waitForSelector(selector);
        await this.page.click(selector);
        console.log(`Clicked: ${selector}`);
    }

    async type(selector, text, delay = 30) {
        await this.waitForSelector(selector);
        await this.page.type(selector, text, { delay });
        console.log(`Typed "${text}" in: ${selector}`);
    }

    async getText(selector) {
        await this.waitForSelector(selector);
        return await this.page.$eval(selector, el => el.textContent.trim());
    }

    async getElements(selector) {
        return await this.page.$$(selector);
    }

    async screenshot(filename = 'screenshot.png') {
        // Ensure screens directory exists
        const screensDir = './screens';
        try {
            await fs.mkdir(screensDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore error
        }
        
        const fullPath = `${screensDir}/${filename}`;
        await this.page.screenshot({ path: fullPath, fullPage: true });
        console.log(`📸 Screenshot saved: ${fullPath}`);
        
        // Log artifact URL for GitHub Actions
        if (process.env.GITHUB_RUN_NUMBER) {
            const repoUrl = process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY;
            const artifactUrl = `${repoUrl}/actions/runs/${process.env.GITHUB_RUN_ID}`;
            console.log(`🔗 View screenshots at: ${artifactUrl}`);
        }
    }

    async extractData(selector, attribute = 'textContent') {
        const elements = await this.page.$$(selector);
        const data = [];
        
        for (let element of elements) {
            if (attribute === 'textContent') {
                const text = await this.page.evaluate(el => el.textContent.trim(), element);
                data.push(text);
            } else {
                const attr = await this.page.evaluate((el, attr) => el.getAttribute(attr), element, attribute);
                data.push(attr);
            }
        }
        
        return data;
    }

    // Safe timeout method that tracks timeouts for cleanup
    async safeTimeout(ms) {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.activeTimeouts.delete(timeoutId);
                resolve();
            }, ms);
            this.activeTimeouts.add(timeoutId);
        });
    }

    // Clear all active timeouts
    clearAllTimeouts() {
        this.activeTimeouts.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.activeTimeouts.clear();
        console.log('Cleared all active timeouts');
    }

    async close() {
        // Clear any active timeouts before closing
        this.clearAllTimeouts();
        
        if (this.browser) {
            await this.browser.close();
            console.log('Browser closed');
        }
    }


    // Method to read initial URL from initial.txt (MANDATORY)
    async readInitialFromFile() {
        try {
            const initialContent = await fs.readFile('initial.txt', 'utf8');
            const initialUrl = initialContent.trim();
            if (!initialUrl) {
                throw new Error('initial.txt is empty - URL is required');
            }
            console.log(`🎯 Using primary URL from initial.txt: ${initialUrl}`);
            return initialUrl;
        } catch (error) {
            console.error('❌ Error reading initial.txt:', error.message);
            throw new Error('initial.txt file is required and must contain a valid URL');
        }
    }


    // Method to attempt modal close (fast - assume it exists)
    async closeModalIfOpen() {
        try {
            // Just click assuming modal exists - ignore if it fails
            await this.page.click('a.link[aria-controls="modal"]').catch(() => {});
        } catch (error) {
            // Ignore all errors - we don't care if modal doesn't exist
        }
    }

    // Method to check if we're still on the search results page
    async checkIfOnSearchPage() {
        const currentUrl = this.page.url();
        return currentUrl.includes('/results/search');
    }

    // Method to return to search results page if we've navigated away
    async returnToSearchPageIfNeeded() {
        const isOnSearchPage = await this.checkIfOnSearchPage();
        if (!isOnSearchPage) {
            console.log('Page changed - returning to initial URL...');
            const initialUrl = await this.readInitialFromFile();
            await this.navigateTo(initialUrl);
            await this.safeTimeout(3000); // Wait for page load
            return true;
        }
        return false;
    }

    // Method to click on "Siguiente" button for pagination (fast version)
    async clickNextPageButton() {
        try {
            // Get current URL to extract page number
            const currentUrl = this.page.url();
            const urlParams = new URL(currentUrl).searchParams;
            const currentPage = parseInt(urlParams.get('pageno') || '1');
            const nextPage = currentPage + 1;
            
            // Get base URL from initial.txt and add page number
            const initialUrl = await this.readInitialFromFile();
            const baseUrl = new URL(initialUrl);
            baseUrl.searchParams.set('pageno', nextPage);
            const nextPageUrl = baseUrl.toString();
            
            // Check if siguiente button exists first
            const siguienteExists = await this.page.$('a[href*="pageno="]');
            if (!siguienteExists) {
                console.log('No "Siguiente" button found - reached last page');
                return { success: false, currentPage: currentPage };
            }
            
            // Navigate directly to preserve search parameters
            await this.navigateTo(nextPageUrl);
            console.log(`Found "Siguiente" button - navigating to page ${nextPage} with search parameters...`);
            
            // Verify we actually moved to the next page
            await this.safeTimeout(2000); // Wait for page to load
            const newUrl = this.page.url();
            const newUrlParams = new URL(newUrl).searchParams;
            const actualPage = parseInt(newUrlParams.get('pageno') || '1');
            
            if (actualPage === currentPage) {
                console.log(`WARNING: Still on page ${currentPage} after navigation attempt - page loop detected`);
                return { success: false, currentPage: currentPage, loopDetected: true };
            }
            
            console.log('Successfully navigated to next page');
            return { success: true, currentPage: actualPage };
        } catch (error) {
            // If direct click fails, button doesn't exist
            console.log('No "Siguiente" button found - reached last page');
            return { success: false, currentPage: parseInt(urlParams.get('pageno') || '1') };
        }
    }

    // Method to click on deactivated hearts only
    async clickDeactivatedHearts() {
        
        try {
            console.log('💖 Looking for deactivated hearts...');
            
            // Take screenshot before clicking hearts
            await this.screenshot('before-hearts.png');
            
            // First, let's check what's actually on the page
            console.log('🔍 Checking page structure...');
            
            // Check for various heart-related selectors
            const heartContainers = await this.page.$$('div.pointer.me3.relative');
            console.log(`🔍 Found ${heartContainers.length} heart containers (div.pointer.me3.relative)`);
            
            const allDataShowinterest = await this.page.$$('[data-showinterest]');
            console.log(`🔍 Found ${allDataShowinterest.length} elements with data-showinterest attribute`);
            
            const heartIcons = await this.page.$$('svg use[xlink\\:href*="icon-heart"]');
            console.log(`🔍 Found ${heartIcons.length} heart SVG icons`);
            
            // Check page content to understand structure
            const pageInfo = await this.page.evaluate(() => {
                return {
                    title: document.title,
                    bodyClasses: document.body.className,
                    hasProfiles: document.querySelectorAll('[class*="profile"], [class*="member"]').length,
                    totalDivs: document.querySelectorAll('div').length
                };
            });
            console.log('🔍 Page info:', pageInfo);
            
            // Try to find deactivated hearts without waiting for specific selector
            let deactivatedHearts = [];
            
            if (allDataShowinterest.length > 0) {
                // Check what data-showinterest values exist
                const dataValues = await this.page.evaluate(() => {
                    const elements = document.querySelectorAll('[data-showinterest]');
                    return Array.from(elements).map(el => el.getAttribute('data-showinterest')).slice(0, 10);
                });
                console.log('🔍 Sample data-showinterest values:', dataValues);
                
                // Find deactivated hearts (those with showInterest URLs)
                const deactivatedHeartSelector = 'div[data-showinterest*="/es/memberrelationship/showInterest/"]';
                deactivatedHearts = await this.page.$$(deactivatedHeartSelector);
                console.log(`🔍 Found ${deactivatedHearts.length} deactivated hearts with main selector`);
            } else {
                console.log('⚠️ No elements with data-showinterest found - page may have different structure');
            }
            
            let heartsClicked = 0;
            let lastClickTime = Date.now();
            
            // Click on all deactivated hearts found
            for (let i = 0; i < deactivatedHearts.length; i++) {
                try {
                    const currentTime = Date.now();
                    const timeSinceLastClick = heartsClicked > 0 ? ((currentTime - lastClickTime) / 1000).toFixed(1) : 0;
                    
                    if (heartsClicked > 0) {
                        console.log(`Clicking heart ${i + 1}/${deactivatedHearts.length} - ${timeSinceLastClick} seg`);
                    } else {
                        console.log(`Clicking heart ${i + 1}/${deactivatedHearts.length}`);
                    }
                    
                    await deactivatedHearts[i].click();
                    heartsClicked++;
                    lastClickTime = Date.now();
                    
                    // Quick modal close attempt (no waiting)
                    this.closeModalIfOpen(); // No await - fire and forget
                    
                    // Very short delay between clicks
                    await this.safeTimeout(100 + Math.random() * 200);
                    
                } catch (error) {
                    console.log(`Failed to click heart ${i + 1}:`, error.message);
                }
            }
            
            // Take screenshot after clicking hearts
            await this.screenshot('after-hearts.png');
            console.log(`✅ Finished clicking hearts on this page - clicked ${heartsClicked} hearts`);
            
            return heartsClicked;
            
        } catch (error) {
            console.error('Error clicking hearts:', error.message);
            await this.screenshot('hearts-error.png');
            return 0;
        }
    }

    // LatinAmericaCupid specific workflow following instructions.md
    async runLatinAmericaCupidWorkflow() {
        try {
            console.log('Starting LatinAmericaCupid workflow...');
            
            // Step 1: Navigate to login page
            console.log('Step 1: Navigating to login page...');
            await this.navigateTo('https://www.colombiancupid.com/es/auth/login');
            
            // Step 2: Wait for page load and perform login
            console.log('Step 2: Waiting for page load and performing login...');
            await this.safeTimeout( 3000); // Wait 3 seconds for page stabilization
            
            // Add random mouse movements to simulate human behavior
            await this.page.mouse.move(100, 100);
            await this.safeTimeout(500);
            await this.page.mouse.move(200, 200);
            
            // Wait for login form elements to be available
            await this.waitForSelector('input[name="email"], input[type="email"]', 10000);
            await this.waitForSelector('input[name="password"], input[type="password"]', 10000);
            
            // Enter credentials (use environment variables for security)
            const emailSelector = 'input[name="email"], input[type="email"]';
            const passwordSelector = 'input[name="password"], input[type="password"]';
            
            const email = process.env.BRAZIL_CUPID_EMAIL;
            const password = process.env.BRAZIL_CUPID_PASSWORD;
            
            if (!email || !password) {
                throw new Error('BRAZIL_CUPID_EMAIL and BRAZIL_CUPID_PASSWORD environment variables are required');
            }
            
            // Simulate human typing with very fast delays
            await this.page.focus(emailSelector);
            await this.safeTimeout(200);
            await this.page.type(emailSelector, email, { delay: 15 });
            
            await this.safeTimeout(250);
            await this.page.focus(passwordSelector);
            await this.safeTimeout(150);
            await this.page.type(passwordSelector, password, { delay: 18 });
            
            // Take screenshot before clicking login
            await this.screenshot('before-login.png');
            
            // Click login button
            const loginButtonSelector = 'button[type="submit"], input[type="submit"], .btn-login, .login-btn, [value="Ingresar"]';
            await this.click(loginButtonSelector);
            console.log('Login button clicked');
            
            // Step 3: Wait for login completion with better error handling
            console.log('Step 3: Waiting for login completion...');
            try {
                // Wait for either navigation OR error messages on same page
                await Promise.race([
                    this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                    this.page.waitForSelector('.error, .alert, .warning, [class*="error"]', { timeout: 5000 })
                ]);
                
                // Take screenshot after login attempt
                await this.screenshot('after-login.png');
                
                // Check if we're still on login page (login failed)
                const currentUrl = this.page.url();
                console.log('🔍 Current URL after login:', currentUrl);
                
                if (currentUrl.includes('login') || currentUrl.includes('auth')) {
                    console.log('⚠️  Still on login page - checking for errors...');
                    
                    // Look for error messages
                    const errorElements = await this.page.$$('.error, .alert, .warning, [class*="error"]');
                    if (errorElements.length > 0) {
                        const errorText = await this.page.evaluate(() => {
                            const errors = document.querySelectorAll('.error, .alert, .warning, [class*="error"]');
                            return Array.from(errors).map(el => el.textContent.trim()).join('; ');
                        });
                        console.log('❌ Login error found:', errorText);
                    }
                    
                    // Wait a bit more in case it's a slow redirect
                    console.log('⏳ Waiting additional time for potential redirect...');
                    await this.safeTimeout(5000);
                } else {
                    console.log('✅ Login correcto! 🎉 - navigated to:', currentUrl);
                }
                
            } catch (error) {
                console.log('No navigation detected, checking current state...');
                await this.screenshot('login-timeout.png');
                
                const currentUrl = this.page.url();
                console.log('Current URL after timeout:', currentUrl);
                
                // Continue anyway if we're not on login page
                if (!currentUrl.includes('login') && !currentUrl.includes('auth')) {
                    console.log('✅ Login correcto! 🎉 (redirected from login page)');
                } else {
                    console.log('❌ Login may have failed - still on login page');
                }
            }
            
            // Step 4: Check if we're on logon_do page and wait for it to change
            console.log('Step 4: Checking post-login page status...');
            let currentUrl = this.page.url();
            console.log(`🔍 Post-login URL: ${currentUrl}`);
            
            // If we're on logon_do page, just wait until it changes automatically
            if (currentUrl.includes('logon_do')) {
                console.log('⏳ Detected logon_do page - waiting for automatic page change...');
                
                // Wait until URL no longer contains logon_do
                let attempts = 0;
                const maxAttempts = 60; // Wait up to 60 seconds
                
                while (currentUrl.includes('logon_do') && attempts < maxAttempts) {
                    await this.safeTimeout(10000); // Check every second
                    currentUrl = this.page.url();
                    attempts++;
                    
                    if (attempts % 10 === 0) {
                        console.log(`⏳ Still on logon_do page... waiting (${attempts}s)`);
                    }
                }
                
                if (currentUrl.includes('logon_do')) {
                    console.log('⚠️ Still on logon_do page after 60 seconds, proceeding anyway...');
                } else {
                    console.log(`✅ Page changed! New URL: ${currentUrl}`);
                    console.log('⏳ Waiting additional 10 seconds for page to fully stabilize...');
                    await this.safeTimeout(1000); // Wait 10 more seconds after change
                    
                    // Check final URL after stabilization
                    const finalUrl = this.page.url();
                    console.log(`🔍 Final URL after stabilization: ${finalUrl}`);
                    
                    // If we're back at login page, restart login process
                    if (finalUrl.includes('auth/login')) {
                        console.log('🔄 Detected return to login page - restarting login process...');
                        
                        // Re-enter credentials
                        const emailSelector = 'input[name="email"], input[type="email"]';
                        const passwordSelector = 'input[name="password"], input[type="password"]';
                        
                        const email = process.env.BRAZIL_CUPID_EMAIL;
                        const password = process.env.BRAZIL_CUPID_PASSWORD;
                        
                        if (!email || !password) {
                            throw new Error('BRAZIL_CUPID_EMAIL and BRAZIL_CUPID_PASSWORD environment variables are required');
                        }
                        
                        try {
                            // Wait for login form
                            await this.waitForSelector(emailSelector, 10000);
                            await this.waitForSelector(passwordSelector, 10000);
                            
                            // Clear email field completely and re-enter credentials
                            console.log('🧹 Clearing email field...');
                            await this.page.focus(emailSelector);
                            await this.page.keyboard.down('Control');
                            await this.page.keyboard.press('a'); // Select all
                            await this.page.keyboard.up('Control');
                            await this.page.keyboard.press('Delete'); // Delete selected content
                            await this.page.evaluate((selector) => {
                                const field = document.querySelector(selector);
                                if (field) field.value = ''; // Clear programmatically
                            }, emailSelector);
                            await this.safeTimeout(100);
                            
                            console.log('📧 Typing email from scratch...');
                            await this.page.type(emailSelector, email, { delay: 15 });
                            
                            await this.safeTimeout(250);
                            
                            // Clear password field completely and re-enter credentials
                            console.log('🧹 Clearing password field...');
                            await this.page.focus(passwordSelector);
                            await this.page.keyboard.down('Control');
                            await this.page.keyboard.press('a'); // Select all
                            await this.page.keyboard.up('Control');
                            await this.page.keyboard.press('Delete'); // Delete selected content
                            await this.page.evaluate((selector) => {
                                const field = document.querySelector(selector);
                                if (field) field.value = ''; // Clear programmatically
                            }, passwordSelector);
                            await this.safeTimeout(100);
                            
                            console.log('🔐 Typing password from scratch...');
                            await this.page.type(passwordSelector, password, { delay: 18 });
                            
                            // Click login button
                            const loginButtonSelector = 'button[type="submit"], input[type="submit"], .btn-login, .login-btn, [value="Ingresar"]';
                            await this.click(loginButtonSelector);
                            console.log('🔄 Re-login attempt completed');
                            
                            // Wait for login processing
                            await this.safeTimeout(5000);
                            
                            // Recursively check for logon_do again
                            const newUrl = this.page.url();
                            if (newUrl.includes('logon_do')) {
                                console.log('🔄 Back to logon_do after re-login, waiting again...');
                                // This will trigger the logon_do waiting logic again
                                currentUrl = newUrl;
                            }
                            
                        } catch (error) {
                            console.error('❌ Error during re-login:', error.message);
                        }
                    }
                }
            }
            
            // Step 5: Navigate to target URL from initial.txt
            console.log('Step 5: Reading target URL from initial.txt...');
            const targetUrl = await this.readInitialFromFile();
            
            console.log(`🚀 Navigating to target URL: ${targetUrl}`);
            await this.navigateTo(targetUrl);
            
            // Wait for page to fully load
            console.log('⏳ Waiting for page to fully load...');
            await this.safeTimeout(3000);
            
            console.log('Step 6: Starting cyclic heart clicking with pagination...');
            await this.safeTimeout(3000); // Additional wait for page stabilization
            
            let totalHeartsClicked = 0;
            let consecutiveLoops = 0;
            
            while (true) {
                console.log(`\n=== Processing current page ===`);
                
                // Click hearts on current page
                const heartsClickedOnPage = await this.clickDeactivatedHearts();
                totalHeartsClicked += heartsClickedOnPage;
                
                console.log(`💖 Hearts clicked on this page: ${heartsClickedOnPage}`);
                console.log(`📊 Total hearts clicked so far: ${totalHeartsClicked}`);
                
                // Try to go to next page
                console.log('Checking for next page...');
                const nextPageResult = await this.clickNextPageButton();
                
                if (!nextPageResult.success) {
                    if (nextPageResult.loopDetected) {
                        consecutiveLoops++;
                        console.log(`Page loop detected! Consecutive loops: ${consecutiveLoops}`);
                        
                        if (consecutiveLoops >= 3) {
                            console.log('🔄 Multiple page loops detected - restarting from initial URL');
                            const initialUrl = await this.readInitialFromFile();
                            await this.navigateTo(initialUrl);
                            consecutiveLoops = 0;
                            await this.safeTimeout(3000);
                            continue;
                        }
                    } else {
                        console.log('🆕 No more pages available - restarting from initial URL');
                        
                        console.log('🚀 Navigating back to initial URL...');
                        const initialUrl = await this.readInitialFromFile();
                        await this.navigateTo(initialUrl);
                        await this.safeTimeout(3000); // Wait for page load
                        consecutiveLoops = 0;
                        
                        console.log('♾️ Restarting heart clicking cycle from initial URL...');
                        continue; // Continue the infinite loop
                    }
                } else {
                    // Successfully moved to next page - reset loop counter
                    consecutiveLoops = 0;
                }
                
                // Add delay between pages
                await this.safeTimeout(2000);
            }
            
            
        } catch (error) {
            console.error('Error in LatinAmericaCupid workflow:', error);
            throw error;
        }
    }
}

async function example() {
    const scraper = new WebScraper();
    
    try {
        await scraper.init();
        
        await scraper.navigateTo('https://example.com');
        
        await scraper.screenshot('example-page.png');
        
        const title = await scraper.getText('h1');
        console.log('Page title:', title);
        
        await scraper.close();
        
    } catch (error) {
        console.error('Error:', error);
        await scraper.close();
    }
}

// LatinAmericaCupid workflow function following instructions.md
async function runLatinAmericaCupidFlow() {
    const scraper = new WebScraper();
    
    try {
        console.log('Initializing browser with Spanish locale...');
        await scraper.init();
        
        await scraper.runLatinAmericaCupidWorkflow();
        
        await scraper.close();
        
    } catch (error) {
        console.error('Error in BrazilCupid workflow:', error);
        await scraper.close();
    }
}

module.exports = WebScraper;

if (require.main === module) {
    // Run LatinAmericaCupid workflow by default
    runLatinAmericaCupidFlow();
}