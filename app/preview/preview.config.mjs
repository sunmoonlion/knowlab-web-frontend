// 预览的配置：这个应用是谁、用哪几个端口、预览里别的应用在哪。
// 各应用在自己的仓库里改这一份；其余的文件与模板相同。
export const previewConfig = {
  app: 'knowlab',
  // 前门：浏览器访问这一个端口
  port: 3190,
  // Next 自己跑在这个端口，只给前门用
  nextPort: 3191,
  // 预览里别的应用的地址（都在本机）。别的应用的预览没开着，链接点过去就是打不开，属于正常
  apps: {
    knowfeed: 'http://localhost:3110',
    knowbase: 'http://localhost:3120',
    knowbench: 'http://localhost:3100',
  },
  // 这个应用会带人去哪些应用；谁可以带人来、各自的回跳地址。和后端的两项配置同一个意思
  targets: [],
  sources: {},
  // 刚打开预览时用哪个情景
  defaultScenario: 'default',
}
