import {
  Navigation,
  NavigationStack,
  List,
  Section,
  TextField,
  Button,
  Text,
  Toggle,
  Script,
  useState,
  Color,
  HStack,
  Spacer,
  fetch,
  VStack,
  Divider
} from "scripting"

declare const Storage: any
declare const Dialog: any
declare const Safari: any
declare const Pasteboard: any

// ==================== 版本信息 ====================
const VERSION = "1.0.2"
const BUILD_DATE = "2025-12-18"

// ==================== 存储键 ====================
const SETTINGS_KEY = "ninebotSettings"
const FULLSCREEN_KEY = "ninebotSettingsFullscreen"

// ==================== 九号的 BoxJs / 模块链接 ====================
const NINEBOT_BOXJS_JSON_URL =
  "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/Ninebot.boxjs.json"

const NINEBOT_BOXJS_SUB_URL =
  `http://boxjs.com/#/sub/add/${encodeURIComponent(NINEBOT_BOXJS_JSON_URL)}`

const NINEBOT_LOON_PLUGIN_URL =
  "https://raw.githubusercontent.com/QinyRui/QYR-/jiuhao/NinebotSign.plugin"

const NINEBOT_LOON_INSTALL_URL =
  `loon://import?plugin=${encodeURIComponent(NINEBOT_LOON_PLUGIN_URL)}`

// ==================== API测试地址 ====================
const NINEBOT_TEST_SIGN_URL = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2/status"

// ==================== 设置数据结构 ====================
export interface NinebotSettings {
  authorization: string
  deviceId: string
  userAgent: string
  enableBoxJs: boolean
  boxJsUrl: string
  refreshInterval: number
  titleDayColor: Color
  titleNightColor: Color
  descDayColor: Color
  descNightColor: Color
}

// ==================== 默认设置 ====================
const defaultSettings: NinebotSettings = {
  authorization: "",
  deviceId: "",
  userAgent: "Ninebot/3620 CFNetwork/3860.200.71 Darwin/25.1.0",
  enableBoxJs: false,
  boxJsUrl: "https://boxjs.com",
  refreshInterval: 15,
  titleDayColor: "#333333" as unknown as Color,
  titleNightColor: "#FFFFFF" as unknown as Color,
  descDayColor: "#666666" as unknown as Color,
  descNightColor: "#CCCCCC" as unknown as Color,
}

// ==================== 工具函数 ====================
/** 验证DeviceId格式 */
const validateDeviceId = (deviceId: string): boolean => {
  return /^[0-9A-F-]{32,}$/i.test(deviceId)
}

/** 测试API连接 */
const testApiConnection = async (auth: string, deviceId: string, ua: string) => {
  try {
    if (!auth) {
      throw new Error("Authorization不能为空")
    }
    if (!validateDeviceId(deviceId)) {
      throw new Error("DeviceId格式错误，应为UUID格式")
    }

    const response = await fetch(NINEBOT_TEST_SIGN_URL, {
      method: "GET",
      headers: {
        "Authorization": auth,
        "device_id": deviceId,
        "User-Agent": ua || defaultSettings.userAgent,
        "Content-Type": "application/json"
      },
      timeout: 10
    })

    if (response.ok) {
      return { success: true, message: "API连接成功，鉴权信息有效" }
    } else {
      return { success: false, message: `API请求失败，状态码：${response.status}` }
    }
  } catch (error: any) {
    return { success: false, message: `连接异常：${error.message || "未知错误"}` }
  }
}

/** 测试BoxJs连接 */
const testBoxJsConnection = async (url: string) => {
  try {
    const testUrl = `${url.replace(/\/$/, "")}/api/v1/status`
    const response = await fetch(testUrl, { timeout: 5 })
    return response.ok 
      ? { success: true, message: "BoxJs服务连接正常" } 
      : { success: false, message: `BoxJs响应异常，状态码：${response.status}` }
  } catch (error: any) {
    return { success: false, message: `BoxJs连接失败：${error.message || "请检查地址是否正确"}` }
  }
}

