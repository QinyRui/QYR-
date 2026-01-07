const $http = $httpClient;
const url="https://raw.githubusercontent.com/QinyRui/QYR-/main/MihoyoSign.plugin";
$http.get({url},(err,resp,data)=>{
  if(err){console.log("[Mihoyo][Update] 检查失败");$done();return;}
  console.log("[Mihoyo][Update] 最新插件可用");
  $done();
});