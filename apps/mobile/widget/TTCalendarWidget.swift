// TT 日历 · 主屏小组件（WidgetKit extension）。
//
// 数据来源：主 App 通过 Tauri command 把当日概览 JSON 写进 App Group 容器
// （group.com.tt.calendar.mobile/widget-snapshot.json），本进程只读该文件，
// 不访问网络、不访问主 App 沙盒。
//
// 一键打卡（20260921）：iOS 17+ 的 AppIntent 按钮把动作追加到
// widget-actions.json，并对快照做乐观更新后 reload 时间线；主 App 在启动 /
// 回前台 / 周期刷新时消费该队列落到真库（见 widget-bridge.ts 的
// consumeWidgetActions）。iOS 15/16 无交互 API，卡片点击回到主 App。
//
// 刷新时序（如实说明，别把注释写成承诺）：
//   · 文件侧：App 在前台时每 15 分钟、以及回前台/同步完成时重写快照；
//   · 界面侧：时间线请求 15 分钟后重载，但最终由 iOS 调度（可延后）。

import WidgetKit
import SwiftUI
import AppIntents

private let appGroupID = "group.com.tt.calendar.mobile"
private let snapshotFileName = "widget-snapshot.json"
private let actionsFileName = "widget-actions.json"

// 全部字段可空 + Codable：既能容错读取主 App 写的快照，也能在打卡的
// 乐观更新里改完再原样编码回去（键名与 TS 侧一致，禁止私改）。
struct WSnapshot: Codable {
    var generatedAt: String?
    var today: String?
    /// 主 App 当前语言（BCP-47：zh-CN/zh-Hant/en/ja/ko/fr/es/ru，20260930 i18n）
    var lang: String?
    var todos: [WTodo]?
    var events: [WEvent]?
    var countdowns: [WCountdown]?
    var coloring: [WColoring]?
    var stats: WStats?
    var habits: [WHabit]?
    var streak: Int?
    var heatmap: [WDayCount]?
    var week: [WDayCount]?
}

struct WTodo: Codable {
    var title: String
    var overdue: Bool?
}

struct WEvent: Codable {
    var title: String
    var time: String?
}

struct WCountdown: Codable {
    var name: String
    var daysLeft: Int?
    var date: String?
}

struct WColoring: Codable {
    var date: String
    var level: Int?
}

struct WStats: Codable {
    var total: Int?
    var completed: Int?
    var incomplete: Int?
}

struct WHabit: Codable {
    var id: String
    var title: String
    var done: Bool
}

struct WDayCount: Codable {
    var date: String
    var count: Int
}

func groupContainerURL() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
}

