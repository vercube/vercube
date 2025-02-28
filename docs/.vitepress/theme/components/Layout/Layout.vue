<script setup>
import DefaultTheme from 'vitepress/theme';
import Footer from './Footer.vue';
import Home from '../Home/Home.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-before>
      <Home/>
    </template>
    <template #layout-bottom>
      <Footer/>
    </template>
  </Layout>
</template>