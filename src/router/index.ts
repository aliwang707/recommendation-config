import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/recommendation',
    },
    {
      path: '/recommendation',
      name: 'recommendation',
      // 路由级代码分割：页面组件按需加载
      component: () => import('../views/recommendation/RecommendationConfigPage.vue'),
    },
  ],
})

export default router