// ── L10n：小组件文案（20260930 本地化任务书，智者定稿方案）─────────────────────
// 与主 App 的语言保持一致：主 App 把 lang 写进快照 JSON，这里读快照选表。
// 不用 Localizable.strings/lproj（NSLocalizedString 跟随系统语言，与「跟随
// App 内选择」相悖，且 patch 脚本要生成 PBXVariantGroup 易碎）；纯源码字典
// 编译期可查、CI 的 iOS 构建就是编译门禁。
//
// key 命名与主 App 字典同名同义（widget.todayOverview 等）；en 与 JS 字典的
// en 一致；其余语言由翻译阶段同步补入（缺语言回落 zh-CN 表）。
enum L10n {
    static let tables: [String: [String: String]] = [
        "zh-CN": [
            "todayOverview": "今日概览",
            "todayOverviewDesc": "今天的日程与待办一览",
            "countdown": "倒数日",
            "countdownDesc": "最近的三个倒数日",
            "monthDone": "本月完成",
            "monthDoneDesc": "当月待办完成热力图",
            "heatmapTitle": "完成热力 · 近 13 周",
            "heatmapDesc": "近 13 周每日完成热力图，GitHub 风格",
            "streakDays": "连续 {n} 天",
            "less": "少",
            "more": "多",
            "statsTitle": "完成概览",
            "statsDesc": "待办完成率与连续打卡",
            "statsMediumTitle": "完成统计",
            "statsMediumDesc": "完成率 + 连续打卡 + 近 7 天走势",
            "doneOfTotal": "已完成 {done} / 共 {total} 项",
            "habitTitle": "今日打卡",
            "habitDesc": "重复待办清单，iOS 17+ 可直接点勾完成",
            "habitEmpty": "暂无重复待办，去建一条每日打卡吧",
            "quickTitle": "一键打卡",
            "quickDesc": "一项点击完成今日打卡（iOS 17+）",
            "quickRemaining": "还剩 {n} 项",
            "quickCheckLabel": "打卡",
            "quickLongPressHint": "长按小组件打开 App 打卡",
            "allDoneToday": "今日打卡全部完成 🎉",
            "openAppToSync": "打开 App 同步数据",
            "noData": "暂无数据",
            "freeDay": "今天没有安排 🎉",
            "overdue": "逾期",
            "today": "今天",
            "daysLeft": "{n}天",
            "intentDone": "「{title}」已打卡 ✓",
        ],
        "en": [
            "todayOverview": "Today at a glance",
            "todayOverviewDesc": "Today's events and to-dos",
            "countdown": "Countdowns",
            "countdownDesc": "Your three nearest countdowns",
            "monthDone": "Done this month",
            "monthDoneDesc": "Monthly to-do completion heatmap",
            "heatmapTitle": "Completion heatmap · last 13 weeks",
            "heatmapDesc": "Daily completion heatmap for the last 13 weeks, GitHub style",
            "streakDays": "{n}-day streak",
            "less": "Less",
            "more": "More",
            "statsTitle": "Completion overview",
            "statsDesc": "To-do completion rate and streak",
            "statsMediumTitle": "Completion stats",
            "statsMediumDesc": "Completion rate + streak + last 7 days",
            "doneOfTotal": "{done} of {total} done",
            "habitTitle": "Today's check-ins",
            "habitDesc": "Recurring to-dos; tap to check off on iOS 17+",
            "habitEmpty": "No recurring to-dos yet — create one to check in daily",
            "quickTitle": "Quick check-in",
            "quickDesc": "Tap to complete today's check-in (iOS 17+)",
            "quickRemaining": "{n} left",
            "quickCheckLabel": "Check in",
            "quickLongPressHint": "Long-press the widget to open the app",
            "allDoneToday": "All check-ins done today 🎉",
            "openAppToSync": "Open the app to sync data",
            "noData": "No data yet",
            "freeDay": "Nothing scheduled today 🎉",
            "overdue": "Overdue",
            "today": "Today",
            "daysLeft_one": "1 day",
            "daysLeft_other": "{n} days",
            "intentDone": "\"{title}\" checked off ✓",
        ],
        "ko": [
            "todayOverview": "오늘의 요약",
            "todayOverviewDesc": "오늘의 일정과 할 일",
            "countdown": "카운트다운",
            "countdownDesc": "가까운 카운트다운 3개",
            "monthDone": "이번 달 완료",
            "monthDoneDesc": "이번 달 할 일 완료 히트맵",
            "heatmapTitle": "완료 히트맵 · 최근 13주",
            "heatmapDesc": "최근 13주 일일 완료 히트맵(GitHub 스타일)",
            "streakDays": "연속 {n}일",
            "less": "적음",
            "more": "많음",
            "statsTitle": "완료 개요",
            "statsDesc": "할 일 완료율과 연속 체크인",
            "statsMediumTitle": "완료 통계",
            "statsMediumDesc": "완료율 + 연속 체크인 + 최근 7일 추이",
            "doneOfTotal": "{total}개 중 {done}개 완료",
            "habitTitle": "오늘의 체크인",
            "habitDesc": "반복 할 일 목록, iOS 17+에서 탭하여 완료",
            "habitEmpty": "반복 할 일이 없습니다. 매일 체크인을 만들어 보세요",
            "quickTitle": "원터치 체크인",
            "quickDesc": "탭 한 번으로 오늘의 체크인 완료(iOS 17+)",
            "quickRemaining": "{n}개 남음",
            "quickCheckLabel": "체크인",
            "quickLongPressHint": "위젯을 길게 눌러 앱을 열어 체크인하세요",
            "allDoneToday": "오늘의 체크인을 모두 완료했어요 🎉",
            "openAppToSync": "앱을 열어 데이터를 동기화하세요",
            "noData": "데이터 없음",
            "freeDay": "오늘은 일정이 없어요 🎉",
            "overdue": "지연",
            "today": "오늘",
            "daysLeft": "{n}일",
            "intentDone": "\"{title}\" 체크인 완료 ✓",
        ],
        "zh-Hant": [
            "todayOverview": "今日摘要",
            "todayOverviewDesc": "今日的行程與待辦",
            "countdown": "倒數日",
            "countdownDesc": "最近的三個倒數日",
            "monthDone": "本月完成",
            "monthDoneDesc": "當月待辦完成熱力圖",
            "heatmapTitle": "完成熱力 · 近 13 週",
            "heatmapDesc": "近 13 週每日完成熱力圖，GitHub 風格",
            "streakDays": "連續 {n} 天",
            "less": "少",
            "more": "多",
            "statsTitle": "完成概覽",
            "statsDesc": "待辦完成率與連續打卡",
            "statsMediumTitle": "完成統計",
            "statsMediumDesc": "完成率 + 連續打卡 + 近 7 天走勢",
            "doneOfTotal": "已完成 {done} / 共 {total} 項",
            "habitTitle": "今日打卡",
            "habitDesc": "重複待辦清單，iOS 17+ 可直接點選完成",
            "habitEmpty": "暫無重複待辦，去建立一條每日打卡吧",
            "quickTitle": "一鍵打卡",
            "quickDesc": "一項點擊完成今日打卡（iOS 17+）",
            "quickRemaining": "還剩 {n} 項",
            "quickCheckLabel": "打卡",
            "quickLongPressHint": "長按小工具開啟 App 打卡",
            "allDoneToday": "今日打卡全部完成 🎉",
            "openAppToSync": "開啟 App 同步資料",
            "noData": "暫無資料",
            "freeDay": "今天沒有安排 🎉",
            "overdue": "逾期",
            "today": "今天",
            "daysLeft": "{n}天",
            "intentDone": "「{title}」已打卡 ✓",
        ],
        "fr": [
            "todayOverview": "Aujourd'hui en bref",
            "todayOverviewDesc": "Événements et tâches du jour",
            "countdown": "Comptes à rebours",
            "countdownDesc": "Vos trois comptes à rebours les plus proches",
            "monthDone": "Accompli ce mois",
            "monthDoneDesc": "Heatmap mensuelle des tâches terminées",
            "heatmapTitle": "Heatmap · 13 dernières semaines",
            "heatmapDesc": "Heatmap quotidienne des 13 dernières semaines, style GitHub",
            "streakDays": "Série de {n} jours",
            "less": "Moins",
            "more": "Plus",
            "statsTitle": "Vue d'ensemble",
            "statsDesc": "Taux de complétion et série",
            "statsMediumTitle": "Statistiques",
            "statsMediumDesc": "Taux + série + 7 derniers jours",
            "doneOfTotal": "{done} sur {total} terminés",
            "habitTitle": "Check-ins du jour",
            "habitDesc": "Tâches récurrentes ; touchez pour cocher (iOS 17+)",
            "habitEmpty": "Aucune tâche récurrente — créez-en une pour pointer chaque jour",
            "quickTitle": "Check-in rapide",
            "quickDesc": "Touchez pour valider le check-in du jour (iOS 17+)",
            "quickRemaining": "{n} restants",
            "quickCheckLabel": "Pointer",
            "quickLongPressHint": "Appuyez longuement sur le widget pour ouvrir l'app",
            "allDoneToday": "Tous les check-ins sont faits 🎉",
            "openAppToSync": "Ouvrez l'app pour synchroniser les données",
            "noData": "Aucune donnée",
            "freeDay": "Rien de prévu aujourd'hui 🎉",
            "overdue": "En retard",
            "today": "Aujourd'hui",
            "daysLeft_one": "1 jour",
            "daysLeft_many": "{n} jours",
            "daysLeft_other": "{n} jours",
            "intentDone": "« {title} » pointé ✓",
        ],
        "ja": [
            "todayOverview": "今日のまとめ",
            "todayOverviewDesc": "今日の予定とToDo",
            "countdown": "カウントダウン",
            "countdownDesc": "直近の3つのカウントダウン",
            "monthDone": "今月の完了",
            "monthDoneDesc": "当月のToDo完了ヒートマップ",
            "heatmapTitle": "完了ヒートマップ · 直近13週",
            "heatmapDesc": "直近13週の日別完了ヒートマップ、GitHub風",
            "streakDays": "{n}日連続",
            "less": "少ない",
            "more": "多い",
            "statsTitle": "完了サマリー",
            "statsDesc": "ToDoの完了率と連続記録",
            "statsMediumTitle": "完了統計",
            "statsMediumDesc": "完了率 + 連続記録 + 直近7日の推移",
            "doneOfTotal": "{total}件中 {done}件が完了",
            "habitTitle": "今日のチェックイン",
            "habitDesc": "繰り返しToDo。iOS 17+ はタップで完了",
            "habitEmpty": "繰り返しToDoはまだありません。毎日のチェックインを作成しましょう",
            "quickTitle": "ワンタップチェックイン",
            "quickDesc": "タップで今日のチェックインを完了（iOS 17+）",
            "quickRemaining": "残り{n}件",
            "quickCheckLabel": "チェックイン",
            "quickLongPressHint": "ウィジェットを長押ししてアプリでチェックイン",
            "allDoneToday": "今日のチェックインはすべて完了 🎉",
            "openAppToSync": "アプリを開いてデータを同期",
            "noData": "データがまだありません",
            "freeDay": "今日の予定はありません 🎉",
            "overdue": "期限切れ",
            "today": "今日",
            "daysLeft": "{n}日",
            "intentDone": "「{title}」をチェックインしました ✓",
        ],
    ]

