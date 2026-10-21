import { defineStore } from 'pinia'
import { ref } from 'vue'

/** 策略类型：manual-人工推荐 / algorithm-算法推荐 */
export type StrategyType = 'manual' | 'algorithm'
/** 算法模型标识 */
export type AlgorithmModel = 'model-a' | 'model-b'

/** 推荐配置项（全局唯一模型定义，页面与表单组件均从这里导入） */
export interface RecommendationConfig {
  /** 稳定唯一标识：列表渲染与行级更新均以 id 为准，严禁使用 index 作为 key */
  id: number
  /** 配置名称 */
  name: string
  /** 推荐位 */
  position: 'home' | 'detail' | 'pay'
  /** 策略类型 */
  strategyType: StrategyType
  /** 人工推荐：商品 ID 列表（逗号分隔，strategyType 为 manual 时使用） */
  manualProductIds: string
  /** 算法推荐：所用模型（strategyType 为 algorithm 时使用） */
  algorithmModel: AlgorithmModel
  /** 优先级（数值越大越靠前） */
  priority: number
  /** 最近更新时间 */
  updatedAt: string
  /** 状态：1-生效 0-下线 */
  status: 0 | 1
}

/** 弹窗表单数据结构：基础字段 + 策略联动字段（不含系统维护的 id/status/updatedAt） */
export interface ConfigFormData {
  name: string
  position: RecommendationConfig['position']
  strategyType: StrategyType
  manualProductIds: string
  algorithmModel: AlgorithmModel
  priority: number
}

/** 生成 'YYYY-MM-DD HH:mm' 格式的当前时间 */
function formatNow(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 模拟新增配置接口：延迟 200ms，由“后端”生成 id（Date.now()）并返回完整记录 */
function createConfigApi(payload: Omit<RecommendationConfig, 'id'>): Promise<RecommendationConfig> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ...payload, id: Date.now() }), 200)
  })
}

/** 模拟单行状态切换接口：MVP 阶段本地 mock，后续替换为 Axios 封装的真实接口 */
function updateStatusApi(_id: number, _status: 0 | 1): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 200))
}

/** 推荐配置 Store：列表数据与增删改的唯一数据源，组件只调用 action，不直接修改状态 */
export const useRecommendationStore = defineStore('recommendation', () => {
  /** 推荐配置列表 */
  const configs = ref<RecommendationConfig[]>([
    { id: 1, name: '首页轮播-热销商品', position: 'home', strategyType: 'algorithm', manualProductIds: '', algorithmModel: 'model-a', priority: 100, updatedAt: '2026-10-18 10:20', status: 1 },
    { id: 2, name: '商详页-同类商品推荐', position: 'detail', strategyType: 'algorithm', manualProductIds: '', algorithmModel: 'model-b', priority: 90, updatedAt: '2026-10-17 16:45', status: 1 },
    { id: 3, name: '支付完成页-凑单商品', position: 'pay', strategyType: 'manual', manualProductIds: '1001,1002,1003', algorithmModel: 'model-a', priority: 80, updatedAt: '2026-10-16 09:12', status: 0 },
    { id: 4, name: '首页楼层-新品首发', position: 'home', strategyType: 'manual', manualProductIds: '2001,2002', algorithmModel: 'model-a', priority: 70, updatedAt: '2026-10-15 14:30', status: 1 },
    { id: 5, name: '商详页-搭配购买', position: 'detail', strategyType: 'manual', manualProductIds: '3001,3002,3003,3004', algorithmModel: 'model-a', priority: 60, updatedAt: '2026-10-14 11:08', status: 0 },
    { id: 6, name: '支付完成页-会员专享', position: 'pay', strategyType: 'algorithm', manualProductIds: '', algorithmModel: 'model-b', priority: 50, updatedAt: '2026-10-13 18:22', status: 1 },
  ])

  /** 正在提交状态切换的行 id 集合：请求在途时忽略该行的重复触发，防止连点导致状态错乱 */
  const updatingIds = ref(new Set<number>())

  /** 新增配置：id 由模拟接口（后端）生成，成功后追加到列表尾部 */
  async function addConfig(form: ConfigFormData): Promise<void> {
    const created = await createConfigApi({ ...form, status: 0, updatedAt: formatNow() })
    configs.value.push(created)
  }

  /** 编辑配置：按 id 定位目标行做行级精确更新，其余行不受影响 */
  function updateConfig(id: number, form: ConfigFormData): void {
    const target = configs.value.find((item) => item.id === id)
    if (target) {
      Object.assign(target, { ...form, updatedAt: formatNow() })
    }
  }

  /**
   * 行级状态切换（乐观更新策略）：
   * 1. 同一行请求在途时直接忽略新触发（配合 el-switch 的 loading 态双重拦截）；
   * 2. 先立即翻转该行 status，界面即时响应；
   * 3. 再异步提交接口，接口异常时按行回滚。
   * 返回 false 表示接口失败已回滚，由调用方负责提示。
   */
  async function toggleStatus(id: number): Promise<boolean> {
    if (updatingIds.value.has(id)) return true
    const target = configs.value.find((item) => item.id === id)
    if (!target) return true

    updatingIds.value.add(id)
    const prevStatus = target.status
    target.status = prevStatus === 1 ? 0 : 1
    try {
      await updateStatusApi(id, target.status)
      return true
    } catch {
      target.status = prevStatus
      return false
    } finally {
      updatingIds.value.delete(id)
    }
  }

  /** 删除配置：按 id 从列表中过滤掉该条，不重新请求 */
  function removeConfig(id: number): void {
    configs.value = configs.value.filter((item) => item.id !== id)
  }

  return { configs, updatingIds, addConfig, updateConfig, toggleStatus, removeConfig }
})
