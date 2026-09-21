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
        return .result(dialog: IntentDialog(stringLiteral: "「\(title)」已打卡 ✓"))
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

private func shortDate(_ d: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    f.dateFormat = "M月d日 EEEE"
    return f.string(from: d)
}

func snapEmptyText(_ snap: WSnapshot?) -> String {
    snap == nil ? "打开 App 同步数据" : "暂无数据"
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
        let todos = snap?.todos ?? []
        let events = snap?.events ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text(shortDate(entry.date))
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
                            Text("逾期").font(.system(size: 9)).foregroundColor(.red)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
            if events.isEmpty && todos.isEmpty {
                Text(snap == nil ? "打开 App 同步数据" : "今天没有安排 🎉")
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
        StaticConfiguration(kind: "TTTodayWidget", provider: Provider()) { entry in
            widgetBackground(TodayWidgetView(entry: entry))
        }
        .configurationDisplayName("今日概览")
        .description("今天的日程与待办一览")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// ── 倒数日小组件 ──────────────────────────────────────────────────────

struct CountdownWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let items = entry.snap?.countdowns ?? []
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "hourglass")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text("倒数日")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }
            if items.isEmpty {
                Text(snapEmptyText(entry.snap))
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
                            Text(left == 0 ? "今天" : "\(left)天")
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
        StaticConfiguration(kind: "TTCountdownWidget", provider: Provider()) { entry in
            widgetBackground(CountdownWidgetView(entry: entry))
        }
        .configurationDisplayName("倒数日")
        .description("最近的三个倒数日")
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
        let cells = monthCells(entry.snap)
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "paintpalette")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.green)
                Text("本月完成")
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
        StaticConfiguration(kind: "TTColoringWidget", provider: Provider()) { entry in
            widgetBackground(ColoringWidgetView(entry: entry))
        }
        .configurationDisplayName("本月完成")
        .description("当月待办完成热力图")
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
        let cols = weeks(entry.snap)
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "square.grid.3x3.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.green)
                Text("完成热力 · 近 13 周")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                if let streak = entry.snap?.streak, streak > 0 {
                    Spacer(minLength: 0)
                    Image(systemName: "flame.fill")
                        .font(.system(size: 9))
                        .foregroundColor(.orange)
                    Text("连续 \(streak) 天")
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
                    Text("少")
                        .font(.system(size: 9)).foregroundColor(.secondary)
                    ForEach(coloringPalette.indices, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 1.5).fill(coloringPalette[i]).frame(width: 9, height: 9)
                    }
                    Text("多")
                        .font(.system(size: 9)).foregroundColor(.secondary)
                }
            }
        }
        .padding(6)
    }
}

struct TTCHeatmapWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTHeatmapWidget", provider: Provider()) { entry in
            widgetBackground(HeatmapWidgetView(entry: entry))
        }
        .configurationDisplayName("完成热力")
        .description("近 13 周每日完成热力图，GitHub 风格")
        .supportedFamilies([.systemLarge])
    }
}

// ── 完成概览（small：完成率 + 连续天数 / medium：加近 7 天小柱图） ─────

struct StatsWidgetView: View {
    var entry: TodayEntry
    var medium: Bool = false

    var body: some View {
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
                Text("完成概览")
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
            Text("已完成 \(done) / 共 \(total) 项")
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
        StaticConfiguration(kind: "TTStatsWidget", provider: Provider()) { entry in
            widgetBackground(StatsWidgetView(entry: entry))
        }
        .configurationDisplayName("完成概览")
        .description("待办完成率与连续打卡")
        .supportedFamilies([.systemSmall])
    }
}

struct TTCStatsMediumWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "TTStatsMediumWidget", provider: Provider()) { entry in
            widgetBackground(StatsWidgetView(entry: entry, medium: true))
        }
        .configurationDisplayName("完成统计")
        .description("完成率 + 连续打卡 + 近 7 天走势")
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
        let habits = entry.snap?.habits ?? []
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.pink)
                Text("今日打卡")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                let doneCount = habits.filter(\.done).count
                Text("\(doneCount)/\(habits.count)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            if habits.isEmpty {
                Text(snapEmptyText(entry.snap) == "暂无数据" ? "暂无重复待办，去建一条每日打卡吧" : snapEmptyText(entry.snap))
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
        StaticConfiguration(kind: "TTCHabitWidget", provider: Provider()) { entry in
            widgetBackground(HabitWidgetView(entry: entry))
        }
        .configurationDisplayName("今日打卡")
        .description("重复待办清单，iOS 17+ 可直接点勾完成")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// 一键打卡（small）：第一项未完成的打卡，大按钮一键完成
struct QuickCheckWidgetView: View {
    var entry: TodayEntry

    var body: some View {
        let habits = (entry.snap?.habits ?? []).filter { !$0.done }
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: "bolt.circle.fill")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.orange)
                Text("一键打卡")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                let remaining = habits.count
                if remaining > 1 {
                    Text("还剩 \(remaining) 项")
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
                            Label("打卡", systemImage: "checkmark")
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
                    Text("长按小组件打开 App 打卡")
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                    Spacer(minLength: 0)
                }
            } else {
                Text(entry.snap == nil ? "打开 App 同步数据" : "今日打卡全部完成 🎉")
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
        StaticConfiguration(kind: "TTCQuickCheckWidget", provider: Provider()) { entry in
            widgetBackground(QuickCheckWidgetView(entry: entry))
        }
        .configurationDisplayName("一键打卡")
        .description("一项点击完成今日打卡（iOS 17+）")
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
