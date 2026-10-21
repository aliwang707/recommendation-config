<script setup lang="ts">
import { computed, customRef, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  ElButton,
  ElCard,
  ElDialog,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
} from 'element-plus'
import 'element-plus/dist/index.css'
import ConfigForm from '../../components/recommendation/ConfigForm.vue'
import { useRecommendationStore } from '../../stores/recommendation'
import type { ConfigFormData, RecommendationConfig } from '../../stores/recommendation'

/** 字典映射：用于筛选选项与列格式化 */
const positionMap: Record<RecommendationConfig['position'], string> = {
  home: '首页',
  detail: '商详页',
  pay: '支付完成页',
}
const strategyTypeMap: Record<RecommendationConfig['strategyType'], string> = {
  manual: '人工推荐',
  algorithm: '算法推荐',
}
const statusMap: Record<RecommendationConfig['status'], string> = {
  1: '生效',
  0: '下线',
}

/** 表格列配置：数据列统一由 v-for 渲染，操作列为独立的模板列 */
interface TableColumn<T> {
  /** 收紧为 T 的字段名：prop 拼写错误可在编译期暴露 */
  prop: Extract<keyof T, string>
  label: string
  /** 业务侧最小签名；EP 原生 formatter 类型过于宽松，依赖它无法获得检查 */
  formatter?: (row: T) => string
}
const columns: TableColumn<RecommendationConfig>[] = [
  { prop: 'name', label: '配置名称' },
  { prop: 'position', label: '推荐位', formatter: (row) => positionMap[row.position] },
  { prop: 'strategyType', label: '策略类型', formatter: (row) => strategyTypeMap[row.strategyType] },
  { prop: 'priority', label: '优先级' },
  { prop: 'updatedAt', label: '更新时间' },
  { prop: 'status', label: '状态', formatter: (row) => statusMap[row.status] },
]

/** 推荐配置 Store：列表数据与增删改的唯一数据源，组件只调用 action，不直接修改状态 */
const store = useRecommendationStore()

/** 筛选条件 */
const filters = reactive({
  keyword: '',
  position: '' as '' | RecommendationConfig['position'],
  strategyType: '' as '' | RecommendationConfig['strategyType'],
})

/**
 * 搜索输入防抖（手写 customRef + setTimeout，延迟 300ms，不引第三方库）：
 * v-model 直接绑定 searchInput；输入框即时回显，停顿 300ms 后才同步到
 * filters.keyword 触发列表过滤，避免每敲一个键就重算一遍筛选/分页。
 */
let searchValue = filters.keyword // 输入框的即时显示值
let searchTimer: ReturnType<typeof setTimeout> | undefined
const searchInput = customRef<string>((track, trigger) => ({
  get() {
    track()
    return searchValue
  },
  set(newValue) {
    searchValue = newValue
    trigger() // 立即回显，防止防抖期间输入框显示回跳
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      filters.keyword = newValue // 停顿 300ms 后才真正更新筛选条件
    }, 300)
  },
}))

/** 组件卸载时清理防抖定时器，避免卸载后仍触发回调 */
onBeforeUnmount(() => {
  clearTimeout(searchTimer)
})

/** 前端本地筛选：数据来自 Store，随输入即时过滤，不发起请求 */
const filteredConfigs = computed(() =>
  store.configs.filter((item) => {
    const keyword = filters.keyword.trim().toLowerCase()
    return (
      (!keyword || item.name.toLowerCase().includes(keyword)) &&
      (!filters.position || item.position === filters.position) &&
      (!filters.strategyType || item.strategyType === filters.strategyType)
    )
  }),
)

/** 分页状态：本地分页，不重新请求 */
const pagination = reactive({
  page: 1,
  pageSize: 5,
})
/** 筛选后总条数 */
const total = computed(() => filteredConfigs.value.length)
/** 当前页数据：对筛选结果做本地切片 */
const pagedConfigs = computed(() => {
  const start = (pagination.page - 1) * pagination.pageSize
  return filteredConfigs.value.slice(start, start + pagination.pageSize)
})

/** 任一筛选条件变化时回到第一页，避免停留在超出范围的空页 */
watch(
  () => [filters.keyword, filters.position, filters.strategyType],
  () => {
    pagination.page = 1
  },
)

/** 总条数变化（如筛选使数据变少、删除最后一页数据）时，若当前页已越界则自动回退 */
watch(total, () => {
  const maxPage = Math.max(1, Math.ceil(total.value / pagination.pageSize))
  if (pagination.page > maxPage) {
    pagination.page = maxPage
  }
})

/** 切换每页条数后回到第一页 */
function handleSizeChange() {
  pagination.page = 1
}

/** 重置筛选条件（先经防抖 setter 清空输入框，顺带取消未触发的定时器，防止旧关键字“复活”） */
function handleResetFilters() {
  searchInput.value = ''
  filters.keyword = ''
  filters.position = ''
  filters.strategyType = ''
}

/** 弹窗可见性 */
const dialogVisible = ref(false)
/** 当前编辑行 id；null 表示新增模式 */
const editingId = ref<number | null>(null)
/** ConfigForm 组件实例：表单数据与校验均经组件 ref 获取 */
const configFormRef = ref<InstanceType<typeof ConfigForm>>()

/** 传给 ConfigForm 的初始表单数据：编辑时预填目标行，新增时用默认值 */
const initialForm = ref<Partial<ConfigFormData>>({
  name: '',
  position: 'home',
  strategyType: 'manual',
  manualProductIds: '',
  algorithmModel: 'model-a',
  priority: 50,
})