/** 从 BoxJS 同步鉴权信息 */
const syncAuthFromBoxJs = async (boxJsUrl: string) => {
  try {
    const baseUrl = boxJsUrl.replace(/\/$/, "")
    const authUrl = `${baseUrl}/query/data/ninebot.authorization`
    const deviceUrl = `${baseUrl}/query/data/ninebot.deviceId`
    
    console.log(`📡 从 BoxJs 同步鉴权信息`)
    console.log(`   Auth URL: ${authUrl}`)
    console.log(`   Device URL: ${deviceUrl}`)
    
    const [authResponse, deviceResponse] = await Promise.all([
      fetch(authUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "NinebotSettings/1.0.2",
          "Referer": baseUrl,
        },
        timeout: 10000
      }),
      fetch(deviceUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "NinebotSettings/1.0.2",
          "Referer": baseUrl,
        },
        timeout: 10000
      })
    ])

    console.log(`   Auth Status: ${authResponse.status}`)
    console.log(`   Device Status: ${deviceResponse.status}`)

    if (!authResponse.ok || !deviceResponse.ok) {
      throw new Error("BoxJS 请求失败")
    }

    const authText = await authResponse.text()
    const deviceText = await deviceResponse.text()
    
    console.log(`   Auth Response: ${authText}`)
    console.log(`   Device Response: ${deviceText}`)

    const authData = JSON.parse(authText)
    const deviceData = JSON.parse(deviceText)

    const authorization = authData?.val || authData?.value || authData?.data || ""
    const deviceId = deviceData?.val || deviceData?.value || deviceData?.data || ""

    console.log(`   提取 authorization: ${authorization ? '成功' : '失败'}`)
    console.log(`   提取 deviceId: ${deviceId ? '成功' : '失败'}`)

    if (!authorization || !deviceId) {
      const missing = []
      if (!authorization) missing.push("authorization")
      if (!deviceId) missing.push("deviceId")
      throw new Error(
        `BoxJs 中未找到 ${missing.join(" 和 ")}\n\n` +
        `请确保已在 BoxJs 中配置:\n` +
        `• ninebot.authorization\n` +
        `• ninebot.deviceId`
      )
    }

    console.log("✅ 同步成功")
    return { 
      success: true, 
      authorization, 
      deviceId,
      message: `成功从 BoxJs 同步鉴权信息`
    }

  } catch (error: any) {
    console.error("❌ 同步失败:", error)
    return { 
      success: false, 
      authorization: "",
      deviceId: "",
      message: `同步失败：${error.message || "未知错误"}` 
    }
  }
}

