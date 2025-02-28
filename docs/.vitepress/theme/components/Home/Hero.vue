<template>
  <div class="hero">
    <div class="hero-background">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ad58ff" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="#ff56bd" stop-opacity="0.1"/>
          </linearGradient>
        </defs>
        
        <!-- Background base -->
        <rect width="100%" height="100%" fill="#0c0420"/>
        
        <!-- Gradient wave lines -->
        <g opacity="0.4">
          <!-- Generate curved lines with different positions -->
          <path v-for="(_, index) in 30" :key="index" 
                :d="`M0,${200 + index * 20} Q600,${100 + index * 20} 1200,${300 + index * 20}`" 
                stroke="url(#gradient1)" 
                stroke-width="1" 
                fill="none" />
        </g>
      </svg>
    </div>

    <div class="hero-content">
      <div class="hero-flex">
        <div class="hero-left">
          <div class="hero-tag">// NEXT GENERATION NODE.JS FRAMEWORK</div>
          <h1 class="hero-title">Unleash your server development.</h1>

          <p class="hero-description mobile">An ultra-efficient Node.js framework built on top of H3 - fully configurable and
            packed with a rich suite of out-of-the-box modules for developers who demand performance.</p>

          <div class="hero-buttons">
            <a href="#" class="hero-cta primary">
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
            <a href="https://github.com/vercube/vercube" class="hero-cta github">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path
                  d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22">
                </path>
              </svg>
              GitHub
            </a>
          </div>

          <div class="command-container">
            <div class="command-input">
              <span class="command-prompt">$</span>
              <span class="command-text">{{ commandText }}</span>
              <button class="copy-button" @click="copyCommand">
                <template v-if="copied">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="checkmark">
                    <path d="M20 6L9 17L4 12" stroke="#4ADE80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </template>
                <template v-else>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </template>
              </button>
            </div>
          </div>
        </div>

        <div class="hero-right">
          <p class="hero-description desktop">An ultra-efficient Node.js framework built on top of H3 - fully configurable and
            packed with a rich suite of out-of-the-box modules for developers who demand performance.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

// Command text state
const commandText = ref('pnpm create vercube@latest');
const copied = ref(false);

// Copy command function
const copyCommand = () => {
  navigator.clipboard.writeText(commandText.value)
    .then(() => {
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy command: ', err);
    });
};
</script>