    /// 当前语言（读快照缓存；主 App 未写过/解析失败回落 zh-CN）
    static func currentLang(_ snap: WSnapshot?) -> String {
        let lang = snap?.lang ?? cachedLang
        return tables[lang] != nil ? lang : "zh-CN"
    }

    static var cachedLang: String = "zh-CN"

    /// 取文案：{n}/{done}/{total}/{title} 具名插值；缺 key 回落 zh-CN，再缺显示 key
    static func tr(_ lang: String, _ key: String, _ params: [String: String] = [:]) -> String {
        var text = tables[lang]?[key] ?? tables["zh-CN"]?[key] ?? key
        for (name, value) in params {
            text = text.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return text
    }

    /// 复数取文案：表里查 "<key>_<类别>"，再 "<key>_other"，再裸 "<key>"（zh 无类别形态），
    /// 最后回落 zh-CN 表。类别由 pluralCategory 决定（与 JS 侧 Intl.PluralRules 对齐）。
    static func trPlural(_ lang: String, _ key: String, _ n: Int) -> String {
        let cat = pluralCategory(lang, n)
        let params = ["n": String(n)]
        if let text = tables[lang]?["\(key)_\(cat)"] { return interp(text, params) }
        if let text = tables[lang]?["\(key)_other"] { return interp(text, params) }
        if let text = tables[lang]?[key] { return interp(text, params) }
        let fallback = tables["zh-CN"]?["\(key)_other"] ?? tables["zh-CN"]?[key] ?? key
        return interp(fallback, params)
    }

    private static func interp(_ text: String, _ params: [String: String]) -> String {
        var out = text
        for (name, value) in params {
            out = out.replacingOccurrences(of: "{\(name)}", with: value)
        }
        return out
    }

    /// 整数复数类别：只覆盖本产品 8 种语言的基数规则（fr 的 many 仅 ≥1e6，小组件不出现）。
    static func pluralCategory(_ lang: String, _ n: Int) -> String {
        switch lang {
        case "zh-CN", "zh-Hant", "ja", "ko":
            return "other"
        case "en":
            return n == 1 ? "one" : "other"
        case "fr":
            return n <= 1 ? "one" : "other" // fr 0/1 → one
        case "es":
            return n == 1 ? "one" : "other" // es 仅 1 → one（0 是 other，CLDR——智者终审 C 修正）
        case "ru":
            let m10 = n % 10, m100 = n % 100
            if m10 == 1 && m100 != 11 { return "one" }
            if (2...4).contains(m10) && !(12...14).contains(m100) { return "few" }
            return "many"
        default:
            return "other"
        }
    }
}

/// 语言 → Locale 标识（日期格式化用；未知语言回落 zh_CN）
private func localeID(for lang: String) -> String {
    switch lang {
    case "zh-CN": return "zh_CN"
    case "zh-Hant": return "zh_TW"
    case "en": return "en_US"
    case "ja": return "ja_JP"
    case "ko": return "ko_KR"
    case "fr": return "fr_FR"
    case "es": return "es_ES"
    case "ru": return "ru_RU"
    default: return "zh_CN"
    }
}

func loadSnapshot() -> WSnapshot? {
    guard let fileURL = groupContainerURL()?.appendingPathComponent(snapshotFileName),
          let data = try? Data(contentsOf: fileURL) else { return nil }
    return try? JSONDecoder().decode(WSnapshot.self, from: data)
}

func saveSnapshot(_ snap: WSnapshot) {
    guard let fileURL = groupContainerURL()?.appendingPathComponent(snapshotFileName),
          let data = try? JSONEncoder().encode(snap) else { return }
    // Data.write(.atomic) 自带「写临时文件 + 原子替换」，防读到半截 JSON
    try? data.write(to: fileURL, options: [.atomic])
}

/// 追加一条打卡动作到队列（主 App 消费时落到真库）；重复点击同一目标幂等。
func appendAction(kind: String, id: String) {
    guard let dir = groupContainerURL() else { return }
    let fileURL = dir.appendingPathComponent(actionsFileName)
    var actions: [[String: String]] = []
    if let data = try? Data(contentsOf: fileURL),
       let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
        actions = arr
    }
    // 幂等：同 kind+id 的未消费动作不重复追加
    if !actions.contains(where: { $0["kind"] == kind && $0["id"] == id }) {
        actions.append(["kind": kind, "id": id, "ts": ISO8601DateFormatter().string(from: Date())])
    }
    if let data = try? JSONSerialization.data(withJSONObject: actions) {
        try? data.write(to: fileURL)
    }
}