// ==================== 关于页面组件 ====================
function AboutView() {
  const dismiss = Navigation.useDismiss()
  
  const openTelegram = async () => {
    try {
      await Safari.openURL("https://t.me/JiuHaoAPP")
    } catch (error) {
      await Pasteboard.setString("https://t.me/JiuHaoAPP")
      await Dialog.alert({
        title: "已复制链接",
        message: "Telegram 链接已复制到剪贴板",
        buttonLabel: "确定"
      })
    }
  }
  
  const openGithub = async () => {
    try {
      await Safari.openURL("https://github.com/QinyRui/QYR-/tree/jiuhao")
    } catch (error) {
      await Pasteboard.setString("https://github.com/QinyRui/QYR-/tree/jiuhao")
      await Dialog.alert({
        title: "已复制链接",
        message: "GitHub 仓库链接已复制到剪贴板",
        buttonLabel: "确定"
      })
    }
  }
  
  return (
    <NavigationStack>
      <List
        navigationTitle="关于"
        navigationBarTitleDisplayMode="inline"
        toolbar={{
          topBarTrailing: [
            <Button title="完成" action={dismiss} />
          ]
        }}
      >
        {/* 应用图标和名称 */}
        <Section>
          <VStack alignment="center" spacing={12} padding={20} frame={{ maxWidth: 'infinity' }}>
            <Text font={48} multilineTextAlignment="center">🛴</Text>
            <Text font={20} fontWeight="bold" foregroundStyle="#1E90FF" multilineTextAlignment="center">
              九号电动车助手
            </Text>
            <Text font={14} fontWeight="semibold" foregroundStyle="#4A90E2" multilineTextAlignment="center">
              Ninebot Assistant
            </Text>
          </VStack>
        </Section>
        
        {/* 版本信息 */}
        <Section header={<Text font="body" fontWeight="semibold">📱 版本信息</Text>}>
          <HStack spacing={12} padding={{ vertical: 8, horizontal: 16 }}>
            <Text font={14} fontWeight="medium" foregroundStyle="secondaryLabel">
              版本号
            </Text>
            <Spacer />
            <Text font={14} fontWeight="semibold" foregroundStyle="#4A90E2">
              v{VERSION}
            </Text>
          </HStack>
          
          <HStack spacing={12} padding={{ vertical: 8, horizontal: 16 }}>
            <Text font={14} fontWeight="medium" foregroundStyle="secondaryLabel">
              构建日期
            </Text>
            <Spacer />
            <Text font={14} fontWeight="semibold" foregroundStyle="#4A90E2">
              {BUILD_DATE}
            </Text>
          </HStack>
          
          <HStack spacing={12} padding={{ vertical: 8, horizontal: 16 }}>
            <Text font={14} fontWeight="medium" foregroundStyle="secondaryLabel">
              适配系统
            </Text>
            <Spacer />
            <Text font={14} fontWeight="semibold" foregroundStyle="#4A90E2">
              iOS 17+
            </Text>
          </HStack>
        </Section>
        
        {/* 作者信息 */}
        <Section header={<Text font="body" fontWeight="semibold">👨‍💻 作者信息</Text>}>
          <HStack spacing={12} padding={{ vertical: 8, horizontal: 16 }}>
            <Text font={14} fontWeight="medium" foregroundStyle="secondaryLabel">
              开发者
            </Text>
            <Spacer />
            <Text font={14} fontWeight="semibold" foregroundStyle="#4A90E2">
              QinyRui
            </Text>
          </HStack>
        </Section>
        
        {/* 相关链接 */}
        <Section 
          header={<Text font="body" fontWeight="semibold">🔗 相关链接</Text>}
          footer={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              点击链接可跳转至相应页面
            </Text>
          }
        >
          <Button
            title="Telegram 频道"
            systemImage="paperplane.fill"
            action={openTelegram}
          />
          
          <Button
            title="GitHub 仓库"
            systemImage="chevron.left.forwardslash.chevron.right"
            action={openGithub}
          />
        </Section>
        
        {/* 致谢 */}
        <Section header={<Text font="body" fontWeight="semibold">💝 致谢</Text>}>
          <VStack alignment="center" spacing={8} padding={16} frame={{ maxWidth: 'infinity' }}>
            <Text font={13} foregroundStyle="secondaryLabel" multilineTextAlignment="center">
              感谢所有使用和支持本项目的用户！
            </Text>
            <Text font={13} foregroundStyle="secondaryLabel" multilineTextAlignment="center">
              如有问题或建议，欢迎通过 Telegram 或 GitHub 反馈。
            </Text>
          </VStack>
        </Section>
        
        {/* 底部版权 */}
        <Section>
          <VStack alignment="center" spacing={4} padding={12} frame={{ maxWidth: 'infinity' }}>
            <Text font={11} foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              © 2025 QinyRui
            </Text>
            <Text font={11} foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              Made with ❤️ for Ninebot Users
            </Text>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  )
}

