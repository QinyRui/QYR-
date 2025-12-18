import { VStack, HStack, Text, Spacer, Divider, Widget, fetch, Image } from "scripting"
import { getNinebotInfo, type NinebotWidgetData } from './api'
import { getStorage, setStorage } from './utils/storage'
import { noticeOnce } from './utils/noticeOnce'

// 扩展数据接口，包含盲盒信息
interface ExtendedNinebotData extends NinebotWidgetData {
  blindBoxInfo: string
  waitingBoxDesc: string
  openBoxDesc: string
  minLeftDaysToOpenDisplay: string
  upgradeExp: number
}

// 默认数据
const defaultData: ExtendedNinebotData = {
  isSigned: false,
  nCoin: 0,
  experience: 0,
  level: 0,
  consecutiveDays: 0,
  signCardsNum: 0,
  blindBoxCount: 0,
  notOpenedBlindBoxCount: 0,
  openedBlindBoxCount: 0,
  minLeftDaysToOpen: null,
  blindBoxInfo: "暂无盲盒",
  waitingBoxDesc: "无待开启盲盒",
  openBoxDesc: "暂无已开盲盒",
  minLeftDaysToOpenDisplay: "无待开盲盒",
  upgradeExp: 0,
}

// 等级经验表
const levelExpTable: Record<number, number> = {
  1: 0, 2: 100, 3: 200, 4: 350, 5: 550, 6: 800, 7: 1100, 8: 1450, 9: 1850, 10: 2300,
  11: 2800, 12: 3350, 13: 3950, 14: 5000, 15: 6000, 16: 7000, 17: 8000, 18: 9000, 19: 10000, 20: 12000
}

// 计算距离升级所需经验
function calculateUpgradeExp(level: number, currentExp: number): number {
  const nextLevelExp = levelExpTable[level + 1] || (levelExpTable[level] || 0) + 1000
  return nextLevelExp - currentExp
}

// ================== BoxJs 读取鉴权 ==================
async function fetchAuthFromBoxJs(boxJsUrl: string): Promise<{authorization: string, deviceId: string} | null> {
  try {
    const base = boxJsUrl.replace(/\/$/, "")
    const authUrl = `${base}/query/data/ninebot.authorization`
    const deviceUrl = `${base}/query/data/ninebot.deviceId`
    console.log("📡 从 BoxJs 读取九号鉴权:", authUrl, deviceUrl)

    const [authRes, deviceRes] = await Promise.all([
      fetch(authUrl, {
        headers: { "Accept": "application/json" },
        timeout: 15000
      }),
      fetch(deviceUrl, {
        headers: { "Accept": "application/json" },
        timeout: 15000
      })
    ])

    if (!authRes.ok || !deviceRes.ok) throw new Error("字段读取失败")

    const authDataRaw: unknown = await authRes.json()
    const deviceDataRaw: unknown = await deviceRes.json()

    let authorization = ""
    if (typeof authDataRaw === 'object' && authDataRaw !== null && 'val' in authDataRaw && typeof (authDataRaw as { val: unknown }).val === 'string') {
      authorization = (authDataRaw as { val: string }).val
    }

    let deviceId = ""
    if (typeof deviceDataRaw === 'object' && deviceDataRaw !== null && 'val' in deviceDataRaw && typeof (deviceDataRaw as { val: unknown }).val === 'string') {
      deviceId = (deviceDataRaw as { val: string }).val
    }

    if (!authorization || !deviceId) {
      console.warn("⚠️ BoxJs 鉴权字段为空")
      return null
    }

    console.log("✅ BoxJs读取成功")
    return { authorization, deviceId }
  } catch (error) {
    console.error("🚨 BoxJs读取失败:", error)
    return null
  }
}

