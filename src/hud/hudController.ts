import {
  waitForEvenAppBridge,
  TextContainerProperty,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'
import type { NavRoute } from '../data/subwayGraph'
import type { ArrivalResult, TrainArrival } from '../services/subwayApi'
import { formatStationDisplay } from '../utils/stationName.ts'

const FOOTER_TEXT = '[탭] 다음정거장  [스크롤] 이전/다음역  [더블탭] 종료'

export function renderTrainDiagram(totalCars: number, targetCar: number): string {
  const cars: string[] = []
  for (let i = 1; i <= totalCars; i++) {
    cars.push(i === targetCar ? `[■${i}]` : `[${i}]`)
  }
  return cars.join('')
}

function truncateText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text
}

export function formatArrivalLine(prefix: string, a: TrainArrival): string {
  const dest = (a.trainLineNm.split(' - ')[0] || a.updnLine || '').trim()
  const statusTag = a.btrainSttus && a.btrainSttus !== '일반' ? `[${a.btrainSttus}] ` : ''
  const posTag = a.arvlMsg3 ? ` (${a.arvlMsg3})` : ''
  return truncateText(
    `${prefix}: ${statusTag}${dest ? `${dest} · ` : ''}${a.arvlMsg2}${posTag}`,
    40,
  )
}

export function formatTopBarText(
  route: NavRoute | null,
  stepIdx: number,
  latestArrival: ArrivalResult,
  fromStation = '',
  toStation = '',
): string {
  if (!route) {
    if (!fromStation && !toStation) {
      return '[대기 중] 출발역과 목적지를 설정해 주세요'
    }
    if (fromStation && !toStation) {
      return truncateText(`[출발: ${formatStationDisplay(fromStation)}] 도착역을 선택해 주세요`, 44)
    }
    if (!fromStation && toStation) {
      return truncateText(`[도착: ${formatStationDisplay(toStation)}] 출발역을 선택해 주세요`, 44)
    }
    return '[경로 확인] 출발역과 도착역이 같습니다'
  }
  const cur = route.steps[stepIdx]
  if (!cur) return `${route.fromName} → ${route.toName}`
  const remainText =
    cur.kind === 'arrive'
      ? '목적지 도착!'
      : `잔여 ${cur.remainingToGoal}역 (약 ${Math.max(1, cur.remainingToGoal * 2)}분)`
  const firstArrival = latestArrival.arrivals[0]
  const liveTag = firstArrival ? ` | ${firstArrival.arvlMsg2}` : ''
  return truncateText(`[${route.fromName}→${route.toName}] ${remainText}${liveTag}`, 44)
}

export function formatMainHudText(
  route: NavRoute | null,
  stepIdx: number,
  latestArrival: ArrivalResult,
  fromStation = '',
  toStation = '',
): string {
  if (!route) {
    if (!fromStation && !toStation) {
      return 'SubwayQuickExit 준비됨\n\n휴대폰 앱에서 출발역/목적지를 검색하거나\n즐겨찾기 경로를 선택하면 안내가 시작됩니다.'
    }
    if (fromStation && !toStation) {
      return `출발역: ${formatStationDisplay(fromStation)}\n\n휴대폰 앱에서 목적지를 선택하면\n최적 경로와 빠른하차 안내가 시작됩니다.`
    }
    if (!fromStation && toStation) {
      return `도착역: ${formatStationDisplay(toStation)}\n\n휴대폰 앱에서 출발역을 선택하면\n최적 경로와 빠른하차 안내가 시작됩니다.`
    }
    return '출발역과 도착역을 다르게 선택하면\n최적 경로와 빠른하차 문이 표시됩니다.'
  }
  const cur = route.steps[stepIdx]
  if (!cur) return '경로 정보 없음'

  const diagram = renderTrainDiagram(cur.totalCars, cur.car)
  const doorRole = cur.kind === 'board' || cur.kind === 'ride' ? '추천탑승' : '빠른하차'

  const lines = [
    truncateText(
      `현재: ${cur.actionTitle} · ${cur.direction} (${stepIdx + 1}/${route.steps.length})`,
      40,
    ),
    truncateText(`${doorRole}: [ ${cur.car} - ${cur.door} ] 번 문 -> ${cur.targetLabel}`, 40),
    `열차: ${diagram}`,
    truncateText(`안내: ${cur.note}`, 40),
  ]

  if (latestArrival.ok && latestArrival.arrivals.length > 0) {
    lines.push(formatArrivalLine('이번차', latestArrival.arrivals[0]))
    if (latestArrival.arrivals[1]) {
      lines.push(formatArrivalLine('다음차', latestArrival.arrivals[1]))
    }
  } else {
    lines.push(truncateText(`실시간: ${latestArrival.message}`, 40))
  }

  return lines.join('\n')
}

export interface HudSnapshot {
  fromStation: string
  toStation: string
  route: NavRoute | null
  stepIdx: number
  latestArrival: ArrivalResult
}

