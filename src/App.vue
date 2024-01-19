<script setup lang="ts">
const test = () => {
  window.electronAPI.test()
}
</script>

<template>
  <button @click="test">测试</button>
</template>