// ================== 获取小组件数据 ==================
async function fetchWidgetData(): Promise<ExtendedNinebotData> {
  try {
    console.log("开始获取小组件数据...")
    const settings = getStorage('ninebotSettings') || {}
    const enableBoxJs = !!settings.enableBoxJs
    const boxJsUrl = settings.boxJsUrl || "https://boxjs.com"
    
    let authorization: string = ""
    const storedAuth = getStorage("ninebot.authorization")
    if (typeof storedAuth === 'string' && storedAuth !== null) {
      authorization = storedAuth
    }

    let deviceId: string = ""
    const storedDeviceId = getStorage("ninebot.deviceId")
    if (typeof storedDeviceId === 'string' && storedDeviceId !== null) {
      deviceId = storedDeviceId
    }

    if (enableBoxJs && boxJsUrl) {
      const boxJsAuth = await fetchAuthFromBoxJs(boxJsUrl)
      if (boxJsAuth) {
        authorization = boxJsAuth.authorization
        deviceId = boxJsAuth.deviceId
        setStorage("ninebot.authorization", authorization)
        setStorage("ninebot.deviceId", deviceId)
        console.log("✅ 使用 BoxJs 鉴权信息")
      } else {
        console.warn("⚠️ BoxJs 读取失败，使用本地缓存/默认值")
      }
    }

    if (!authorization || !deviceId) {
      console.warn("⚠️ 鉴权信息缺失，使用本地缓存/默认值")
    }

    const finalAuthorization: string = String(authorization)
    const finalDeviceId: string = String(deviceId)

    const baseData = await getNinebotInfo(finalAuthorization, finalDeviceId)
    console.log("基础数据获取成功:", baseData)
    
    const upgradeExp = calculateUpgradeExp(baseData.level, baseData.experience)
    
    let blindBoxInfo: string
    let waitingBoxDesc: string
    let openBoxDesc: string
    let minLeftDaysToOpenDisplay: string
    
    if (baseData.notOpenedBlindBoxCount > 0) {
      if (baseData.minLeftDaysToOpen === 0) {
        blindBoxInfo = `可开${baseData.notOpenedBlindBoxCount}个`
        minLeftDaysToOpenDisplay = "可立即开启"
      } else if (baseData.minLeftDaysToOpen !== null) {
        blindBoxInfo = `需等待${baseData.minLeftDaysToOpen}天`
        minLeftDaysToOpenDisplay = `${baseData.minLeftDaysToOpen}天`
      } else {
        blindBoxInfo = "待开启"
        minLeftDaysToOpenDisplay = "待开启"
      }
      waitingBoxDesc = `${baseData.notOpenedBlindBoxCount}个待开`
    } else {
      blindBoxInfo = "无待开盲盒"
      waitingBoxDesc = "无待开"
      minLeftDaysToOpenDisplay = "无待开盲盒"
    }
    
    openBoxDesc = baseData.openedBlindBoxCount > 0 
      ? `已开${baseData.openedBlindBoxCount}个` 
      : "未开启"

    const extendedData: ExtendedNinebotData = {
      ...baseData,
      blindBoxInfo,
      waitingBoxDesc,
      openBoxDesc,
      minLeftDaysToOpenDisplay,
      upgradeExp,
    }
    
    console.log("完整数据:", extendedData)
    
    const hasNotified = getStorage('ninebot_notified') || false
    if (!hasNotified) {
      noticeOnce('九号小组件', '数据获取成功，已更新预览')
      setStorage('ninebot_notified', true)
    }
    
    setStorage('ninebotWidgetCache', extendedData)
    return extendedData
  } catch (error) {
    console.error("获取数据失败:", error)
    const cached = getStorage('ninebotWidgetCache') as ExtendedNinebotData | null
    if (cached) {
      console.log("使用缓存数据")
      noticeOnce('九号小组件', '数据获取失败,已展示缓存内容')
      return cached
    }
    noticeOnce('九号小组件', `数据获取失败: ${(error as Error).message}`)
    return defaultData
  }
}

/**
 * 小尺寸小组件
 */
function SmallWidgetView({ info }: { info: ExtendedNinebotData }) {
  return (
    <VStack
      padding={14}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      alignment={"center"}
      spacing={0}
    >
      {/* 顶部标题 */}
      <Text font={9} fontWeight={"bold"} foregroundStyle={"#FFFFFF"} lineLimit={1}>
        九号电动车
      </Text>
      
      <Spacer minLength={4} />
      
      {/* 签到图标 */}
      <VStack alignment={"center"} spacing={3}>
        <Text font={40}>
          {info.isSigned ? '✅' : '❌'}
        </Text>
        <Text
          font={10}
          fontWeight={"bold"}
          foregroundStyle={info.isSigned ? "#34C759" : "#FF3B30"}
        >
          {info.isSigned ? '已签到' : '未签到'}
        </Text>
      </VStack>
      
      {/* 连续签到天数 */}
      <Text font={9} fontWeight={"semibold"} foregroundStyle={"#FFFFFF"} lineLimit={1}>
        连续 {info.consecutiveDays} 天
      </Text>
      
      <Spacer minLength={6} />
      
      {/* 电动车图标 */}
      <Image
        systemName="scooter"
        font={28}
        fontWeight={"medium"}
        foregroundStyle={"#FFD60A"}
      />
      
      <Spacer minLength={3} />
      
      {/* 底部信息 */}
      <Text font={8.5} fontWeight={"semibold"} foregroundStyle={"#8E8E93"} lineLimit={1}>
        LV.{info.level} · {info.nCoin} N币
      </Text>
    </VStack>
  )
}

/**
 * 中尺寸小组件
 */