export interface HudCallbacks {
  getSnapshot: () => HudSnapshot
  onStepBy: (delta: 1 | -1) => void
  onShutdown: () => void
  onStatus: (kind: 'ok' | 'error', text: string) => void
}

export interface HudController {
  scheduleRender: () => void
}

function eventTypeOf(envelope?: { eventType?: OsEventTypeList }): OsEventTypeList | null {
  return envelope?.eventType ?? null
}

export async function initHudController(callbacks: HudCallbacks): Promise<HudController> {
  const bridge = await waitForEvenAppBridge()
  const initial = callbacks.getSnapshot()

  let lastTopText = formatTopBarText(
    initial.route,
    initial.stepIdx,
    initial.latestArrival,
    initial.fromStation,
    initial.toStation,
  )
  let lastMainText = formatMainHudText(
    initial.route,
    initial.stepIdx,
    initial.latestArrival,
    initial.fromStation,
    initial.toStation,
  )

  const topContainer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 36,
    borderWidth: 1,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'hud_top',
    content: lastTopText,
    isEventCapture: 0,
  })

  const mainContainer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 36,
    width: 576,
    height: 208,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 6,
    containerID: 2,
    containerName: 'hud_main',
    content: lastMainText,
    isEventCapture: 1,
  })

  const botContainer = new TextContainerProperty({
    xPosition: 0,
    yPosition: 244,
    width: 576,
    height: 44,
    borderWidth: 1,
    borderColor: 5,
    paddingLength: 4,
    containerID: 3,
    containerName: 'hud_bot',
    content: FOOTER_TEXT,
    isEventCapture: 0,
  })

  const pagePayload = {
    containerTotalNum: 3,
    textObject: [topContainer, mainContainer, botContainer],
  }

  const created = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(pagePayload))
  let hudOk = created === 0
  if (!hudOk) {
    hudOk = await bridge.rebuildPageContainer(new RebuildPageContainer(pagePayload)).catch(() => false)
  }

  if (hudOk) {
    callbacks.onStatus('ok', '안경 연결됨')
  } else {
    callbacks.onStatus('error', `HUD 초기화 실패(${created})`)
  }

  let renderTimer: number | null = null
  let isShutDown = false

  const scheduleRender = () => {
    if (isShutDown) return
    if (renderTimer !== null) {
      window.clearTimeout(renderTimer)
    }
    renderTimer = window.setTimeout(async () => {
      renderTimer = null
      if (isShutDown) return
      const snap = callbacks.getSnapshot()
      const nextTop = formatTopBarText(
        snap.route,
        snap.stepIdx,
        snap.latestArrival,
        snap.fromStation,
        snap.toStation,
      )
      const nextMain = formatMainHudText(
        snap.route,
        snap.stepIdx,
        snap.latestArrival,
        snap.fromStation,
        snap.toStation,
      )

      if (nextTop !== lastTopText) {
        lastTopText = nextTop
        await bridge
          .textContainerUpgrade(
            new TextContainerUpgrade({
              containerID: 1,
              containerName: 'hud_top',
              contentOffset: 0,
              content: nextTop,
            }),
          )
          .catch(() => false)
      }

      if (nextMain !== lastMainText) {
        lastMainText = nextMain
        await bridge
          .textContainerUpgrade(
            new TextContainerUpgrade({
              containerID: 2,
              containerName: 'hud_main',
              contentOffset: 0,
              content: nextMain,
            }),
          )
          .catch(() => false)
      }
    }, 80)
  }

  const shutdown = () => {
    if (isShutDown) return
    isShutDown = true
    if (renderTimer !== null) {
      window.clearTimeout(renderTimer)
      renderTimer = null
    }
    callbacks.onShutdown()
    unsubscribe()
    callbacks.onStatus('error', 'HUD 종료됨')
  }

  const unsubscribe = bridge.onEvenHubEvent(event => {
    const sysType = eventTypeOf(event.sysEvent)
    const textType = eventTypeOf(event.textEvent)
    const ev = sysType ?? textType
    if (ev === null) return

    if (ev === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      // exitMode=1 opens the confirmation dialog; actual cleanup happens on SYSTEM_EXIT_EVENT
      void bridge.shutDownPageContainer(1)
      return
    }

    if (ev === OsEventTypeList.CLICK_EVENT || ev === OsEventTypeList.SCROLL_TOP_EVENT) {
      callbacks.onStepBy(1)
      return
    }

    if (ev === OsEventTypeList.SCROLL_BOTTOM_EVENT) {
      callbacks.onStepBy(-1)
      return
    }

    if (ev === OsEventTypeList.SYSTEM_EXIT_EVENT || ev === OsEventTypeList.ABNORMAL_EXIT_EVENT) {
      shutdown()
    }
  })

  return { scheduleRender }
}