/** 打开新增弹窗：重置为默认值 */
function handleOpenCreate() {
  editingId.value = null
  initialForm.value = {
    name: '',
    position: 'home',
    strategyType: 'manual',
    manualProductIds: '',
    algorithmModel: 'model-a',
    priority: 50,
  }
  dialogVisible.value = true
}

/** 打开编辑弹窗：深拷贝目标行数据，避免弹窗内修改污染表格原始行 */
function handleOpenEdit(row: RecommendationConfig) {
  editingId.value = row.id
  // 1. 只挑选 ConfigFormData 需要的字段，剔除系统维护的 id/status/updatedAt；
  // 2. structuredClone 深拷贝：将来字段升级为数组/嵌套对象时，弹窗内修改不会写回原始行。
  //    （弹窗 destroy-on-close，组件每次打开重新挂载，克隆数据经 initialForm 预填）
  const { name, position, strategyType, manualProductIds, algorithmModel, priority } = row
  initialForm.value = structuredClone({
    name,
    position,
    strategyType,
    manualProductIds,
    algorithmModel,
    priority,
  })
  dialogVisible.value = true
}

/** 表单提交中：配合“确定”按钮 loading 态拦截连点，防止重复提交 */
const isSubmitting = ref(false)

/** 提交表单：新增则追加本地数组，编辑则按 id 行级精确更新，均不重新请求列表 */
async function handleSubmit() {
  // 并发拦截：提交在途时忽略重复点击
  if (isSubmitting.value) return

  // 表单数据与校验均来自 ConfigForm 组件（随弹窗打开重新挂载，数据必为最新）
  const form = configFormRef.value?.form
  if (!form) return
  try {
    await configFormRef.value?.validate()
  } catch {
    return // 校验不通过，ConfigForm 内部 el-form 已展示错误信息
  }

  isSubmitting.value = true
  try {
    if (editingId.value === null) {
      // 新增：id 由模拟接口（后端）在 Store action 内生成并追加到列表
      await store.addConfig(form)
      ElMessage.success('新增成功')
    } else {
      // 编辑：Store 按 id 行级精确更新，其余行不受影响
      store.updateConfig(editingId.value, form)
      ElMessage.success('保存成功')
    }
    dialogVisible.value = false
  } finally {
    isSubmitting.value = false
  }
}

/** 行级状态切换：乐观更新、失败回滚与并发拦截均收口在 Store action，组件只负责提示 */
async function handleStatusChange(row: RecommendationConfig) {
  const ok = await store.toggleStatus(row.id)
  if (!ok) {
    ElMessage.error('状态切换失败，已回滚')
  }
}

/** 删除配置：二次确认后从 Store 中过滤掉该条，不重新请求列表 */
async function handleDelete(row: RecommendationConfig) {
  try {
    await ElMessageBox.confirm(`确定删除配置「${row.name}」吗？删除后不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消删除
  }
  store.removeConfig(row.id)
  ElMessage.success('删除成功')
}
</script>

<template>
  <div class="recommendation-config-page">
    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-bar">
        <el-input
          v-model="searchInput"
          placeholder="搜索配置名称"
          clearable
          class="filter-item"
        />
        <el-select
          v-model="filters.position"
          placeholder="推荐位"
          clearable
          class="filter-item"
        >
          <el-option
            v-for="(label, value) in positionMap"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <el-select
          v-model="filters.strategyType"
          placeholder="策略类型"
          clearable
          class="filter-item"
        >
          <el-option
            v-for="(label, value) in strategyTypeMap"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <el-button @click="handleResetFilters">重置</el-button>
      </div>
    </el-card>

    <!-- 配置表格 -->
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-button type="primary" @click="handleOpenCreate">新增配置</el-button>
      </div>
      <el-table :data="pagedConfigs" row-key="id">
        <!-- 数据列：由列配置驱动渲染 -->
        <el-table-column
          v-for="col in columns"
          :key="col.prop"
          :prop="col.prop"
          :label="col.label"
          :formatter="col.formatter"
        />
        <!--
          操作列：编辑 / 删除 / 行级开关；状态切换与删除均调用 Store action，
          仅更新该行数据，不触发全表重载。
          EP 将槽内 row 声明为宽泛的 DefaultRow（Record<PropertyKey, any>），
          无法直接赋给 RecommendationConfig（严格逆变下编译报错），
          因此在此处对 row 做唯一一次 as 收窄。
        -->
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleOpenEdit(row as RecommendationConfig)">
              编辑
            </el-button>
            <el-button link type="danger" @click="handleDelete(row as RecommendationConfig)">
              删除
            </el-button>
            <el-switch
              :model-value="row.status"
              :active-value="1"
              :inactive-value="0"
              :loading="store.updatingIds.has(row.id)"
              @change="handleStatusChange(row as RecommendationConfig)"
            />
          </template>
        </el-table-column>
      </el-table>
      <!-- 分页器：本地分页 -->
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="total"
        :page-sizes="[5, 10, 20]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        class="pagination"
        @size-change="handleSizeChange"
      />
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId === null ? '新增配置' : '编辑配置'"
      width="480px"
      destroy-on-close
    >
      <!-- 整个表单（基础字段 + 策略联动）由 ConfigForm 承载，数据与校验均经组件 ref 获取 -->
      <ConfigForm ref="configFormRef" :initial-form="initialForm" />
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="isSubmitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.recommendation-config-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.filter-bar {
  display: flex;
  gap: 12px;
}

.filter-item {
  width: 180px;
}

.table-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}

.pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
</style>