function MediumWidgetView({ info }: { info: ExtendedNinebotData }) {
  return (
    <HStack
      padding={14}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      spacing={10}
    >
      {/* 左侧：签到状态 */}
      <VStack
        frame={{ width: 110 }}
        alignment={"center"}
        spacing={4}
      >
        {/* 签到图标 */}
        <VStack alignment={"center"} spacing={3}>
          <Text font={28}>
            {info.isSigned ? '✅' : '❌'}
          </Text>
          <Text
            font={9}
            fontWeight={"bold"}
            foregroundStyle={info.isSigned ? "#34C759" : "#FF3B30"}
          >
            {info.isSigned ? '已签到' : '未签到'}
          </Text>
        </VStack>
        
        {/* 连续签到天数 */}
        <Text font={8.5} fontWeight={"semibold"} foregroundStyle={"#FFFFFF"} lineLimit={2} multilineTextAlignment={"center"}>
          连续签到：{info.consecutiveDays} 天
        </Text>
        
        <Spacer minLength={6} />
        
        {/* 电动车图标 */}
        <Image
          systemName="scooter"
          font={56}
          fontWeight={"medium"}
          foregroundStyle={"#FFD60A"}
        />
      </VStack>
      
      <Divider />
      
      {/* 右侧：账户状态和盲盒进度 */}
      <VStack
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        alignment={"leading"}
        spacing={0}
      >
        <Spacer />
        
        {/* 📊 账户状态 */}
        <VStack alignment={"leading"} spacing={3.5}>
          <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFFFFF"}>
            📊 账户状态
          </Text>
          
          <VStack alignment={"leading"} spacing={2.5}>
            <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
              • 当前经验：{info.experience}（LV.{info.level}）
            </Text>
            <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
              • 距离升级：{info.upgradeExp} 经验
            </Text>
            <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
              • 当前 N 币：{info.nCoin}
            </Text>
            <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
              • 补签卡：{info.signCardsNum} 张
            </Text>
          </VStack>
        </VStack>
        
        <Spacer minLength={8} />
        
        {/* 📦 盲盒进度 */}
        <VStack alignment={"leading"} spacing={3.5}>
          <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFFFFF"}>
            📦 盲盒进度
          </Text>
          
          <VStack alignment={"leading"} spacing={2.5}>
            <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
              • 待开盲盒：
            </Text>
            {info.notOpenedBlindBoxCount > 0 && info.minLeftDaysToOpen !== null ? (
              <VStack alignment={"leading"} spacing={2} padding={{ leading: 14 }}>
                <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
                  - 7天盲盒（剩余{Math.min(info.minLeftDaysToOpen, 7)}天）
                </Text>
                {info.notOpenedBlindBoxCount > 1 && (
                  <Text font={9.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"} lineLimit={1}>
                    - 666天盲盒（剩余{Math.max(info.minLeftDaysToOpen, 223)}天）
                  </Text>
                )}
              </VStack>
            ) : (
              <Text font={9.5} fontWeight={"medium"} foregroundStyle={"#8E8E93"} padding={{ leading: 14 }} lineLimit={1}>
                暂无待开盲盒
              </Text>
            )}
          </VStack>
        </VStack>
        
        <Spacer />
      </VStack>
    </HStack>
  )
}

/**
 * 大尺寸小组件
 */
function LargeWidgetView({ info }: { info: ExtendedNinebotData }) {
  return (
    <VStack
      padding={16}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      alignment={"leading"}
      spacing={0}
    >
      {/* 顶部横幅 */}
      <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
        {/* 左侧签到状态 */}
        <HStack spacing={8} alignment={"center"}>
          <Text font={36}>
            {info.isSigned ? '✅' : '❌'}
          </Text>
          <VStack alignment={"leading"} spacing={2}>
            <Text
              font={13}
              fontWeight={"bold"}
              foregroundStyle={info.isSigned ? "#34C759" : "#FF3B30"}
            >
              {info.isSigned ? '今日已签到' : '今日未签到'}
            </Text>
            <Text font={10} fontWeight={"semibold"} foregroundStyle={"#FFFFFF"}>
              连续签到 {info.consecutiveDays} 天
            </Text>
          </VStack>
        </HStack>
        
        <Spacer />
        
        {/* 右侧电动车图标 */}
        <Image
          systemName="scooter"
          font={64}
          fontWeight={"medium"}
          foregroundStyle={"#FFD60A"}
        />
      </HStack>
      
      <Spacer minLength={12} />
      
      <Divider />
      
      <Spacer minLength={12} />
      
      {/* 中部信息卡片 */}
      <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
        {/* 左侧账户状态 */}
        <VStack
          frame={{ maxWidth: "infinity" }}
          alignment={"leading"}
          spacing={5}
        >
          <Text font={13} fontWeight={"bold"} foregroundStyle={"#FFFFFF"}>
            📊 账户状态
          </Text>
          
          <VStack alignment={"leading"} spacing={3.5}>
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFD60A"}>
                等级
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                LV.{info.level}
              </Text>
            </HStack>
            
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFD60A"}>
                经验
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.experience}（距离升级还需 {info.upgradeExp}）
              </Text>
            </HStack>
            
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFD60A"}>
                N币
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.nCoin}
              </Text>
            </HStack>
            
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FFD60A"}>
                补签卡
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.signCardsNum} 张
              </Text>
            </HStack>
          </VStack>
        </VStack>
        
        {/* 右侧盲盒进度 */}
        <VStack
          frame={{ maxWidth: "infinity" }}
          alignment={"leading"}
          spacing={5}
        >
          <Text font={13} fontWeight={"bold"} foregroundStyle={"#FFFFFF"}>
            📦 盲盒进度
          </Text>
          
          <VStack alignment={"leading"} spacing={3.5}>
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FF9500"}>
                总盲盒
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.blindBoxCount} 个
              </Text>
            </HStack>
            
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FF9500"}>
                待开启
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.notOpenedBlindBoxCount} 个
              </Text>
            </HStack>
            
            <HStack spacing={6}>
              <Text font={11} fontWeight={"bold"} foregroundStyle={"#FF9500"}>
                已开启
              </Text>
              <Text font={11} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                {info.openedBlindBoxCount} 个
              </Text>
            </HStack>
            
            {info.notOpenedBlindBoxCount > 0 && info.minLeftDaysToOpen !== null && (
              <HStack spacing={6}>
                <Text font={11} fontWeight={"bold"} foregroundStyle={"#FF9500"}>
                  最快可开
                </Text>
                <Text font={11} fontWeight={"semibold"} foregroundStyle={"#34C759"}>
                  {info.minLeftDaysToOpen === 0 ? '立即可开' : `${info.minLeftDaysToOpen} 天后`}
                </Text>
              </HStack>
            )}
          </VStack>
        </VStack>
      </HStack>
      
      <Spacer />
      
      {/* 底部详细盲盒信息 */}
      {info.notOpenedBlindBoxCount > 0 && info.minLeftDaysToOpen !== null && (
        <>
          <Divider />
          
          <Spacer minLength={12} />
          
          <VStack alignment={"leading"} spacing={4}>
            <Text font={12} fontWeight={"bold"} foregroundStyle={"#FFFFFF"}>
              🎁 待开盲盒详情
            </Text>
            
            <VStack alignment={"leading"} spacing={3}>
              <HStack spacing={8}>
                <Text font={10.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                  • 7天盲盒
                </Text>
                <Text font={10.5} fontWeight={"medium"} foregroundStyle={"#8E8E93"}>
                  剩余 {Math.min(info.minLeftDaysToOpen, 7)} 天可开启
                </Text>
              </HStack>
              
              {info.notOpenedBlindBoxCount > 1 && (
                <HStack spacing={8}>
                  <Text font={10.5} fontWeight={"semibold"} foregroundStyle={"#E5E5E7"}>
                    • 666天盲盒
                  </Text>
                  <Text font={10.5} fontWeight={"medium"} foregroundStyle={"#8E8E93"}>
                    剩余 {Math.max(info.minLeftDaysToOpen, 223)} 天可开启
                  </Text>
                </HStack>
              )}
            </VStack>
          </VStack>
        </>
      )}
    </VStack>
  )
}

