<script setup lang="ts">
import { ref } from "vue"
import { onMounted } from 'vue';

const bgDom = ref<HTMLDivElement>()
const maskDom = ref<HTMLDivElement>()
const canvasDom = ref<HTMLCanvasElement>()
const sizeInfoDom = ref<HTMLDivElement>()
const toolbarDom = ref<HTMLDivElement>()
const btnResetDom = ref<HTMLDivElement>()
const btnSaveDom = ref<HTMLDivElement>()
const btnCloseDom = ref<HTMLDivElement>()
const btnOkDom = ref<HTMLDivElement>()

const getScreen = async (currentScreen: any, callback: Function) => {
  const sources = await window.electronAPI.getSources()
  await window.electronAPI.getStream(sources, currentScreen)
  callback()
}

onMounted(async () => {
  document.body.addEventListener('mousedown', (e) => {
    if (e.button === 2) window.close()
  }, true)

  const currentScreen = await window.electronAPI.getCurrentScreenInstance()
  getScreen(currentScreen, async () => {
    window.electronAPI.init(
      canvasDom.value!,
      bgDom.value!,
      sizeInfoDom.value!,
      toolbarDom.value!,
      btnCloseDom.value!,
      btnOkDom.value!,
      btnSaveDom.value!,
      btnResetDom.value!,
      maskDom.value!,
    )
  })
  window.addEventListener('keypress', (e) => {
    if (e.code === "Enter" || e.code == "NumpadEnter") window.electronAPI.selectCapture()
  })
})
</script>

<template>
  <div id="js-bg" class="bg" ref="bgDom"></div>
  <div id="js-mask" ref="maskDom"></div>
  <canvas id="js-canvas" class="image-canvas" ref="canvasDom"></canvas>
  <div id="js-size-info" class="size-info" ref="sizeInfoDom"></div>
  <div id="js-toolbar" class="toolbar" ref="toolbarDom">
    <div class="iconfont icon-zhongzhi" id="js-tool-reset" ref="btnResetDom"></div>
    <div class="iconfont icon-xiazai" id="js-tool-save" ref="btnSaveDom"></div>
    <div class="iconfont icon-guanbi" id="js-tool-close" ref="btnCloseDom"></div>
    <div class="iconfont icon-duihao" id="js-tool-ok" ref="btnOkDom"></div>
  </div>
</template>