// ── 一键打卡的 AppIntent（iOS 17+ 小组件交互；AppIntents 框架要求 16+，
//    extension 部署目标 15.0，故整个类型标注可用性，使用处已有 17.0 守卫） ──

@available(iOSApplicationExtension 17.0, *)
struct CompleteHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "完成今日打卡"
    static var description: IntentDescription? = IntentDescription("把这一项今日打卡标记为已完成")

    @Parameter(title: "待办ID") var id: String
    @Parameter(title: "标题") var title: String

    init() {}

    init(id: String, title: String) {
        self.id = id
        self.title = title
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        appendAction(kind: "completeTodo", id: id)
        // 乐观更新：立刻改快照里的这一项，界面即时反馈
        if var snap = loadSnapshot(), var habits = snap.habits {
            for i in habits.indices where habits[i].id == id {
                habits[i].done = true
            }
            snap.habits = habits
            saveSnapshot(snap)
        }
        WidgetCenter.shared.reloadAllTimelines()
        // 打卡成功弹窗按主 App 语言（快照 lang）；缺 key 回落 zh-CN 表
        let lang = L10n.currentLang(loadSnapshot())
        return .result(dialog: IntentDialog(stringLiteral: L10n.tr(lang, "intentDone", ["title": title])))
    }
}