/**
 * 主函数
 */
(async function() {
  try {
    console.log("🚀 Widget 开始执行...")
    const info = await fetchWidgetData()
    const settings = getStorage('ninebotSettings')
    const refreshInterval = settings?.refreshInterval || 15
    
    console.log("📱 Widget Family:", Widget.family)
    console.log("🎨 准备渲染 Widget...")
    
    let widgetView
    if (Widget.family === "systemSmall") {
      widgetView = <SmallWidgetView info={info} />
    } else if (Widget.family === "systemMedium") {
      widgetView = <MediumWidgetView info={info} />
    } else {
      widgetView = <LargeWidgetView info={info} />
    }
    
    console.log("✅ Widget View 创建成功，开始 present...")
    
    Widget.present(widgetView, {
      policy: "after",
      date: new Date(Date.now() + 1000 * 60 * refreshInterval)
    })
    
    console.log("✅ Widget 执行完成")
  } catch (error) {
    console.error("❌ Widget 执行失败:", error)
    const errorView = (
      <VStack padding={16} frame={{ maxWidth: "infinity", maxHeight: "infinity" }} alignment={"center"} spacing={8}>
        <Text font={24}>⚠️</Text>
        <Text font={12} fontWeight={"bold"} foregroundStyle={"#FF3B30"}>Widget 加载失败</Text>
        <Text font={9} fontWeight={"medium"} foregroundStyle={"#8E8E93"}>{(error as Error).message}</Text>
      </VStack>
    )
    Widget.present(errorView)
  }
})()