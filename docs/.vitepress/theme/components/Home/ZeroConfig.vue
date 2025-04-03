<template>
  <section class="section">
    <div class="section-background">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"
        style="transform: translateY(-50px)">
        <defs>
          <linearGradient id="gradient1-zero" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#ad58ff" stop-opacity="0.3" />
            <stop offset="100%" stop-color="#ff56bd" stop-opacity="0.1" />
          </linearGradient>
        </defs>

        <rect width="100%" height="100%" fill="#0c0420" />

        <g opacity="0.3">
          <path 
            v-for="(_, index) in 8" 
            :key="index" 
            :d="`M0,${300 + index * 30} Q600,${400 + index * 30} 1200,${300 + index * 30}`" 
            stroke="url(#gradient1-zero)" 
            stroke-width="1" 
            fill="none" 
          />
        </g>
      </svg>
    </div>
    <div class="section-content">
      <div class="zero-config-container">
        <div class="zero-config-text">
          <h2>Zero Configuration</h2>
          <p class="zero-config-description">
            Get started in seconds with zero configuration needed. Vercube works out of the box while using rolldown.rs
            - the fastest Rust-based bundler available.
          </p>
          <p class="zero-config-extra">
            Focus on building your application instead of configuring your tools. Vercube handles the complexity while
            giving you the flexibility to customize when needed.
          </p>

          <div class="zero-config-button">
            <a href="/config" class="hero-cta github">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              Configuration Guide
            </a>
          </div>
        </div>

        <div class="zero-config-code">
          <div class="code-block">
            <div class="code-header">
              <div class="code-filename">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                vercube.config.ts
              </div>
              <button class="code-copy-btn" @click="copyCode">
                <template v-if="copied">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
            <div class="code-content">
              <pre><code><span class="code-import">import</span> { <span class="code-function">defineConfig</span> } <span class="code-import">from</span> <span class="code-string">'@vercube/core'</span>;

<span class="code-import">export</span> <span class="code-import">default</span> <span class="code-function">defineConfig</span>({ 
  <span class="code-comment">// additional config here</span>
});</code></pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';

// State for copy button
const copied = ref(false);

// Code content to copy
const codeContent = `import { defineConfig } from '@vercube/core';

export default defineConfig({ 
  // additional config here
});`;

// Copy function
const copyCode = () => {
  navigator.clipboard.writeText(codeContent)
    .then(() => {
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2000);
    })
    .catch(err => {
      console.error('Failed to copy code: ', err);
    });
};
</script>