// ── 时间线（所有小组件共用同一份快照） ─────────────────────────────────

struct TodayEntry: TimelineEntry {
    let date: Date
    let snap: WSnapshot?
}

struct Provider: TimelineProvider {
    // 显式绑定关联类型：只用 placeholder 的返回类型不足以让编译器把 Entry
    // 解析出来（CI 实测报 "reference to invalid associated type 'Entry'"），
    // 且下面三个方法一律用具体类型 TodayEntry，不写裸 Entry。
    typealias Entry = TodayEntry

    func placeholder(in context: Context) -> TodayEntry {
        TodayEntry(date: Date(), snap: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        completion(TodayEntry(date: Date(), snap: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let entry = TodayEntry(date: Date(), snap: loadSnapshot())
        // 与文件侧刷新节奏对齐：请求 15 分钟后重载（实际由 iOS 调度，可延后）
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())
            ?? Date().addingTimeInterval(900)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

/// 语言感知的日期格式（"M月d日 EEEE" 的各语言形态）：
/// 用 ICU 模板让系统按 locale 决定字段顺序与文案，禁止手拼。
private func shortDate(_ d: Date, lang: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: localeID(for: lang))
    f.setLocalizedDateFormatFromTemplate("MdEEEE")
    return f.string(from: d)
}

func snapEmptyText(_ snap: WSnapshot?) -> String {
    let lang = L10n.currentLang(snap)
    return snap == nil ? L10n.tr(lang, "openAppToSync") : L10n.tr(lang, "noData")
}

/// iOS 17+ 交互按钮 / 旧系统的静态兜底，统一包一层
@ViewBuilder
func widgetBackground<V: View>(_ content: V) -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
        content.containerBackground(.fill.tertiary, for: .widget)
    } else {
        content
    }
}

// ── 今日概览小组件 ────────────────────────────────────────────────────

struct TodayWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let snap = entry.snap
        let lang = L10n.currentLang(snap)
        let todos = snap?.todos ?? []
        let events = snap?.events ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(shortDate(entry.date, lang: lang))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            if !events.isEmpty {
                ForEach(events.prefix(3).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Circle().fill(Color.pink).frame(width: 5, height: 5)
                        Text(events[i].title)
                            .font(.system(size: 12))
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let t = events[i].time, !t.isEmpty {
                            Text(t).font(.system(size: 10)).foregroundColor(.secondary)
                        }
                    }
                }
            }
            if !todos.isEmpty {
                ForEach(todos.prefix(events.isEmpty ? 4 : 2).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Circle().stroke(Color.gray.opacity(0.6), lineWidth: 1.2)
                            .frame(width: 8, height: 8)
                        Text(todos[i].title)
                            .font(.system(size: 12))
                            .lineLimit(1)
                        if todos[i].overdue == true {
                            Text(L10n.tr(lang, "overdue")).font(.system(size: 9)).foregroundColor(.red)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            if events.isEmpty && todos.isEmpty {
                Text(snap == nil ? L10n.tr(lang, "openAppToSync") : L10n.tr(lang, "freeDay"))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTTodayWidget", provider: Provider()) { entry in
            widgetBackground(TodayWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "todayOverview"))
        .description(L10n.tr(lang, "todayOverviewDesc"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 倒数日小组件 ──────────────────────────────────────────────────────

struct CountdownWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let snap = entry.snap
        let lang = L10n.currentLang(snap)
        let items = snap?.countdowns ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "hourglass")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(L10n.tr(lang, "countdown"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            if items.isEmpty {
                Text(snapEmptyText(snap))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else {
                ForEach(items.prefix(3).indices, id: \.self) { i in
                    HStack(spacing: 4) {
                        Text(items[i].name)
                            .font(.system(size: 12))
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        if let left = items[i].daysLeft {
                            // 天数文案按语言复数（en 1 day / 2 days；ru one/few/many）
                            Text(left == 0 ? L10n.tr(lang, "today") : L10n.trPlural(lang, "daysLeft", left))
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(left <= 7 ? .pink : .secondary)
                        }
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TTCCountdownWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTCountdownWidget", provider: Provider()) { entry in
            widgetBackground(CountdownWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "countdown"))
        .description(L10n.tr(lang, "countdownDesc"))
        .supportedFamilies([.systemSmall])
    }
}

// ── 本月完成热力（medium 自适应网格 / large 近 13 周 GitHub 风格） ─────

/// 与前端 TODO_BUSY_DONE_COLORS 一致的 5 档 GitHub 绿（20260917 任务书 1.2-5：
/// 已完成色阶统一为贡献图绿；充实度退出默认后热力口径切换为待办完成）
let coloringPalette = [
    Color(red: 0.922, green: 0.929, blue: 0.941),
    Color(red: 0.608, green: 0.914, blue: 0.659),
    Color(red: 0.251, green: 0.769, blue: 0.388),
    Color(red: 0.188, green: 0.631, blue: 0.306),
    Color(red: 0.129, green: 0.431, blue: 0.224),
]

struct ColoringWidgetView: View {
    var entry: TodayEntry

    /// 当月日期 → (日号, 档位)；没有涂色记录的日子不画点
    private func monthCells(_ snap: WSnapshot?) -> [(day: Int, level: Int)] {
        let list = snap?.coloring ?? []
        guard !list.isEmpty else { return [] }
        let dayPrefix = String((snap?.today ?? "").prefix(8)) // YYYY-MM-
        return list.compactMap { c in
            guard c.date.hasPrefix(dayPrefix), let level = c.level else { return nil }
            let dayNum = Int(c.date.suffix(2)) ?? Int(c.date.suffix(1)) ?? 0
            return dayNum > 0 ? (dayNum, max(0, min(4, level))) : nil
        }.sorted { $0.day < $1.day }
    }

    var body: some View {
        let lang = L10n.currentLang(entry.snap)
        let cells = monthCells(entry.snap)
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "paintpalette")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.green)
                Text(L10n.tr(lang, "monthDone"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            if cells.isEmpty {
                Text(snapEmptyText(entry.snap))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            } else {
                let cols = [GridItem(.adaptive(minimum: 14), spacing: 3)]
                LazyVGrid(columns: cols, alignment: .leading, spacing: 3) {
                    ForEach(cells, id: \.day) { cell in
                        RoundedRectangle(cornerRadius: 3)
                            .fill(coloringPalette[min(4, max(0, cell.level))])
                            .aspectRatio(1, contentMode: .fit)
                            .overlay(
                                Text("\(cell.day)")
                                    .font(.system(size: 8))
                                    .foregroundColor(cell.level >= 3 ? .white : .secondary)
                            )
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(6)
    }
}

struct TTCColoringWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTColoringWidget", provider: Provider()) { entry in
            widgetBackground(ColoringWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "monthDone"))
        .description(L10n.tr(lang, "monthDoneDesc"))
        .supportedFamilies([.systemMedium])
    }
}

// ── 完成热力 · 近 13 周（large，GitHub 贡献图风格） ────────────────────

struct HeatmapWidgetView: View {
    var entry: TodayEntry

    /// 91 天 → 13 列（周）× 7 行（周一..周日），空缺日画极浅底格
    private func weeks(_ snap: WSnapshot?) -> [[(date: String, count: Int)?]] {
        let counts = Dictionary(uniqueKeysWithValues: (snap?.heatmap ?? []).map { ($0.date, $0.count) })
        let today = snap?.today ?? ""
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        guard let endDate = f.date(from: today) else { return [] }
        let cal = Calendar(identifier: .gregorian)
        // 结束日所在周的周一
        let weekday = (cal.component(.weekday, from: endDate) + 5) % 7 // 周一=0
        let lastMonday = cal.date(byAdding: .day, value: -weekday, to: endDate) ?? endDate
        var cols: [[(String, Int)?]] = []
        for w in (0..<13).reversed() {
            var col: [(String, Int)?] = []
            for d in 0..<7 {
                guard let day = cal.date(byAdding: .day, value: -(w * 7 + d), to: lastMonday),
                      day <= endDate else {
                    col.append(nil)
                    continue
                }
                let key = f.string(from: day)
                col.append((key, counts[key] ?? 0))
            }
            cols.append(col)
        }
        return cols
    }

    private func levelColor(_ count: Int) -> Color {
        switch count {
        case 0: return Color(red: 0.922, green: 0.929, blue: 0.941)
        case 1: return Color(red: 0.608, green: 0.914, blue: 0.659)
        case 2...3: return Color(red: 0.251, green: 0.769, blue: 0.388)
        case 4...5: return Color(red: 0.188, green: 0.631, blue: 0.306)
        default: return Color(red: 0.129, green: 0.431, blue: 0.224)
        }
    }

    var body: some View {
        let lang = L10n.currentLang(entry.snap)
        let cols = weeks(entry.snap)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "square.grid.3x3.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.green)
                Text(L10n.tr(lang, "heatmapTitle"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                if let streak = entry.snap?.streak, streak > 0 {
                    Spacer(minLength: 0)
                    Image(systemName: "flame.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.orange)
                    Text(L10n.tr(lang, "streakDays", ["n": String(streak)]))
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(.orange)
                }
            }
            if cols.isEmpty {
                Text(snapEmptyText(entry.snap))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            } else {
                HStack(alignment: .top, spacing: 3) {
                    ForEach(cols.indices, id: \.self) { c in
                        VStack(spacing: 3) {
                            ForEach(cols[c].indices, id: \.self) { r in
                                if let cell = cols[c][r] {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(levelColor(cell.count))
                                        .aspectRatio(1, contentMode: .fit)
                                } else {
                                    Color.clear.aspectRatio(1, contentMode: .fit)
                                }
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 3) {
                    Spacer(minLength: 0)
                    Text(L10n.tr(lang, "less"))
                        .font(.system(size: 9)).foregroundColor(.secondary)
                    ForEach(coloringPalette.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1.5).fill(coloringPalette[i]).frame(width: 9, height: 9)
                    }
                    Text(L10n.tr(lang, "more"))
                        .font(.system(size: 9)).foregroundColor(.secondary)
                }
            }
        }
        .padding(6)
    }
}

struct TTCHeatmapWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTHeatmapWidget", provider: Provider()) { entry in
            widgetBackground(HeatmapWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "heatmapTitle"))
        .description(L10n.tr(lang, "heatmapDesc"))
        .supportedFamilies([.systemLarge])
    }
}

// ── 完成概览（small：完成率 + 连续天数 / medium：加近 7 天小柱图） ─────

struct StatsWidgetView: View {
    var entry: TodayEntry
    var medium: Bool = false

    var body: some View {
        let lang = L10n.currentLang(entry.snap)
        let stats = entry.snap?.stats
        let done = stats?.completed ?? 0
        let total = stats?.total ?? 0
        let rate = total == 0 ? 0.0 : Double(done) / Double(total)
        let streak = entry.snap?.streak ?? 0
        VStack(alignment: .leading, spacing: medium ? 6 : 4) {
            HStack(spacing: 4) {
                Image(systemName: "chart.pie.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(L10n.tr(lang, medium ? "statsMediumTitle" : "statsTitle"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                if streak > 0 {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.orange)
                    Text("\(streak)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.orange)
                }
            }
            Text("\(Int((rate * 100).rounded()))%")
                .font(.system(size: medium ? 30 : 26, weight: .bold))
                .foregroundColor(.pink)
            Text(L10n.tr(lang, "doneOfTotal", ["done": String(done), "total": String(total)]))
                .font(.system(size: 11))
                .foregroundColor(.secondary)
            if medium {
                let maxCount = max((entry.snap?.week ?? []).map(\.count).max() ?? 1, 1)
                HStack(alignment: .bottom, spacing: 4) {
                    ForEach((entry.snap?.week ?? []).indices, id: \.self) { i in
                        let c = entry.snap!.week![i].count
                        RoundedRectangle(cornerRadius: 2)
                            .fill(c > 0 ? Color.pink.opacity(0.35 + 0.65 * Double(c) / Double(maxCount)) : Color.gray.opacity(0.2))
                            .frame(height: CGFloat(8 + 22 * c / maxCount))
                    }
                }
                .frame(maxHeight: .infinity, alignment: .bottom)
            }
            if !medium { Spacer(minLength: 0) }
        }
        .padding(6)
    }
}

struct TTCStatsWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTStatsWidget", provider: Provider()) { entry in
            widgetBackground(StatsWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "statsTitle"))
        .description(L10n.tr(lang, "statsDesc"))
        .supportedFamilies([.systemSmall])
    }
}

struct TTCStatsMediumWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTStatsMediumWidget", provider: Provider()) { entry in
            widgetBackground(StatsWidgetView(entry: entry, medium: true))
        }
        .configurationDisplayName(L10n.tr(lang, "statsMediumTitle"))
        .description(L10n.tr(lang, "statsMediumDesc"))
        .supportedFamilies([.systemMedium])
    }
}

// ── 今日打卡（习惯列表 / 一键打卡，iOS 17+ 交互） ─────────────────────

/// 习惯行：iOS 17+ 为交互按钮（AppIntent 直写 App Group），旧系统为静态行
struct HabitRow: View {
    let habit: WHabit
    var interactive: Bool

    var body: some View {
        let content = HStack(spacing: 5) {
            Image(systemName: habit.done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 13))
                .foregroundColor(habit.done ? .green : .gray.opacity(0.6))
            Text(habit.title)
                .font(.system(size: 12))
                .strikethrough(habit.done)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        if interactive, !habit.done, #available(iOSApplicationExtension 17.0, *) {
            Button(intent: CompleteHabitIntent(id: habit.id, title: habit.title)) {
                content.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        } else {
            content
        }
    }
}

struct HabitWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let lang = L10n.currentLang(entry.snap)
        let habits = entry.snap?.habits ?? []
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(L10n.tr(lang, "habitTitle"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                let doneCount = habits.filter(\.done).count
                Text("\(doneCount)/\(habits.count)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            if habits.isEmpty {
                Text(entry.snap == nil ? L10n.tr(lang, "openAppToSync") : L10n.tr(lang, "habitEmpty"))
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            } else {
                ForEach(habits.prefix(5).indices, id: \.self) { i in
                    HabitRow(habit: habits[i], interactive: true)
                }
                Spacer(minLength: 0)
            }
        }
        .padding(6)
    }
}

struct TTCHabitWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTCHabitWidget", provider: Provider()) { entry in
            widgetBackground(HabitWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "habitTitle"))
        .description(L10n.tr(lang, "habitDesc"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// 一键打卡（small）：第一项未完成的打卡，大按钮一键完成
struct QuickCheckWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let lang = L10n.currentLang(entry.snap)
        let habits = (entry.snap?.habits ?? []).filter { !$0.done }
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "bolt.circle.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.orange)
                Text(L10n.tr(lang, "quickTitle"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                let remaining = habits.count
                if remaining > 1 {
                    Text(L10n.tr(lang, "quickRemaining", ["n": String(remaining)]))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                }
            }
            if let first = habits.first {
                if #available(iOSApplicationExtension 17.0, *) {
                    Button(intent: CompleteHabitIntent(id: first.id, title: first.title)) {
                        VStack(spacing: 4) {
                            Text(first.title)
                                .font(.system(size: 13, weight: .semibold))
                                .lineLimit(2)
                                .multilineTextAlignment(.center)
                            Label(L10n.tr(lang, "quickCheckLabel"), systemImage: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    .buttonStyle(.borderless)
                    .tint(.pink)
                } else {
                    Text(first.title)
                        .font(.system(size: 13, weight: .semibold))
                        .lineLimit(2)
                    Text(L10n.tr(lang, "quickLongPressHint"))
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                    Spacer(minLength: 0)
                }
            } else {
                Text(entry.snap == nil ? L10n.tr(lang, "openAppToSync") : L10n.tr(lang, "allDoneToday"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
        }
        .padding(6)
    }
}

struct TTCQuickCheckWidget: Widget {
    var body: some WidgetConfiguration {
        let lang = L10n.currentLang(loadSnapshot())
        L10n.cachedLang = lang
        return StaticConfiguration(kind: "TTCQuickCheckWidget", provider: Provider()) { entry in
            widgetBackground(QuickCheckWidgetView(entry: entry))
        }
        .configurationDisplayName(L10n.tr(lang, "quickTitle"))
        .description(L10n.tr(lang, "quickDesc"))
        .supportedFamilies([.systemSmall])
    }
}

@main
struct TTCalendarWidgets: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        TTCCountdownWidget()
        TTCColoringWidget()
        TTCStatsWidget()
        TTCStatsMediumWidget()
        TTCHeatmapWidget()
        TTCHabitWidget()
        TTCQuickCheckWidget()
    }
}
