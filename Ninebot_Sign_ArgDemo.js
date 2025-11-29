/* Loon 插件 UI 参数演示脚本 */
const arg = typeof $argument !== "undefined" ? $argument : {};

// 读取 UI 参数
const DEBUG_LEVEL = Number(arg.debugLevel ?? 0);
const PROGRESS_STYLE = Number(arg.progressStyle ?? 0);
const TITLE_PREFIX = arg.titlePrefix || "九号签到";

// 示例进度条渲染
const PROGRESS_STYLES = [
  ["█","░"],["▓","░"],["▰","▱"],["●","○"],
  ["■","□"],["➤","·"],["▮","▯"],["⣿","⣀"]
];
function renderProgress(cur,total,style=0,len=20){
  const [F,E] = PROGRESS_STYLES[style]||PROGRESS_STYLES[0];
  const f = Math.round((cur/total)*len);
  return F.repeat(f)+E.repeat(Math.max(0,len-f));
}

// 日志等级输出函数
function log(level,msg){
  if(level <= DEBUG_LEVEL) console.log(`[${new Date().toLocaleTimeString()}]`, msg);
}

// 演示脚本内容
(async ()=>{
  log(0,`脚本启动 - 日志等级=${DEBUG_LEVEL}, 盲盒样式=${PROGRESS_STYLE}, 标题=${TITLE_PREFIX}`);

  // 演示进度条
  const cur = 5, total = 7;
  const bar = renderProgress(cur,total,PROGRESS_STYLE,20);
  log(1,`进度条示例: [${bar}] ${cur}/${total}`);

  // 通知演示
  if(typeof $notification !== "undefined"){
    $notification.post(TITLE_PREFIX,"今日签到演示",`盲盒进度: ${cur}/${total}\n日志等级: ${DEBUG_LEVEL}\n样式: ${PROGRESS_STYLE}`);
  }

  $done();
})();