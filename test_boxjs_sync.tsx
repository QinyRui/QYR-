import { fetch, VStack, Text, Button, Navigation, Script } from "scripting"

declare const Dialog: any

// 测试从 BoxJS 读取鉴权信息
async function testBoxJsSync() {
  console.log("=" .repeat(50))
  console.log("🧪 开始测试 BoxJS 同步功能")
  console.log("=" .repeat(50))
  
  const boxJsUrl = "https://boxjs.com"
  const baseUrl = boxJsUrl.replace(/\/$/, "")
  const authUrl = `${baseUrl}/query/data/ninebot.authorization`
  const deviceUrl = `${baseUrl}/query/data/ninebot.deviceId`
  
  console.log("\n📍 步骤 1: 准备请求 URL")
  console.log(`   BoxJS URL: ${boxJsUrl}`)
  console.log(`   Authorization URL: ${authUrl}`)
  console.log(`   DeviceId URL: ${deviceUrl}`)
  
  try {
    console.log("\n📍 步骤 2: 发送 HTTP 请求")
    const [authResponse, deviceResponse] = await Promise.all([
      fetch(authUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "NinebotTest/1.0.0",
          "Referer": baseUrl,
        },
        timeout: 10000
      }),
      fetch(deviceUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "NinebotTest/1.0.0",
          "Referer": baseUrl,
        },
        timeout: 10000
      })
    ])
    
    console.log("\n📍 步骤 3: 检查 HTTP 状态")
    console.log(`   Authorization Status: ${authResponse.status} ${authResponse.ok ? '✅' : '❌'}`)
    console.log(`   DeviceId Status: ${deviceResponse.status} ${deviceResponse.ok ? '✅' : '❌'}`)
    
    console.log("\n📍 步骤 4: 读取响应文本")
    const authText = await authResponse.text()
    const deviceText = await deviceResponse.text()
    
    console.log(`   Authorization 原始响应 (${authText.length} 字符):`)
    console.log(`   ${authText}`)
    console.log(`   DeviceId 原始响应 (${deviceText.length} 字符):`)
    console.log(`   ${deviceText}`)
    
    console.log("\n📍 步骤 5: 解析 JSON")
    let authData: any
    let deviceData: any
    
    try {
      authData = JSON.parse(authText)
      deviceData = JSON.parse(deviceText)
      console.log("   ✅ JSON 解析成功")
    } catch (e) {
      console.log(`   ❌ JSON 解析失败: ${e}`)
      throw e
    }
    
    console.log("\n📍 步骤 6: 查看解析后的对象结构")
    console.log(`   authData 类型: ${typeof authData}`)
    console.log(`   authData 内容: ${JSON.stringify(authData, null, 2)}`)
    console.log(`   authData 的 keys: ${Object.keys(authData).join(', ')}`)
    
    console.log(`   deviceData 类型: ${typeof deviceData}`)
    console.log(`   deviceData 内容: ${JSON.stringify(deviceData, null, 2)}`)
    console.log(`   deviceData 的 keys: ${Object.keys(deviceData).join(', ')}`)
    
    console.log("\n📍 步骤 7: 提取值")
    console.log(`   尝试提取 authData.val: ${authData?.val}`)
    console.log(`   尝试提取 authData.value: ${authData?.value}`)
    console.log(`   尝试提取 authData.data: ${authData?.data}`)
    
    console.log(`   尝试提取 deviceData.val: ${deviceData?.val}`)
    console.log(`   尝试提取 deviceData.value: ${deviceData?.value}`)
    console.log(`   尝试提取 deviceData.data: ${deviceData?.data}`)
    
    const authorization = authData?.val || authData?.value || authData?.data || ""
    const deviceId = deviceData?.val || deviceData?.value || deviceData?.data || ""
    
    console.log("\n📍 步骤 8: 最终提取结果")
    console.log(`   authorization: ${authorization ? `${authorization.substring(0, 20)}... (${authorization.length} 字符)` : '(空)'}`)
    console.log(`   deviceId: ${deviceId ? `${deviceId.substring(0, 20)}... (${deviceId.length} 字符)` : '(空)'}`)
    
    if (authorization && deviceId) {
      console.log("\n✅ 同步测试成功！")
      console.log(`   Authorization 长度: ${authorization.length}`)
      console.log(`   DeviceId 长度: ${deviceId.length}`)
      
      await Dialog.alert({
        title: "✅ 测试成功",
        message: `成功从 BoxJS 读取鉴权信息\n\nAuthorization: ${authorization.substring(0, 30)}...\nDeviceId: ${deviceId}`,
        buttonLabel: "确定"
      })
    } else {
      console.log("\n❌ 同步测试失败：数据为空")
      const missing = []
      if (!authorization) missing.push("authorization")
      if (!deviceId) missing.push("deviceId")
      
      await Dialog.alert({
        title: "❌ 测试失败",
        message: `未能获取 ${missing.join(' 和 ')}\n\n请检查 BoxJS 中是否已配置:\n• ninebot.authorization\n• ninebot.deviceId`,
        buttonLabel: "确定"
      })
    }
    
  } catch (error: any) {
    console.log("\n❌ 发生错误:")
    console.log(`   错误类型: ${error.constructor.name}`)
    console.log(`   错误消息: ${error.message}`)
    console.log(`   错误堆栈: ${error.stack}`)
    
    await Dialog.alert({
      title: "❌ 测试出错",
      message: `${error.message}`,
      buttonLabel: "确定"
    })
  }
  
  console.log("\n" + "=".repeat(50))
  console.log("🧪 测试完成")
  console.log("=".repeat(50))
}

// UI
function TestView() {
  return (
    <VStack padding={20} spacing={20} alignment="center">
      <Text font={24}>🧪</Text>
      <Text font={16} fontWeight="bold">BoxJS 同步测试</Text>
      <Text font={14} foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        点击下方按钮测试从 BoxJS{"\n"}读取 ninebot.authorization 和{"\n"}ninebot.deviceId
      </Text>
      
      <Button
        title="开始测试"
        systemImage="play.fill"
        action={async () => {
          await testBoxJsSync()
        }}
      />
      
      <Text font={12} foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
        请在控制台查看详细日志
      </Text>
    </VStack>
  )
}

async function run() {
  await Navigation.present({
    element: <TestView />,
    modalPresentationStyle: "formSheet"
  })
  Script.exit()
}

run()