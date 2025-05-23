// @ts-expect-error
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import Layout from './components/Layout/Layout.vue';
import './style.css';

export default {
  ...DefaultTheme,
  Layout,
  enhanceApp({ app, router, siteData }) {},
} satisfies Theme;
