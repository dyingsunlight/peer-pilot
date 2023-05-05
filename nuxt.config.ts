export default defineNuxtConfig({
  modules: ['@nuxtjs/tailwindcss'],
  runtimeConfig: {
    public: {
      mode: process.env.MODE === 'production' ? 'production' : 'development'
    }
  }
})
