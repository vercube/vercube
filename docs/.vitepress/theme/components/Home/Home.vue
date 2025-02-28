<template>
  <div class="custom-page">
    <Hero />
    <ZeroConfig />
    <Modules />
    <OpenSource />
  </div>
</template>

<script setup>
import Hero from './Hero.vue';
import ZeroConfig from './ZeroConfig.vue';
import Modules from './Modules.vue';
import OpenSource from './OpenSource.vue';
</script>

<style lang="scss">
.custom-page {

  .highlight {
    color: #ad58ff;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
  }

  h2 {
    font-size: 48px;
    font-weight: 600;
    margin-bottom: 1.5rem;
    line-height: 1.2;
    letter-spacing: -1px;
  }

  .d-none {
    display: none;
  }

  /* Section Styles */
  .section {
    padding: 8rem 4rem;
    position: relative;
    overflow: hidden;
  }

  .section-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  .section-content {
    position: relative;
    z-index: 2;
    max-width: 1200px;
    margin: 0 auto;
  }

  .section-header {
    text-align: center;
    margin-bottom: 5rem;
  }

  .section-header h2 {
    font-size: 48px;
    font-weight: 700;
    margin-bottom: 1rem;
    background: linear-gradient(to right, #ad58ff, #ff56bd);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    display: inline-block;
  }

  .section-header p {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.7);
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* Navigation Styles */
  .navbar {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 70px;
    background-color: transparent;
    z-index: 1000;
    transition: background-color 0.3s ease, border-bottom 0.3s ease;
    border-bottom: 1px solid transparent;
    padding: 0 4rem;
  }

  .navbar.scrolled {
    background-color: rgba(12, 4, 32, 0.95);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-color: rgba(255, 255, 255, 0.05);
  }

  .navbar-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100%;
    max-width: 1200px;
    margin: 0 auto;
  }

  .navbar-logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: white;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.25rem;
  }

  .navbar-logo svg,
  .navbar-logo img {
    max-width: 28px;
    max-height: 28px;
  }

  .navbar-nav {
    display: flex;
    align-items: center;
    gap: 2rem;
  }

  .nav-link {
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    font-size: 0.9375rem;
    font-weight: 500;
    transition: color 0.2s ease;
    position: relative;
  }

  .nav-link:hover {
    color: white;
  }

  .nav-link-github {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .navbar-toggle {
    display: none;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.5rem;
  }

  /* Hero Section */
  .hero {
    position: relative;
    width: 100%;
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 0 4rem;
    overflow: hidden;
    background-color: #0c0420;
    border-radius: 32px;
    margin: 0 auto;
    max-width: 1600px;
  }

  .hero-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 0;
    overflow: hidden;
  }

  .hero-content {
    position: relative;
    z-index: 2;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding-top: 120px;
  }

  .hero-tag {
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 24px;
    font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 0.5px;
  }

  .hero-title {
    font-size: 82px;
    font-weight: 600;
    line-height: 1.1;
    margin-bottom: 32px;
    max-width: 750px;
  }

  .hero-description {
    font-size: 18px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.8);
    max-width: 500px;
    margin-left: auto;
  }

  @media (min-width: 1024px) {
    .hero-description.mobile {
      display: none;
    }
  }

  @media (max-width: 1024px) {
    .hero-description.desktop {
      display: none;
    }
  }

  .hero-flex {
    display: flex;
    justify-content: space-between;
    gap: 4rem;
  }

  .hero-left {
    flex: 1;
    max-width: 700px;
  }

  .hero-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    max-width: 500px;
  }

  /* Hero CTA Buttons */
  .hero-buttons {
    margin-top: 40px;
    display: flex;
    gap: 16px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 500;
    padding: 1rem 1.5rem;
    border-radius: 6px;
    text-decoration: none;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .hero-cta.primary {
    background-color: white;
    color: #0c0420;
    box-shadow: 0 4px 14px rgba(255, 255, 255, 0.25);
  }

  .hero-cta.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 255, 255, 0.3);
  }

  .hero-cta.github {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .hero-cta.github:hover {
    color: white;
    background: rgba(173, 88, 255, 0.1);
    border-color: rgba(173, 88, 255, 0.4);
    transform: translateY(-2px);
  }

  .hero-cta svg {
    margin-left: 8px;
    transition: transform 0.3s ease;
  }

  .hero-cta.github svg {
    margin-right: 8px;
    margin-left: 0;
  }

  .hero-cta:hover svg {
    transform: translateX(4px);
  }

  .hero-cta.github:hover svg {
    transform: translateX(0);
  }

  /* Command Input */
  .command-container {
    margin-top: 32px;
  }

  .command-input {
    display: flex;
    align-items: center;
    padding: 0.875rem 1.25rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    max-width: 400px;
    width: 100%;
    backdrop-filter: blur(5px);
    transition: all 0.2s ease;
  }

  .command-input:hover {
    border-color: rgba(173, 88, 255, 0.2);
    background: rgba(173, 88, 255, 0.03);
  }

  .command-prompt {
    color: #ad58ff;
    margin-right: 0.75rem;
    font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
    font-weight: 600;
  }

  .command-text {
    color: rgba(255, 255, 255, 0.9);
    flex-grow: 1;
    text-align: left;
    font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
    font-size: 0.9rem;
  }

  .copy-button {
    color: rgba(255, 255, 255, 0.6);
    background: none;
    border: none;
    cursor: pointer;
    margin-left: 0.75rem;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .copy-button:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  /* Zero Config Section */
  .zero-config-container {
    display: flex;
    align-items: center;
    gap: 4rem;
    margin-top: 2rem;
  }

  .zero-config-text {
    flex: 1;
  }

  .zero-config-text h2 {
    font-size: 2.5rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    line-height: 1.2;
  }

  .zero-config-description {
    font-size: 1.125rem;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .zero-config-extra {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .zero-config-button {
    margin-top: 1.5rem;
  }

  .zero-config-code {
    flex: 1;
  }

  .code-block {
    border-radius: 8px;
    overflow: hidden;
    background: rgba(12, 4, 32, 0.6);
    border: 1px solid rgba(173, 88, 255, 0.2);
    font-family: "SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace;
  }

  .code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .code-filename {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .code-copy-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .code-copy-btn:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .code-content {
    padding: 1.5rem;
  }

  .code-content pre {
    margin: 0;
    font-size: 0.9375rem;
    line-height: 1.6;
    overflow-x: auto;
  }

  .code-import {
    color: #FF56BD;
  }

  .code-function {
    color: #AD58FF;
  }

  .code-string {
    color: #4ADE80;
  }

  .code-comment {
    color: rgba(255, 255, 255, 0.4);
  }

  /* Modules Section */
  .modules-minimal {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1.5rem;
    margin-top: 3rem;
  }

  .module-minimal {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1.25rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    transition: all 0.2s ease;
  }

  .module-minimal:hover {
    border-color: rgba(173, 88, 255, 0.4);
    background: rgba(173, 88, 255, 0.05);
    transform: translateY(-2px);
  }

  .module-icon-minimal {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(173, 88, 255, 0.1);
    flex-shrink: 0;
  }

  .module-content {
    flex: 1;
  }

  .module-content h4 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: white;
  }

  .module-content p {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }

  .module-tag-minimal {
    display: inline-block;
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    border-radius: 20px;
    background: rgba(173, 88, 255, 0.15);
    color: #ad58ff;
  }

  /* Open Source Section */
  .open-source-section {
    text-align: center;
    padding: 6rem 2rem;
  }

  .opensource-content {
    display: flex;
    flex-direction: column;
  }

  .opensource-heart {
    margin: 0 auto 1.5rem;
    text-align: center;
    filter: drop-shadow(0 0 12px rgba(173, 88, 255, 0.6));
  }

  .opensource-title {
    font-size: 3.5rem;
    font-weight: 600;
    text-align: center;
    margin-bottom: 1.5rem;
  }

  .opensource-desc {
    font-size: 1.1rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    margin: 0 auto 3rem;
    line-height: 1.6;
    max-width: 600px;
  }

  .opensource-links {
    display: flex;
    justify-content: center;
    gap: 2rem;
    margin-top: 2rem;
  }

  .minimal-link {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: rgba(255, 255, 255, 0.7);
    text-decoration: none;
    font-size: 1rem;
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
    width: 195px;
    text-align: center;
    justify-content: center;
  }

  .minimal-link:hover {
    color: white;
    border-color: rgba(173, 88, 255, 0.4);
    background: rgba(173, 88, 255, 0.1);
    transform: translateY(-2px);
  }

  /* Media Queries */
  @media (max-width: 1000px) {
    .hero .hero-background svg {
      width: 100%;
      height: 100%;
    }
  }

  @media (max-width: 992px) {
    .section {
      padding: 6rem 2rem;
    }

    .zero-config-container {
      flex-direction: column;
      gap: 3rem;
    }

    .zero-config-text {
      text-align: center;
    }

    .hero-title {
      font-size: 60px;
    }

    .hero-description {
      margin-left: 0;
      margin-top: 32px;
    }

    .hero-flex {
      flex-direction: column;
      gap: 2rem;
    }

    .hero-right {
      margin-top: 0;
    }

    .modules-minimal {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .hero {
      padding: 0 2rem;
    }

    .hero-title {
      font-size: 48px;
    }

    .hero-buttons {
      flex-direction: column;
    }

    .navbar {
      padding: 0 2rem;
    }

    .navbar-nav {
      display: none;
      position: absolute;
      top: 70px;
      left: 0;
      width: 100%;
      background-color: rgba(12, 4, 32, 0.95);
      flex-direction: column;
      padding: 1.5rem;
      gap: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .navbar-nav.active {
      display: flex;
    }

    .navbar-toggle {
      display: block;
    }

    h1 {
      font-size: 64px;
    }

    h2 {
      font-size: 36px;
    }

    .modules-minimal {
      grid-template-columns: 1fr;
    }

    .opensource-links {
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .minimal-link {
      width: 100%;
      max-width: 280px;
    }

    .opensource-title {
      font-size: 2.5rem;
    }
  }

  @media (max-width: 480px) {
    h1 {
      font-size: 48px;
      letter-spacing: -3px;
    }

    h2 {
      font-size: 32px;
    }

    .hero-cta {
      width: 100%;
      justify-content: center;
    }

    .footer-links {
      grid-template-columns: 1fr;
    }

    .hero-title {
      font-size: 40px;
    }

    .zero-config-container .zero-config-code {
      display: none;
    }
  }
}
</style>