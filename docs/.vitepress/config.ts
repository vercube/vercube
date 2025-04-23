// .vitepress/config.js
import { defineConfig } from 'vitepress';


export default defineConfig({
  // Site metadata
  title: 'Vercube',
  description: 'Next generation Node.js framework for ultra-efficient server apps',
  
  // Theme-related options
  themeConfig: {
    // Logo in nav and sidebar
    logo: '/images/logo-big.png',
    siteTitle: '',
    
    // Custom social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/vercube/vercube' },
      { 
        icon: { 
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 -28.5 256 256" version="1.1" preserveAspectRatio="xMidYMid"><g><path d="M216.856339,16.5966031 C200.285002,8.84328665 182.566144,3.2084988 164.041564,0 C161.766523,4.11318106 159.108624,9.64549908 157.276099,14.0464379 C137.583995,11.0849896 118.072967,11.0849896 98.7430163,14.0464379 C96.9108417,9.64549908 94.1925838,4.11318106 91.8971895,0 C73.3526068,3.2084988 55.6133949,8.86399117 39.0420583,16.6376612 C5.61752293,67.146514 -3.4433191,116.400813 1.08711069,164.955721 C23.2560196,181.510915 44.7403634,191.567697 65.8621325,198.148576 C71.0772151,190.971126 75.7283628,183.341335 79.7352139,175.300261 C72.104019,172.400575 64.7949724,168.822202 57.8887866,164.667963 C59.7209612,163.310589 61.5131304,161.891452 63.2445898,160.431257 C105.36741,180.133187 151.134928,180.133187 192.754523,160.431257 C194.506336,161.891452 196.298154,163.310589 198.110326,164.667963 C191.183787,168.842556 183.854737,172.420929 176.223542,175.320965 C180.230393,183.341335 184.861538,190.991831 190.096624,198.16893 C211.238746,191.588051 232.743023,181.531619 254.911949,164.955721 C260.227747,108.668201 245.831087,59.8662432 216.856339,16.5966031 Z M85.4738752,135.09489 C72.8290281,135.09489 62.4592217,123.290155 62.4592217,108.914901 C62.4592217,94.5396472 72.607595,82.7145587 85.4738752,82.7145587 C98.3405064,82.7145587 108.709962,94.5189427 108.488529,108.914901 C108.508531,123.290155 98.3405064,135.09489 85.4738752,135.09489 Z M170.525237,135.09489 C157.88039,135.09489 147.510584,123.290155 147.510584,108.914901 C147.510584,94.5396472 157.658606,82.7145587 170.525237,82.7145587 C183.391518,82.7145587 193.761324,94.5189427 193.539891,108.914901 C193.539891,123.290155 183.391518,135.09489 170.525237,135.09489 Z" fill="currentColor"></path></g></svg>',
        }, 
        link: 'https://discord.gg/safphS45aN', 
      },
      { 
        icon: { 
          svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584l-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"></path></svg>',
        }, 
        link: 'https://x.com/vercubejs', 
      },
    ],
    
    // Nav bar links
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Config', link: '/config/' },
      { text: 'Modules', link: '/modules/' },
      { text: 'Changelog', link: 'https://github.com/vercube/vercube/blob/main/CHANGELOG.md' },
    ],
    
    // Sidebar navigation
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          collapsed: false,
          items: [
            { text: 'What is Vercube?', link: '/guide/' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Core Concepts',
          collapsed: false,
          items: [
            { text: 'Dependency Injection', link: '/guide/dependency-injection' },
            { text: 'Routing and Controllers', link: '/guide/routing' },
            { text: 'Middleware', link: '/guide/middleware' },
            { text: 'Error Handling', link: '/guide/error-handling' },
          ],
        },
      ],
      '/config/': [
        {
          text: 'Configuration',
          items: [
            { text: 'Overview', link: '/config/' },
          ],
        },
      ],
      '/modules/': [
        {
          text: 'Core',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/core' },
            { text: 'Application', link: '/modules/core/application' },
            { text: 'Decorators', link: '/modules/core/decorators' },
            { text: 'Hooks', link: '/modules/core/hooks' },
            { text: 'Validation', link: '/modules/core/validation' },
          ],
        },
        {
          text: 'DI',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/di' },
            { text: 'Container', link: '/modules/di/container' },
            { text: 'Decorators', link: '/modules/di/decorators' },
            { text: 'Types', link: '/modules/di/types' },
            { text: 'Advanced', link: '/modules/di/advanced' },
          ],
        },
        {
          text: 'Logger',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/logger' },
            { text: 'Logger', link: '/modules/logger/logger' },
            { text: 'Providers', link: '/modules/logger/providers' },
            { text: 'Types', link: '/modules/logger/types' },
            { text: 'Advanced', link: '/modules/logger/advanced' },
          ],
        },
        {
          text: 'Storage',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/storage' },
            { text: 'Storage Manager', link: '/modules/storage/storage-manager' },
            { text: 'Storage Interface', link: '/modules/storage/storage-interface' },
            { text: 'Storage Types', link: '/modules/storage/storage-types' },
            { text: 'Storage Implementations', link: '/modules/storage/storage-implementations' },
            { text: 'Advanced Usage', link: '/modules/storage/advanced' },
          ],
        },
        {
          text: 'Auth',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/auth' },
            { text: 'Auth Provider', link: '/modules/auth/auth-provider' },
            { text: 'Auth Decorator', link: '/modules/auth/auth-decorator' },
            { text: 'User Decorator', link: '/modules/auth/user-decorator' },
            { text: 'Auth Types', link: '/modules/auth/auth-types' },
            { text: 'Auth Implementations', link: '/modules/auth/auth-implementations' },
            { text: 'Advanced Usage', link: '/modules/auth/advanced' },
          ],
        },
        {
          text: 'H3',
          collapsed: true,
          items: [
            { text: 'Overview', link: '/modules/h3' },
          ],
        },
      ],
    },
    
    // Search configuration (using Algolia or local search)
    search: {
      provider: 'local',
    },
    
    // Carbon Ads config (remove if not using)
    // carbonAds: {
    //   code: 'your-carbon-code',
    //   placement: 'your-carbon-placement'
    // },
    
    // Edit documentation links
    editLink: {
      pattern: 'https://github.com/vercube/docs/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
  
  // Markdown configuration
  markdown: {
    lineNumbers: true,
  },
  
  // Custom CSS file
  head: [
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Public+Sans:ital,wght@0,100..900;1,100..900&display=swap' }],
    ['link', { rel: 'icon', href: '/favicon.ico' }],
  ],
  
  // Configure the dark mode to always be on
  appearance: 'dark',
});