<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElForm, ElFormItem, ElInput, ElInputNumber, ElOption, ElSelect } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import 'element-plus/dist/index.css'
import type { AlgorithmModel, ConfigFormData, StrategyType } from '../../stores/recommendation'

/** 字典映射：用于下拉选项 */
const positionMap: Record<ConfigFormData['position'], string> = {
  home: '首页',
  detail: '商详页',
  pay: '支付完成页',
}
const strategyTypeMap: Record<StrategyType, string> = {
  manual: '人工',
  algorithm: '算法',
}
const algorithmModelMap: Record<AlgorithmModel, string> = {
  'model-a': '模型A',
  'model-b': '模型B',
}

/** 组件 props：initialForm 用于编辑场景预填初始数据 */
const props = defineProps<{
  /** 初始表单值；未提供的字段使用默认值 */
  initialForm?: Partial<ConfigFormData>
}>()

/** 弹窗表单：初始值优先取 initialForm（配合父级弹窗 destroy-on-close，每次打开重新挂载读取） */
const form = reactive<ConfigFormData>({
  name: props.initialForm?.name ?? '',
  position: props.initialForm?.position ?? 'home',
  strategyType: props.initialForm?.strategyType ?? 'manual',
  /** 人工推荐：商品 ID 列表（逗号分隔） */
  manualProductIds: props.initialForm?.manualProductIds ?? '',
  /** 算法推荐：所用模型 */
  algorithmModel: props.initialForm?.algorithmModel ?? 'model-a',
  priority: props.initialForm?.priority ?? 50,
})

/** 内部表单实例与校验规则：随表单字段一起下沉到本组件 */
const formRef = ref<FormInstance>()
const formRules: FormRules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  priority: [{ required: true, message: '请输入优先级', trigger: 'change' }],
}

/**
 * 表单联动（规则：必须精确监听单字段，严禁监听整个 reactive 表单对象）：
 * 仅监听 () => form.strategyType，切换策略时清理失效字段、给新字段恢复默认值，
 * 避免携带另一策略下的脏数据；显示/隐藏由模板 v-if 声明式完成。
 */
watch(
  () => form.strategyType,
  (type) => {
    if (type === 'manual') {
      form.algorithmModel = 'model-a' // 商品 ID 列表登场，模型选择恢复默认
    } else {
      form.manualProductIds = '' // 模型选择登场，清空失效的商品 ID 输入
    }
  },
)

/** 暴露表单数据与校验方法，供父组件读取、校验并提交 */
defineExpose({
  form,
  validate: () => formRef.value?.validate(),
})
</script>

<template>
  <el-form ref="formRef" :model="form" :rules="formRules" label-width="90px" class="config-form">
    <el-form-item label="配置名称" prop="name">
      <el-input v-model="form.name" placeholder="请输入配置名称" maxlength="50" />
    </el-form-item>
    <el-form-item label="推荐位" prop="position">
      <el-select v-model="form.position">
        <el-option
          v-for="(label, value) in positionMap"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="推荐策略" prop="strategyType">
      <el-select v-model="form.strategyType">
        <el-option
          v-for="(label, value) in strategyTypeMap"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
    </el-form-item>
    <!-- 联动字段：人工 → 商品 ID 列表（v-if 保证不相关字段不渲染、不参与校验） -->
    <el-form-item
      v-if="form.strategyType === 'manual'"
      label="商品ID列表"
      prop="manualProductIds"
    >
      <el-input
        v-model="form.manualProductIds"
        placeholder="多个商品 ID 用英文逗号分隔，如：1001,1002"
      />
    </el-form-item>
    <!-- 联动字段：算法 → 算法模型 -->
    <el-form-item
      v-if="form.strategyType === 'algorithm'"
      label="算法模型"
      prop="algorithmModel"
    >
      <el-select v-model="form.algorithmModel">
        <el-option
          v-for="(label, value) in algorithmModelMap"
          :key="value"
          :label="label"
          :value="value"
        />
      </el-select>
    </el-form-item>
    <el-form-item label="优先级" prop="priority">
      <el-input-number v-model="form.priority" :min="0" :max="999" />
    </el-form-item>
  </el-form>
</template>

<style scoped>
.config-form {
  max-width: 420px;
}

.config-form :deep(.el-select) {
  width: 100%;
}
</style>
