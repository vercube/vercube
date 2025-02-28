<template>
  <section class="section">
    <div class="section-content">
      <div class="section-header">
        <h2>Built-in Modules</h2>
        <p>Vercube comes with a comprehensive suite of modules that work together seamlessly, saving you time and
          effort.</p>
      </div>

      <div class="modules-minimal">
        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="module-content">
            <h4>Auth</h4>
            <p>Complete authentication solution with support for sessions, JWT, OAuth and more.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
          </div>
          <div class="module-content">
            <h4>CLI</h4>
            <p>Powerful command-line tools for scaffolding, building, and managing your application.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z">
              </path>
            </svg>
          </div>
          <div class="module-content">
            <h4>Core</h4>
            <p>Essential foundations for your application with routing, middleware, and utilities.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div class="module-content">
            <h4>Logger</h4>
            <p>Structured logging with multiple transport options and configurable log levels.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
          </div>
          <div class="module-content">
            <h4>DevKit</h4>
            <p>Development tools to enhance productivity, debugging, and development workflows.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 20V10"></path>
              <path d="M12 20V4"></path>
              <path d="M6 20v-6"></path>
            </svg>
          </div>
          <div class="module-content">
            <h4>DI</h4>
            <p>Powerful dependency injection system for better code organization and testability.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
          </div>
          <div class="module-content">
            <h4>Storage</h4>
            <p>Unified storage API with providers for Redis, Cloudflare KV, Amazon S3, and more.</p>
          </div>
        </div>

        <div class="module-minimal">
          <div class="module-icon-minimal">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
              stroke="#ad58ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4">
              </path>
            </svg>
          </div>
          <div class="module-content">
            <h4>Database</h4>
            <p>Database integration with providers for Drizzle ORM and Prisma.</p>
            <span class="module-tag-minimal">Coming Soon</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>