// ==================== 设置页面 ====================
function SettingsView() {
  const dismiss = Navigation.useDismiss()
  
  // 读取全屏偏好
  const storedFullscreen = Storage.get(FULLSCREEN_KEY)
  const [fullscreenPref, setFullscreenPref] = useState<boolean>(
    typeof storedFullscreen === "boolean" ? storedFullscreen : true
  )
  
  const toggleFullscreen = () => {
    const newValue = !fullscreenPref
    setFullscreenPref(newValue)
    Storage.set(FULLSCREEN_KEY, newValue)
  }

  // 读取设置
  const stored = Storage.get(SETTINGS_KEY) as NinebotSettings | null
  const initial: NinebotSettings = stored ?? defaultSettings

  // ==================== State ====================
  const [authorization, setAuthorization] = useState(initial.authorization || "")
  const [deviceId, setDeviceId] = useState(initial.deviceId || "")
  const [userAgent, setUserAgent] = useState(initial.userAgent || defaultSettings.userAgent)
  
  const [enableBoxJs, setEnableBoxJs] = useState(initial.enableBoxJs ?? false)
  const [boxJsUrl, setBoxJsUrl] = useState(initial.boxJsUrl ?? "https://boxjs.com")
  
  const [refreshInterval, setRefreshInterval] = useState(
    initial.refreshInterval ?? 15
  )

  // 加载状态
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ==================== 保存设置 ====================
  const handleSave = () => {
    const newSettings: NinebotSettings = {
      authorization: (authorization ?? "").trim(),
      deviceId: (deviceId ?? "").trim(),
      userAgent: (userAgent ?? "").trim() || defaultSettings.userAgent,
      enableBoxJs: !!enableBoxJs,
      boxJsUrl: (boxJsUrl ?? "").trim() || "https://boxjs.com",
      refreshInterval: Number(refreshInterval) || 15,
      titleDayColor: initial.titleDayColor,
      titleNightColor: initial.titleNightColor,
      descDayColor: initial.descDayColor,
      descNightColor: initial.descNightColor,
    }

    Storage.set(SETTINGS_KEY, newSettings)
    Storage.set("ninebot.authorization", newSettings.authorization)
    Storage.set("ninebot.deviceId", newSettings.deviceId)
    Storage.set("ninebot.userAgent", newSettings.userAgent)
    
    Dialog.alert({
      title: "保存成功",
      message: "配置已更新,小组件将使用新的设置",
      buttonLabel: "确定"
    }).then(dismiss)
  }

  // ==================== 从 BoxJS 同步 ====================
  const handleSyncFromBoxJs = async () => {
    if (!boxJsUrl) {
      await Dialog.alert({ 
        title: "参数缺失", 
        message: "请先填写 BoxJs 地址", 
        buttonLabel: "确定" 
      })
      return
    }
    
    setSyncing(true)
    
    try {
      const result = await syncAuthFromBoxJs(boxJsUrl)
      setSyncing(false)
      
      if (result.success) {
        setAuthorization(result.authorization)
        setDeviceId(result.deviceId)
        
        await Dialog.alert({
          title: "✅ 同步成功",
          message: `${result.message}\n\n已自动填充到下方输入框\n请点击右上角"完成"按钮保存配置`,
          buttonLabel: "确定"
        })
      } else {
        await Dialog.alert({
          title: "❌ 同步失败",
          message: result.message,
          buttonLabel: "确定"
        })
      }
    } catch (error: any) {
      setSyncing(false)
      await Dialog.alert({
        title: "❌ 同步出错",
        message: `${error.message || "未知错误"}`,
        buttonLabel: "确定"
      })
    }
  }

  // ==================== 一键清除功能 ====================
  const clearAuth = () => {
    setAuthorization("")
    Storage.remove("ninebot.authorization")
    Dialog.alert({ title: "清除成功", message: "Authorization 已清除", buttonLabel: "确定" })
  }

  const clearDeviceId = () => {
    setDeviceId("")
    Storage.remove("ninebot.deviceId")
    Dialog.alert({ title: "清除成功", message: "DeviceId 已清除", buttonLabel: "确定" })
  }

  // ==================== 打开关于页面 ====================
  const handleAbout = async () => {
    await Navigation.present({
      element: <AboutView />,
      modalPresentationStyle: "pageSheet"
    })
  }

  // ==================== 打开 BoxJS 订阅 ====================
  const openBoxJsSubscription = async () => {
    try {
      await Safari.openURL(NINEBOT_BOXJS_SUB_URL)
    } catch (error) {
      try {
        await Pasteboard.setString(NINEBOT_BOXJS_JSON_URL)
        await Dialog.alert({
          title: "已复制链接",
          message: `BoxJS 配置链接已复制到剪贴板：\n\n${NINEBOT_BOXJS_JSON_URL}\n\n请在 BoxJS 中手动添加订阅。`,
          buttonLabel: "知道了",
        })
      } catch {
        await Dialog.alert({
          title: "打开失败",
          message: `无法打开 BoxJS 订阅页面\n\n链接：${NINEBOT_BOXJS_JSON_URL}`,
          buttonLabel: "确定",
        })
      }
    }
  }

  // ==================== 安装 Loon 插件 ====================
  const installLoonPlugin = async () => {
    try {
      await Safari.openURL(NINEBOT_LOON_INSTALL_URL)
    } catch (error) {
      try {
        await Pasteboard.setString(NINEBOT_LOON_PLUGIN_URL)
        await Dialog.alert({
          title: "已复制链接",
          message: `Loon 插件链接已复制到剪贴板：\n\n${NINEBOT_LOON_PLUGIN_URL}\n\n请在 Loon 中手动添加插件。`,
          buttonLabel: "知道了",
        })
      } catch {
        await Dialog.alert({
          title: "跳转失败",
          message: `无法打开 Loon 应用。\n\n插件链接：\n\n${NINEBOT_LOON_PLUGIN_URL}`,
          buttonLabel: "确定",
        })
      }
    }
  }

  // ==================== 测试功能 ====================
  const handleTestApi = async () => {
    if (!authorization || !deviceId) {
      await Dialog.alert({ title: "参数缺失", message: "请先填写 Authorization 和 DeviceId", buttonLabel: "确定" })
      return
    }
    setTesting(true)
    const result = await testApiConnection(authorization, deviceId, userAgent)
    setTesting(false)
    await Dialog.alert({
      title: result.success ? "测试成功" : "测试失败",
      message: result.message,
      buttonLabel: "确定"
    })
  }

  const handleTestBoxJs = async () => {
    if (!enableBoxJs) return
    setTesting(true)
    const result = await testBoxJsConnection(boxJsUrl)
    setTesting(false)
    await Dialog.alert({
      title: result.success ? "连接成功" : "连接失败",
      message: result.message,
      buttonLabel: "确定"
    })
  }

  // ==================== UI ====================
  return (
    <NavigationStack>
      <List
        navigationTitle={"九号电动车助手"}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title="关闭" action={dismiss} />],
          topBarTrailing: [
            <Button
              title={fullscreenPref ? "页面" : "弹层"}
              systemImage={fullscreenPref ? "rectangle.arrowtriangle.2.outward" : "rectangle"}
              action={toggleFullscreen}
            />,
            <Button title="完成" action={handleSave} />,
          ],
          bottomBar: [
            <Button 
              systemImage="info.circle.fill" 
              title="关于" 
              action={handleAbout} 
              foregroundStyle="#1E90FF"
            />
          ],
        }}
      >
        {/* 模块安装 */}
        <Section 
          header={<Text font="body" fontWeight="semibold">📦 模块安装</Text>}
          footer={
            <VStack alignment="center" spacing={4} padding={{ vertical: 8 }}>
              <Text font="footnote" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
                使用前建议按顺序完成：
              </Text>
              <Text font="footnote" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
                1）在 BoxJS 中订阅配置（可同步鉴权信息）
              </Text>
              <Text font="footnote" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
                2）安装九号签到插件到 Loon 等客户端
              </Text>
            </VStack>
          }
        >
          <Button
            title="订阅 BoxJS 配置"
            systemImage="shippingbox"
            action={openBoxJsSubscription}
          />
          <Button
            title="安装 Loon 插件"
            systemImage="puzzlepiece.extension"
            action={installLoonPlugin}
          />
        </Section>

        {/* BoxJs 配置 */}
        <Section header={<Text font="body" fontWeight="semibold">🔗 BoxJs 配置</Text>}>
          <Toggle
            title="启用 BoxJs 读取鉴权"
            value={enableBoxJs}
            onChanged={(value) => {
              setEnableBoxJs(value)
              if (value && !boxJsUrl) setBoxJsUrl("https://boxjs.com")
            }}
          />
          {enableBoxJs ? (
            <>
              <HStack spacing={8} padding={{ vertical: 4 }}>
                <TextField 
                  title="BoxJs 地址" 
                  value={boxJsUrl} 
                  onChanged={setBoxJsUrl}
                  prompt="例如: https://boxjs.com"
                  frame={{ maxWidth: 'infinity' }}
                />
                <Button 
                  title="测试" 
                  systemImage="wifi" 
                  action={handleTestBoxJs}
                  padding={{ horizontal: 8 }}
                />
              </HStack>
              <Text font="caption2" foregroundStyle="secondaryLabel">
                点击右侧按钮可测试 BoxJs 连接状态
              </Text>
              
              {/* 新增：从 BoxJS 同步按钮 */}
              <Button
                title={syncing ? "同步中..." : "📥 从 BoxJS 同步鉴权信息"}
                systemImage="arrow.triangle.2.circlepath"
                action={handleSyncFromBoxJs}
                disabled={syncing}
              />
              <Text font="caption2" foregroundStyle="secondaryLabel">
                点击此按钮可自动从 BoxJS 拉取并填充鉴权信息
              </Text>
            </>
          ) : null}
        </Section>

        {/* 鉴权信息 */}
        <Section 
          header={<Text font="body" fontWeight="semibold">🔑 鉴权信息</Text>}
          footer={
            <>
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {enableBoxJs 
                  ? "可使用上方同步按钮自动填充，或手动填写" 
                  : "请先运行签到脚本抓包获取 Authorization 和 Device ID"}
              </Text>
              {deviceId && !validateDeviceId(deviceId) ? (
                <Text font="caption2" foregroundStyle="red">
                  ⚠️ DeviceId 格式错误，应为 UUID 格式
                </Text>
              ) : null}
            </>
          }
        >
          {/* Authorization 字段 */}
          <HStack spacing={4} padding={{ vertical: 4 }}>
            <TextField
              title="Authorization 鉴权Token"
              value={authorization}
              prompt="直接粘贴抓包获取的令牌（无需 Bearer 前缀）"
              onChanged={setAuthorization}
              frame={{ maxWidth: 'infinity' }}
            />
            <Button 
              title="清除" 
              systemImage="trash" 
              action={clearAuth}
              padding={{ horizontal: 4 }}
            />
          </HStack>

          {/* DeviceId 字段 */}
          <HStack spacing={4} padding={{ vertical: 4 }}>
            <TextField
              title="DeviceId 设备标识"
              value={deviceId}
              prompt="例如: 06965B02-DE89-45AB-9116-9B69923BFxxx"
              onChanged={setDeviceId}
              frame={{ maxWidth: 'infinity' }}
            />
            <Button 
              title="清除" 
              systemImage="trash" 
              action={clearDeviceId}
              padding={{ horizontal: 4 }}
            />
          </HStack>

          {/* User-Agent 字段 */}
          <TextField
            title="User-Agent 请求头"
            value={userAgent}
            prompt="留空使用默认值"
            onChanged={setUserAgent}
          />

          <Button
            title={testing ? "测试中..." : "测试 API 连接"}
            systemImage="network"
            action={handleTestApi}
            disabled={testing}
          />
        </Section>

        {/* 小组件配置 */}
        <Section 
          header={<Text font="body" fontWeight="semibold">⚙️ 小组件配置</Text>}
          footer={
            <Text font="footnote" foregroundStyle="secondaryLabel">
              刷新间隔：小组件自动刷新的时间间隔（分钟），建议不小于15分钟
            </Text>
          }
        >
          <HStack spacing={8} padding={{ vertical: 4 }} alignment="center">
            <TextField
              title="刷新间隔（分钟）"
              value={String(refreshInterval)}
              onChanged={(v) => setRefreshInterval(Number(v) || 15)}
              keyboardType="numberPad"
              frame={{ maxWidth: 'infinity' }}
            />
            <Text font="caption2" foregroundStyle="secondaryLabel">
              当前：{refreshInterval} 分钟
            </Text>
          </HStack>
        </Section>

        {/* 版本信息 */}
        <Section>
          <VStack alignment="center" spacing={4} padding={12}>
            <Text font="caption2" foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              v{VERSION} · {BUILD_DATE}
            </Text>
            <Text font="caption2" foregroundStyle="tertiaryLabel" multilineTextAlignment="center">
              适配 iOS 17+
            </Text>
          </VStack>
        </Section>

      </List>
    </NavigationStack>
  )
}

// ==================== App / Run ====================
type AppProps = { interactiveDismissDisabled?: boolean }
function App(_props: AppProps) {
  return <SettingsView />
}

function readFullscreenPrefForRun(): boolean {
  try {
    const v = Storage.get(FULLSCREEN_KEY)
    if (typeof v === "boolean") return v
  } catch { }
  return true
}

async function run() {
  const fullscreen = readFullscreenPrefForRun()
  await Navigation.present({
    element: <App interactiveDismissDisabled />,
    ...(fullscreen ? { modalPresentationStyle: "fullScreen" } : {}),
  })
  Script.exit()
}

run()